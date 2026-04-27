import { readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const resultsDir = process.env.CI_RESULTS_DIR || '/results';
const branch = process.env.FIBE_BRANCH || '';
const repositoryLabel = process.env.FIBE_REPOSITORY_LABEL || 'fibegg/fibe-agent';
const expectedSteps = (process.env.CI_EXPECTED_STEPS || '')
  .split(/\s+/)
  .filter(Boolean);
const resultWaitTimeoutMs = Number(process.env.CI_RESULTS_WAIT_TIMEOUT_MS || 7_200_000);
const resultWaitIntervalMs = Number(process.env.CI_RESULTS_WAIT_INTERVAL_MS || 1_000);

const imageStepLabels = {
  'ci-build-gemini': 'Gemini',
  'ci-build-claude': 'Claude Code',
  'ci-build-codex': 'OpenAI Codex',
  'ci-build-opencode': 'OpenCode',
  'ci-build-cursor': 'Cursor',
};

function escapeSlackText(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function notifySlack(notification) {
  if (!process.env.SLACK_WEBHOOK_URL) {
    console.log('--> SLACK_WEBHOOK_URL is not set; printing notification to stdout');
    console.log(notification.text);
    return;
  }

  try {
    const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: notification.text, blocks: notification.blocks }),
    });
    if (!response.ok) {
      console.log(`WARNING: Failed to notify Slack webhook: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`WARNING: Failed to notify Slack webhook: ${error.message}`);
  }
}

function decodeOutput(encoded) {
  if (!encoded) {
    return '';
  }
  return Buffer.from(encoded, 'base64').toString('utf8');
}

async function waitForExpectedResults() {
  if (expectedSteps.length === 0) {
    return [];
  }

  const deadline = Date.now() + resultWaitTimeoutMs;
  let lastWaitingLog = 0;

  while (Date.now() < deadline) {
    const missing = expectedSteps.filter((step) => !existsSync(path.join(resultsDir, `${step}.json`)));
    if (missing.length === 0) {
      return [];
    }

    if (Date.now() - lastWaitingLog > 30_000) {
      console.log(`--> ci-results-notify waiting for result file(s): ${missing.join(', ')}`);
      lastWaitingLog = Date.now();
    }

    await sleep(resultWaitIntervalMs);
  }

  return expectedSteps.filter((step) => !existsSync(path.join(resultsDir, `${step}.json`)));
}

function printFailurePayload(payload) {
  console.log('---- Begin CI Failure Payload ----');
  console.log(payload);
  console.log('---- End CI Failure Payload ----');
}

async function collectVerifiedImagePulls(summary, detail) {
  const imageSteps = ['ci-build-gemini', 'ci-build-claude', 'ci-build-codex', 'ci-build-opencode', 'ci-build-cursor'];
  const pulls = [];
  let missingImages = 0;

  summary.push('', 'Verified Image Pulls:');

  for (const imageStep of imageSteps) {
    const imageFile = path.join(resultsDir, 'images', `${imageStep}.txt`);
    if (!existsSync(imageFile)) {
      missingImages += 1;
      summary.push(`- ${imageStep}: missing verified image reference`);
      detail.push(
        `---- ${imageStep}: missing verified image reference ----`,
        `The build step passed, but it did not write ${imageFile}.`,
        'This means the notifier cannot prove the SHA image was pushed and verified.',
        '',
      );
      continue;
    }

    const imageRef = (await readFile(imageFile, 'utf8')).trim().split(/\r?\n/)[0];
    const label = imageStepLabels[imageStep] || imageStep;
    const command = `docker pull ${imageRef}`;
    pulls.push({ label, command });
    summary.push(`- ${label}: ${command}`);
  }

  return { ok: missingImages === 0, pulls };
}

async function uploadFailurePayload(payload) {
  if (!process.env.DPASTE_TOKEN) {
    console.log('--> DPASTE_TOKEN is not set; printing failure payload to stdout');
    printFailurePayload(payload);
    return '';
  }

  try {
    const form = new FormData();
    form.append('content', payload);
    form.append('expiry_days', '1');

    const response = await fetch('https://dpaste.com/api/v2/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.DPASTE_TOKEN}` },
      body: form,
    });

    if (!response.ok) {
      console.log(`WARNING: Dpaste upload failed: ${response.status} ${response.statusText}`);
      printFailurePayload(payload);
      return '';
    }

    return (await response.text()).trim();
  } catch (error) {
    console.log(`WARNING: Dpaste upload failed: ${error.message}`);
    printFailurePayload(payload);
    return '';
  }
}

const summary = ['Fibe Agent CI results', `Branch: ${branch}`, '', 'Service Results:'];
const detail = [];
let failures = 0;
const missingExpectedResults = await waitForExpectedResults();

const resultFiles = existsSync(resultsDir)
  ? (await readdir(resultsDir)).filter((file) => file.endsWith('.json')).sort()
  : [];

if (missingExpectedResults.length > 0) {
  failures += missingExpectedResults.length;
  for (const service of missingExpectedResults) {
    summary.push(`- ${service}: missing result (exit code -1)`);
    detail.push(`---- ${service}: missing result (exit code -1) ----`);
    detail.push(`The service did not produce ${path.join(resultsDir, `${service}.json`)} before the notifier timeout.`);
    detail.push('');
  }
}

if (resultFiles.length === 0 && missingExpectedResults.length === 0) {
  failures += 1;
  summary.push('- unknown: missing all CI result files');
  detail.push('No CI result files were produced.', `Results directory: ${resultsDir}`);
} else {
  for (const file of resultFiles) {
    const resultFile = path.join(resultsDir, file);
    const result = JSON.parse(await readFile(resultFile, 'utf8'));
    const service = result.service || path.basename(file, '.json');
    const status = result.status || 'unknown';
    const exitCode = result.exit_code ?? 0;

    summary.push(`- ${service}: ${status} (exit code ${exitCode})`);

    if (status !== 'passed') {
      failures += 1;
      detail.push(`---- ${service}: ${status} (exit code ${exitCode}) ----`);
      detail.push(decodeOutput(result.output_base64).split(/\r?\n/).slice(-1000).join('\n') || '(no captured output)');
      detail.push('');
    }
  }
}

let imagePulls = [];
if (failures === 0) {
  const imageResult = await collectVerifiedImagePulls(summary, detail);
  imagePulls = imageResult.pulls;
  if (!imageResult.ok) {
    failures += 1;
  }
}

console.log(summary.join('\n'));

if (failures === 0) {
  const formattedPulls = imagePulls.map(({ label, command }) => `- ${label}\n  ${command}`).join('\n');
  const escapedRepositoryLabel = escapeSlackText(repositoryLabel);
  const escapedBranch = escapeSlackText(branch);
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*[${escapedRepositoryLabel}]* build for branch \`${escapedBranch}\` is ready`,
      },
    },
    { type: 'divider' },
    ...imagePulls.map(({ label, command }) => ({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${escapeSlackText(label)}*\n\`${escapeSlackText(command)}\``,
      },
    })),
  ];

  await notifySlack({
    text: `[${repositoryLabel}] build for branch ${branch} is ready:\n\n${formattedPulls}`,
    blocks,
  });
  process.exit(0);
}

const failedServiceError = `${summary.join('\n')}\n\n${detail.join('\n')}`;
const dpasteUrl = await uploadFailurePayload(failedServiceError);

if (dpasteUrl) {
  await notifySlack({
    text: `[${repositoryLabel}] build for branch ${branch} failed\n- Logs: ${dpasteUrl}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*[${escapeSlackText(repositoryLabel)}]* build for branch \`${escapeSlackText(branch)}\` failed`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Logs:*\n<${escapeSlackText(dpasteUrl)}|Open Dpaste failure logs>`,
        },
      },
    ],
  });
} else {
  await notifySlack({
    text: `[${repositoryLabel}] build for branch ${branch} failed\n- Logs: CI stdout`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*[${escapeSlackText(repositoryLabel)}]* build for branch \`${escapeSlackText(branch)}\` failed`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Logs:*\nCI stdout',
        },
      },
    ],
  });
}

await rm('/tmp/ci-done', { force: true }).catch(() => {});
process.exit(1);

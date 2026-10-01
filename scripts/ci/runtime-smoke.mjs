#!/usr/bin/env node
// Run inside the built image as node. No provider credentials or external calls.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';

function command(binary, args = ['--version']) {
  const result = spawnSync(binary, args, { encoding: 'utf8', timeout: 30_000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${binary}: ${result.stderr}`);
  console.log(`${binary}: ${(result.stdout || result.stderr).split('\n')[0]}`);
}

async function mcp(binary, args = [], env = {}) {
  const child = spawn(binary, args, { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '';
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const pending = new Map();
  child.stdout.on('data', chunk => {
    buffer += chunk;
    while (buffer.includes('\n')) {
      const end = buffer.indexOf('\n');
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      try {
        const response = JSON.parse(line);
        pending.get(response.id)?.(response);
      } catch { /* Startup text is checked by the handshake deadline. */ }
    }
  });
  function request(id, method, params) {
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => { pending.delete(id); reject(new Error(`${binary} ${method} timed out: ${stderr}`)); }, 30_000);
      pending.set(id, response => { clearTimeout(deadline); pending.delete(id); resolve(response); });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) })}\n`);
    });
  }
  try {
    const initialized = await request(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'fibe-runtime-smoke', version: '1' } });
    assert.ok(initialized.result?.serverInfo, `${binary} initialize failed: ${JSON.stringify(initialized)}`);
    child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    const listed = await request(2, 'tools/list');
    assert.ok(listed.result?.tools?.length > 0, `${binary} tools/list failed: ${JSON.stringify(listed)}`);
    console.log(`${binary}: MCP handshake and ${listed.result.tools.length} tools`);
  } finally { child.stdin.end(); child.kill('SIGTERM'); }
}

for (const binary of ['node', 'bun', 'docker', 'gh', 'uv', 'uvx', 'deno', 'node-gyp']) command(binary);
command('fibe', ['version']);
command('pdftotext', ['-v']);
command('qpdf', ['--version']);
command('pdfgrep', ['--version']);
command('mutool', ['-v']);
command('github-mcp-server', ['--version']);
command('gitea-mcp', ['--help']);
command('playwright-mcp', ['--version']);
const require = createRequire('/app/package.json');
const pty = require('node-pty');
await new Promise((resolve, reject) => {
  const terminal = pty.spawn('sh', ['-c', 'printf fibe-pty-ok'], { cwd: '/tmp', env: process.env });
  let output = '';
  terminal.onData(data => { output += data; });
  terminal.onExit(({ exitCode }) => { try { assert.equal(exitCode, 0); assert.ok(output.includes('fibe-pty-ok')); resolve(); } catch (error) { reject(error); } });
});
console.log('node-pty: terminal spawn and output');
await import(require.resolve('@anthropic-ai/claude-agent-sdk'));
console.log('Claude Agent SDK: runtime module loads');
const { chromium } = createRequire('/usr/local/lib/node_modules/@playwright/mcp/package.json')('playwright');
for (const options of [{}, { executablePath: process.env.CHROME_BIN }]) {
  const browser = await chromium.launch({ ...options, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent('<button onclick="this.textContent=\'clicked\'">Click</button>');
    await page.getByRole('button').click();
    assert.equal(await page.getByRole('button').textContent(), 'clicked');
    console.log(`Playwright: browser click via ${options.executablePath ?? 'bundled Chromium'}`);
  } finally { await browser.close(); }
}
await mcp('mcp-github', [], { GITHUB_PERSONAL_ACCESS_TOKEN: 'audit-placeholder' });
await mcp('gitea-mcp', [], { GITEA_ACCESS_TOKEN: 'audit-placeholder', GITEA_HOST: 'http://127.0.0.1:1' });
await mcp('playwright-mcp', ['--headless', '--no-sandbox']);

let authorizationSeen = false;
const remote = createServer(async (req, res) => {
  if (req.method === 'GET') { res.writeHead(405).end(); return; }
  if (req.method === 'DELETE') { res.writeHead(200).end(); return; }
  authorizationSeen ||= req.headers.authorization === 'Bearer audit-placeholder';
  let body = '';
  for await (const chunk of req) body += chunk;
  const request = JSON.parse(body);
  if (request.id === undefined) { res.writeHead(202).end(); return; }
  const result = request.method === 'initialize'
    ? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'fibe-audit-local', version: '1' } }
    : { tools: [{ name: 'audit_echo', description: 'Local test tool', inputSchema: { type: 'object', properties: {} } }] };
  res.writeHead(200, { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'fibe-audit' }).end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
});
await new Promise(resolve => remote.listen(0, '127.0.0.1', resolve));
try {
  const port = remote.address().port;
  await mcp('mcp-remote', [`http://127.0.0.1:${port}/mcp`, '--allow-http', '--header', 'Authorization:Bearer audit-placeholder']);
  assert.ok(authorizationSeen, 'mcp-remote dropped Authorization header');
  console.log('mcp-remote: HTTP bridge preserves authentication header');
} finally { remote.closeAllConnections(); await new Promise(resolve => remote.close(resolve)); }
console.log('Runtime tools smoke passed');

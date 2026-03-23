const REPO_URL = 'https://github.com/fibegg/fibe-agent';
const VERSION = `v${__APP_VERSION__}`;

const GOLD = '#c2956b';
const CREAM = '#e8d5b7';
const DIM = '#8892a0';

const banner = `
%c
  ╔═══════════════════════════════════════════╗
  ║   ███████╗██╗██████╗ ███████╗            ║
  ║   ██╔════╝██║██╔══██╗██╔════╝            ║
  ║   █████╗  ██║██████╔╝█████╗              ║
  ║   ██╔══╝  ██║██╔══██╗██╔══╝              ║
  ║   ██║     ██║██████╔╝███████╗            ║
  ║   ╚═╝     ╚═╝╚═════╝ ╚══════╝            ║
  ╚═══════════════════════════════════════════╝
%c  ▶ fibegg  ·  fibe
%c  ${VERSION}
%c
  Your future development

  %cREPO:%c ${REPO_URL}
`;

export function logConsoleBanner(): void {
  console.log(
    banner,
    `color: ${GOLD}; font-family: monospace; font-size: 10px; line-height: 1.2; letter-spacing: 1px; text-shadow: 0 0 8px ${GOLD}, 0 0 12px ${GOLD};`,
    `color: ${CREAM}; font-family: monospace; font-size: 12px; font-weight: bold; text-shadow: 0 0 6px ${CREAM};`,
    `color: ${DIM}; font-family: monospace; font-size: 11px;`,
    `color: ${DIM}; font-family: monospace; font-size: 11px;`,
    `color: ${DIM}; font-family: monospace;`,
    `color: ${GOLD}; font-family: monospace; text-decoration: underline; cursor: pointer;`,
  );
}

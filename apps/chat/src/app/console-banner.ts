const REPO_URL = 'https://github.com/fibegg/phoenix-agent-oauth';
const VERSION = `v${__APP_VERSION__}`;

const VIOLET = '#7c3aed';
const CYAN = '#22d3ee';
const DIM = '#8892a0';

const banner = `
%c
  ╔════════════════════════════════════════════════════════════╗
  ║   ██████╗ ██╗  ██╗ ██████╗ ███████╗███╗   ██╗██╗██╗  ██╗   ║
  ║   ██╔══██╗██║  ██║██╔═══██╗██╔════╝████╗  ██║██║╚██╗██╔╝   ║
  ║   ██████╔╝███████║██║   ██║█████╗  ██╔██╗ ██║██║ ╚███╔╝    ║
  ║   ██╔═══╝ ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║██║ ██╔██╗    ║
  ║   ██║     ██║  ██║╚██████╔╝███████╗██║ ╚████║██║██╔╝ ██║   ║
  ║   ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝   ║
  ╚════════════════════════════════════════════════════════════╝
%c  ▶ fibegg  ·  Phoenix
%c  ${VERSION}
%c
  Your future development

  %cREPO:%c ${REPO_URL}
`;

export function logConsoleBanner(): void {
  console.log(
    banner,
    `color: ${VIOLET}; font-family: monospace; font-size: 10px; line-height: 1.2; letter-spacing: 1px; text-shadow: 0 0 8px ${VIOLET}, 0 0 12px ${VIOLET};`,
    `color: ${CYAN}; font-family: monospace; font-size: 12px; font-weight: bold; text-shadow: 0 0 6px ${CYAN};`,
    `color: ${DIM}; font-family: monospace; font-size: 11px;`,
    `color: ${DIM}; font-family: monospace; font-size: 11px;`,
    `color: ${DIM}; font-family: monospace;`,
    `color: ${VIOLET}; font-family: monospace; text-decoration: underline; cursor: pointer;`,
  );
}

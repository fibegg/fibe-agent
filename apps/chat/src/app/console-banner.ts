const REPO_URL = 'https://github.com/fibegg/fibe-agent';
const VERSION = `v${__APP_VERSION__}`;

const THINKING_BLUE = '#0ea5e9';
const FIBE_GREEN = '#79d44e';
const DIM = '#8892a0';

const banner = `
%c  ╔══════════════════════════════════════╗
%c  ║   %c███████╗██╗██████╗ ███████╗%c    ║
%c  ║   %c██╔════╝██║██╔══██╗██╔════╝%c    ║
%c  ║   %c█████╗  ██║██████╔╝█████╗  %c    ║
%c  ║   %c██╔══╝  ██║██╔══██╗██╔══╝  %c    ║
%c  ║   %c██║     ██║██████╔╝███████╗%c    ║
%c  ║   %c╚═╝     ╚═╝╚═════╝ ╚══════╝%c    ║
%c  ╚══════════════════════════════════════╝
%c  ▶ fibegg  ·  fibe
%c  ${VERSION}
%c
  Your future development

  %cREPO:%c ${REPO_URL}
`;

export function logConsoleBanner(): void {
  const borderStyle = `color: ${THINKING_BLUE}; font-family: monospace; font-size: 10px; line-height: 1.2; letter-spacing: 1px; text-shadow: 0 0 8px ${THINKING_BLUE}, 0 0 12px ${THINKING_BLUE};`;
  const logoStyle = `color: ${FIBE_GREEN}; font-family: monospace; font-size: 10px; line-height: 1.2; letter-spacing: 1px; text-shadow: 0 0 12px ${FIBE_GREEN};`;
  
  console.log(
    banner,
    borderStyle,
    borderStyle, logoStyle, borderStyle,
    borderStyle, logoStyle, borderStyle,
    borderStyle, logoStyle, borderStyle,
    borderStyle, logoStyle, borderStyle,
    borderStyle, logoStyle, borderStyle,
    borderStyle, logoStyle, borderStyle,
    borderStyle,
    `color: ${FIBE_GREEN}; font-family: monospace; font-size: 12px; font-weight: bold; text-shadow: 0 0 6px ${FIBE_GREEN};`,
    `color: ${DIM}; font-family: monospace; font-size: 11px;`,
    `color: ${DIM}; font-family: monospace; font-size: 11px;`,
    `color: ${FIBE_GREEN}; font-family: monospace; font-size: 11px; font-weight: bold;`,
    `color: ${THINKING_BLUE}; font-family: monospace; font-size: 11px; text-decoration: underline; cursor: pointer;`,
  );
}

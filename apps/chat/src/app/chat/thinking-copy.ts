const DEFAULT_LINES = [
  'Consulting the phoenix...',
  'Stoking the flames...',
  'Gathering stardust...',
  'Connecting neurons...',
  'Brewing ideas...',
  'Scanning the void...',
  'Polishing the crystal ball...',
  'Asking the oracle...',
  'Warming up the engines...',
  'Following the spark...',
];

const EASTER_EGG_TRIGGERS: { pattern: RegExp | ((s: string) => boolean); lines: string[] }[] = [
  {
    pattern: /\bphoenix\b/i,
    lines: [
      'The phoenix is rising from the ashes...',
      'Channeling fire and renewal...',
      'Feathers aflame with inspiration...',
    ],
  },
  {
    pattern: /\b(42|answer to life)\b/i,
    lines: [
      'Computing the ultimate answer...',
      'Checking the Guide...',
      'Don\'t panic. Almost there...',
    ],
  },
  {
    pattern: /\b(coffee|tea|espresso)\b/i,
    lines: [
      'Taking a sip of inspiration...',
      'Brewing a fresh thought...',
      'Caffeine-powered thinking...',
    ],
  },
  {
    pattern: /\b(take your time|no rush|whenever)\b/i,
    lines: [
      'Enjoying the moment...',
      'No rush. Savouring the process...',
      'Taking the scenic route...',
    ],
  },
  {
    pattern: /\b(think|think hard|really think)\b/i,
    lines: [
      'Engaging maximum brain cells...',
      'Activating deep thought mode...',
      'Wrinkling the brain...',
    ],
  },
  {
    pattern: /^hello\s*!?\s*$/i,
    lines: [
      'Waving back...',
      'Hello to you too...',
      'Raising a wing in greeting...',
    ],
  },
  {
    pattern: /\bjoke\b/i,
    lines: [
      'Searching the joke database...',
      'Picking the right punchline...',
      'Checking if this one lands...',
    ],
  },
  {
    pattern: /\b(secret|easter egg)\b/i,
    lines: [
      'You found the secret...',
      'Shh. Loading special mode...',
      'Something fun is loading...',
    ],
  },
  {
    pattern: /\b(magic|abracadabra)\b/i,
    lines: [
      'Waving the wand...',
      'Consulting the spellbook...',
      'Poof! Thinking magically...',
    ],
  },
];

export function getThinkingLines(lastUserMessage: string | null | undefined): string[] {
  if (!lastUserMessage || !lastUserMessage.trim()) return DEFAULT_LINES;
  const trimmed = lastUserMessage.trim();
  for (const { pattern, lines } of EASTER_EGG_TRIGGERS) {
    const match =
      typeof pattern === 'function' ? pattern(trimmed) : pattern.test(trimmed);
    if (match) return lines;
  }
  return DEFAULT_LINES;
}


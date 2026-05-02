import type { TranslationKey } from '../i18n';

const DEFAULT_LINES = [
  'Gathering thoughts...',
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

const DEFAULT_LINE_KEYS: TranslationKey[] = [
  'thinking.default.gatheringThoughts',
  'thinking.default.stokingFlames',
  'thinking.default.gatheringStardust',
  'thinking.default.connectingNeurons',
  'thinking.default.brewingIdeas',
  'thinking.default.scanningVoid',
  'thinking.default.polishingCrystalBall',
  'thinking.default.askingOracle',
  'thinking.default.warmingEngines',
  'thinking.default.followingSpark',
];

type ThinkingLineSet = {
  keys: TranslationKey[];
  lines: string[];
};

const DEFAULT_LINE_SET: ThinkingLineSet = {
  keys: DEFAULT_LINE_KEYS,
  lines: DEFAULT_LINES,
};

const EASTER_EGG_TRIGGERS: Array<{ pattern: RegExp | ((s: string) => boolean); lineSet: ThinkingLineSet }> = [
  {
    pattern: /\b(42|answer to life)\b/i,
    lineSet: {
      keys: ['thinking.ultimate.computing', 'thinking.ultimate.checkingGuide', 'thinking.ultimate.dontPanic'],
      lines: [
        'Computing the ultimate answer...',
        'Checking the Guide...',
        'Don\'t panic. Almost there...',
      ],
    },
  },
  {
    pattern: /\b(coffee|tea|espresso)\b/i,
    lineSet: {
      keys: ['thinking.coffee.sip', 'thinking.coffee.brewing', 'thinking.coffee.powered'],
      lines: [
        'Taking a sip of inspiration...',
        'Brewing a fresh thought...',
        'Caffeine-powered thinking...',
      ],
    },
  },
  {
    pattern: /\b(take your time|no rush|whenever)\b/i,
    lineSet: {
      keys: ['thinking.noRush.moment', 'thinking.noRush.process', 'thinking.noRush.scenic'],
      lines: [
        'Enjoying the moment...',
        'No rush. Savouring the process...',
        'Taking the scenic route...',
      ],
    },
  },
  {
    pattern: /\b(think|think hard|really think)\b/i,
    lineSet: {
      keys: ['thinking.deep.brainCells', 'thinking.deep.mode', 'thinking.deep.wrinkling'],
      lines: [
        'Engaging maximum brain cells...',
        'Activating deep thought mode...',
        'Wrinkling the brain...',
      ],
    },
  },
  {
    pattern: /^hello\s*!?\s*$/i,
    lineSet: {
      keys: ['thinking.hello.waving', 'thinking.hello.reply', 'thinking.hello.greeting'],
      lines: [
        'Waving back...',
        'Hello to you too...',
        'Raising a wing in greeting...',
      ],
    },
  },
  {
    pattern: /\bjoke\b/i,
    lineSet: {
      keys: ['thinking.joke.database', 'thinking.joke.punchline', 'thinking.joke.lands'],
      lines: [
        'Searching the joke database...',
        'Picking the right punchline...',
        'Checking if this one lands...',
      ],
    },
  },
  {
    pattern: /\b(secret|easter egg)\b/i,
    lineSet: {
      keys: ['thinking.secret.found', 'thinking.secret.loading', 'thinking.secret.special'],
      lines: [
        'You found the secret...',
        'Shh. Loading special mode...',
        'Something fun is loading...',
      ],
    },
  },
  {
    pattern: /\b(magic|abracadabra)\b/i,
    lineSet: {
      keys: ['thinking.magic.wand', 'thinking.magic.spellbook', 'thinking.magic.poof'],
      lines: [
        'Waving the wand...',
        'Consulting the spellbook...',
        'Poof! Thinking magically...',
      ],
    },
  },
];

function selectThinkingLineSet(lastUserMessage: string | null | undefined): ThinkingLineSet {
  if (!lastUserMessage || !lastUserMessage.trim()) return DEFAULT_LINE_SET;
  const trimmed = lastUserMessage.trim();
  for (const { pattern, lineSet } of EASTER_EGG_TRIGGERS) {
    const match =
      typeof pattern === 'function' ? pattern(trimmed) : pattern.test(trimmed);
    if (match) return lineSet;
  }
  return DEFAULT_LINE_SET;
}

export function getThinkingLines(lastUserMessage: string | null | undefined): string[] {
  return selectThinkingLineSet(lastUserMessage).lines;
}

export function getThinkingLineKeys(lastUserMessage: string | null | undefined): TranslationKey[] {
  return selectThinkingLineSet(lastUserMessage).keys;
}

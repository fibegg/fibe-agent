const MIN_LENGTH_FOR_RECOVERY = 80;
const MIN_LENGTH_FOR_RECOVERY_IN_FENCE = 28;

const FENCED_CODE_BLOCK_RE =
  /```(ts|typescript|js|javascript)\s*\r?\n([\s\S]*?)(?:\r?\n)?```/gi;

function normalizeFenceLang(lang: string): string {
  const l = lang.toLowerCase();
  if (l === 'ts') return 'typescript';
  if (l === 'js') return 'javascript';
  return l;
}

/**
 * Minified or flattened TS/JS often arrives as one physical line. Insert newlines before
 * obvious statement boundaries so markdown can form a proper fenced block after wrapping.
 */
export function recoverDenseCodeNewlines(text: string, minLength = MIN_LENGTH_FOR_RECOVERY): string {
  if (text.includes('\n')) return text;
  if (text.length < minLength) return text;
  let out = text;
  out = out.replace(/;(async\s+function|import|export|const|let|var|type|interface|function|class)\b/g, ';\n$1');
  out = out.replace(/\)\s*;(const|let|var|type|interface|function)\b/g, ');\n$1');
  out = out.replace(/\}\s*(export|async\s+function|function|const|let|type|interface|class)\b/g, '}\n$1');
  return out;
}

/**
 * When the user already wrapped code in ```ts but pasted a single long line inside,
 * expand statement boundaries so Prism and layout get real newlines (matches file-viewer readability).
 * Normalizes ```ts / ```js to ```typescript / ```javascript so Prism matches the file viewer.
 */
export function recoverDenseCodeNewlinesInFences(text: string): string {
  return text.replace(FENCED_CODE_BLOCK_RE, (full, lang: string, body: string) => {
    const trimmed = body.trim();
    const lg = normalizeFenceLang(lang);
    const openLang = lang.toLowerCase();

    if (trimmed.length < MIN_LENGTH_FOR_RECOVERY_IN_FENCE) {
      return openLang !== lg ? `\`\`\`${lg}\n${body}\n\`\`\`` : full;
    }

    const nonEmptyLines = trimmed.split('\n').filter((l) => l.trim().length > 0).length;
    if (nonEmptyLines > 1) {
      return openLang !== lg ? `\`\`\`${lg}\n${trimmed}\n\`\`\`` : full;
    }

    const recovered = recoverDenseCodeNewlines(trimmed, MIN_LENGTH_FOR_RECOVERY_IN_FENCE);
    const bodyOut = recovered === trimmed ? trimmed : recovered;
    return `\`\`\`${lg}\n${bodyOut}\n\`\`\``;
  });
}

function startsWithFencedMarkdown(s: string): boolean {
  return /^\s*```[\s\S]*/.test(s);
}

function looksLikeBareTypeScriptSnippet(s: string): boolean {
  const t = s.trim();
  if (t.length < MIN_LENGTH_FOR_RECOVERY) return false;
  if (
    !/^(import\s|export\s|const\s|let\s|var\s|type\s|interface\s|function\s|async\s+function\s|\/\/\/)/m.test(t)
  ) {
    return false;
  }
  const semiCount = (t.match(/;/g) ?? []).length;
  if (semiCount >= 2) return true;
  return /\bRecord<|typeof\s|as\s+const\b|interface\s+\w/.test(t);
}

/**
 * Renders user-authored text that is dense code (no markdown fence, newlines lost) as a
 * Telegram-style code block. Does not change stored/copy payload — use only before renderMarkdown.
 */
export function prepareUserMessageMarkdownForRender(text: string): string {
  if (!text) return text;

  const fencedHandled = recoverDenseCodeNewlinesInFences(text);
  if (startsWithFencedMarkdown(fencedHandled)) return fencedHandled;

  const recovered = recoverDenseCodeNewlines(fencedHandled);
  if (!looksLikeBareTypeScriptSnippet(recovered)) return fencedHandled;

  return `\`\`\`typescript\n${recovered}\n\`\`\``;
}

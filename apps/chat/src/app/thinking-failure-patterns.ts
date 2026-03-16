/**
 * Detects phrases in agent thinking that suggest failure (e.g. auth, errors).
 * Used to highlight suspicious segments in the Activity tab so the user can act (e.g. check token).
 */

export type ThinkingSegment = { text: string; suspicious: boolean };

const SUSPICIOUS_PATTERNS: RegExp[] = [
  /\b(but\s+[\w\s]+?\s+fails?)\b/gi,
  /\b(authentication\s+fails?|auth\s+fails?)\b/gi,
  /\b(failed|fails?)\b/gi,
  /\b(error|errors?)\b/gi,
  /\b(couldn't|could not|can't|cannot)\s+(\w[\w\s]*?)(?=[.!]|$)/gi,
  /\b(unable to\s+\w[\w\s]*?)(?=[.!]|$)/gi,
  /\b(permission denied|access denied|not authenticated)\b/gi,
  /\b(invalid token|token expired|token invalid)\b/gi,
  /\b(401|403)\b/g,
];

function collectRanges(text: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  for (const re of SUSPICIOUS_PATTERNS) {
    const copy = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = copy.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (!ranges.some((r) => start < r.end && end > r.start)) ranges.push({ start, end });
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ start: r.start, end: r.end });
  }
  return merged;
}

export function parseThinkingSegments(text: string): ThinkingSegment[] {
  if (typeof text !== 'string') return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  const ranges = collectRanges(trimmed);
  if (ranges.length === 0) return [{ text: trimmed, suspicious: false }];

  const segments: ThinkingSegment[] = [];
  let pos = 0;
  for (const { start, end } of ranges) {
    if (start > pos) segments.push({ text: trimmed.slice(pos, start), suspicious: false });
    segments.push({ text: trimmed.slice(start, end), suspicious: true });
    pos = end;
  }
  if (pos < trimmed.length) segments.push({ text: trimmed.slice(pos), suspicious: false });
  return segments;
}

export const SUSPICIOUS_TOOLTIP = 'Possible failure — check token or access';

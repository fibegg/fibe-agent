/**
 * Detects phrases in agent thinking: failure, agreement, uncertainty, questions.
 * Used to highlight segments in the Activity tab.
 */

export type ThinkingSegment = { text: string; suspicious: boolean };

export type ThinkingSegmentKind =
  | 'normal'
  | 'suspicious'
  | 'agreement'
  | 'uncertainty'
  | 'question';

export type ThinkingSegmentWithKind = { text: string; kind: ThinkingSegmentKind };

const KIND_PRIORITY: Record<ThinkingSegmentKind, number> = {
  normal: 0,
  question: 1,
  uncertainty: 2,
  agreement: 3,
  suspicious: 4,
};

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

const AGREEMENT_PATTERNS: RegExp[] = [
  /\b(good point|good catch|good call)\b/gi,
  /\b(I agree|we agree|totally agree|couldn't agree more)\b/gi,
  /\b(makes sense|that makes sense|makes perfect sense)\b/gi,
  /\b(you're right|you are right|you’re right)\b/gi,
  /\b(exactly|that's exactly right|that is exactly right)\b/gi,
  /\b(fair point|fair enough)\b/gi,
  /\b(good idea|great idea)\b/gi,
  /\b(correct|that's correct|that is correct)\b/gi,
  /\b(agreed|well said|nice catch)\b/gi,
  /\b(absolutely|that's right|that is right)\b/gi,
  /\b(spot on|you're spot on)\b/gi,
  /\b(I see your point|I see what you mean)\b/gi,
  /\b(sounds good|that works)\b/gi,
  /\b(proposition\s+(is|makes)\s+sense)\b/gi,
  /\b(agree\s+with\s+(your|that)\s+point)\b/gi,
  /\b(agree\s+with\s+your\s+(proposition|suggestion|thought))\b/gi,
  /\b(I\s+agree\s+with\s+(you|that|your))\b/gi,
  /\b(agreeing\s+with\s+your)\b/gi,
  /\b(your\s+point\s+(is|makes)\s+sense)\b/gi,
  /\b(your\s+(thought|idea)\s+(makes sense|is good))\b/gi,
  /\b(that\s+point\s+(makes sense|is right|is correct))\b/gi,
  /\b(your\s+suggestion\s+(makes sense|is good|works))\b/gi,
  /\b(this\s+is\s+exactly\s+the\s+right\s+(solution|approach|way))\b/gi,
  /\b(exactly\s+the\s+right\s+(solution|approach|way))\b/gi,
  /\b(this\s+is\s+the\s+right\s+(solution|approach|way))\b/gi,
];

const UNCERTAINTY_PATTERNS: RegExp[] = [
  /\b(I'm not sure|I am not sure)\b/gi,
  /\b(unclear|it's unclear|it is unclear)\b/gi,
  /\b(perhaps|maybe)\b/gi,
  /\b(might be|could be)\b/gi,
  /\b(I think\s+|I believe\s+)/gi,
  /\b(not certain|uncertain)\b/gi,
  /\b(not sure if|unsure)\b/gi,
  /\b(possibly|presumably)\b/gi,
];

const QUESTION_PATTERNS: RegExp[] = [
  /\b(should I\s|shall I\s)/gi,
  /\b(do you want (me to)?\s)/gi,
  /\b(would you prefer\s)/gi,
  /\b(can you\s|could you\s)/gi,
  /\b(do you (have a )?preference\b)/gi,
  /\b(which (one|way|approach)\s)/gi,
  /\b(your (input|feedback|thoughts?)\s)/gi,
];

function mergeRanges(
  suspicious: { start: number; end: number }[],
  agreement: { start: number; end: number }[],
  uncertainty: { start: number; end: number }[],
  question: { start: number; end: number }[]
): { start: number; end: number; kind: ThinkingSegmentKind }[] {
  const withKind: { start: number; end: number; kind: ThinkingSegmentKind }[] = [
    ...suspicious.map((r) => ({ ...r, kind: 'suspicious' as const })),
    ...agreement.map((r) => ({ ...r, kind: 'agreement' as const })),
    ...uncertainty.map((r) => ({ ...r, kind: 'uncertainty' as const })),
    ...question.map((r) => ({ ...r, kind: 'question' as const })),
  ].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number; kind: ThinkingSegmentKind }[] = [];
  for (const r of withKind) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
      if (KIND_PRIORITY[r.kind] > KIND_PRIORITY[last.kind]) last.kind = r.kind;
    } else merged.push({ ...r });
  }
  return merged;
}

function collectRangesSimple(text: string, patterns: RegExp[]): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  for (const re of patterns) {
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

  const ranges = collectRangesSimple(trimmed, SUSPICIOUS_PATTERNS);
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

export function parseThinkingSegmentsWithAgreement(text: string): ThinkingSegmentWithKind[] {
  if (typeof text !== 'string') return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  const suspiciousRanges = collectRangesSimple(trimmed, SUSPICIOUS_PATTERNS);
  const agreementRanges = collectRangesSimple(trimmed, AGREEMENT_PATTERNS);
  const uncertaintyRanges = collectRangesSimple(trimmed, UNCERTAINTY_PATTERNS);
  const questionRanges = collectRangesSimple(trimmed, QUESTION_PATTERNS);
  const merged = mergeRanges(
    suspiciousRanges,
    agreementRanges,
    uncertaintyRanges,
    questionRanges
  );
  if (merged.length === 0) return [{ text: trimmed, kind: 'normal' }];

  const segments: ThinkingSegmentWithKind[] = [];
  let pos = 0;
  for (const { start, end, kind } of merged) {
    if (start > pos) segments.push({ text: trimmed.slice(pos, start), kind: 'normal' });
    segments.push({ text: trimmed.slice(start, end), kind });
    pos = end;
  }
  if (pos < trimmed.length) segments.push({ text: trimmed.slice(pos), kind: 'normal' });
  return segments;
}

export const SUSPICIOUS_TOOLTIP = 'Possible failure — check token or access';

export const AGREEMENT_TOOLTIP = 'Agent agrees with you';

export const UNCERTAINTY_TOOLTIP = 'Agent is uncertain — consider clarifying';

export const QUESTION_TOOLTIP = 'Agent is asking for your input';

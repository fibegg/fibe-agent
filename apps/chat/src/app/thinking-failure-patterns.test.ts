import {
  parseThinkingSegments,
  parseThinkingSegmentsWithAgreement,
  SUSPICIOUS_TOOLTIP,
  AGREEMENT_TOOLTIP,
  UNCERTAINTY_TOOLTIP,
  QUESTION_TOOLTIP,
  type ThinkingSegment,
  type ThinkingSegmentWithKind,
} from './thinking-failure-patterns';

describe('parseThinkingSegments', () => {
  it('returns single non-suspicious segment when no patterns match', () => {
    const out = parseThinkingSegments('User wants to get Github username.');
    expect(out).toEqual([{ text: 'User wants to get Github username.', suspicious: false }]);
  });

  it('marks "but ... fails" as suspicious', () => {
    const out = parseThinkingSegments(
      'User wants to get GIthub username... But authentication fails… Let me try.'
    );
    const suspicious = out.filter((s: ThinkingSegment) => s.suspicious);
    expect(suspicious.length).toBeGreaterThan(0);
    expect(suspicious.some((s: ThinkingSegment) => s.text.toLowerCase().includes('authentication fails'))).toBe(true);
  });

  it('marks "error" as suspicious', () => {
    const out = parseThinkingSegments('Something went wrong. Error connecting.');
    expect(out.some((s: ThinkingSegment) => s.suspicious && s.text.toLowerCase().includes('error'))).toBe(true);
  });

  it('marks 401 and 403 as suspicious', () => {
    const out = parseThinkingSegments('Got 401 then 403.');
    expect(out.filter((s: ThinkingSegment) => s.suspicious).map((s: ThinkingSegment) => s.text)).toContain('401');
    expect(out.filter((s: ThinkingSegment) => s.suspicious).map((s: ThinkingSegment) => s.text)).toContain('403');
  });

  it('marks permission denied and access denied as suspicious', () => {
    const out = parseThinkingSegments('Permission denied. Access denied.');
    expect(out.some((s: ThinkingSegment) => s.suspicious && s.text.includes('Permission denied'))).toBe(true);
    expect(out.some((s: ThinkingSegment) => s.suspicious && s.text.includes('Access denied'))).toBe(true);
  });

  it('returns non-suspicious leading and trailing segments around one match', () => {
    const out = parseThinkingSegments('Before. authentication fails After.');
    expect(out[0]).toEqual({ text: 'Before. ', suspicious: false });
    expect(out[1]).toEqual({ text: 'authentication fails', suspicious: true });
    expect(out[2]).toEqual({ text: ' After.', suspicious: false });
  });

  it('returns empty array for empty or whitespace input', () => {
    expect(parseThinkingSegments('')).toEqual([]);
    expect(parseThinkingSegments('   ')).toEqual([]);
  });

  it('returns empty array for null or undefined input', () => {
    expect(parseThinkingSegments(null as unknown as string)).toEqual([]);
    expect(parseThinkingSegments(undefined as unknown as string)).toEqual([]);
  });
});

describe('SUSPICIOUS_TOOLTIP', () => {
  it('is a non-empty string', () => {
    expect(typeof SUSPICIOUS_TOOLTIP).toBe('string');
    expect(SUSPICIOUS_TOOLTIP.length).toBeGreaterThan(0);
  });
});

describe('parseThinkingSegmentsWithAgreement', () => {
  it('returns single normal segment when no patterns match', () => {
    const out = parseThinkingSegmentsWithAgreement('User wants to get Github username.');
    expect(out).toEqual([{ text: 'User wants to get Github username.', kind: 'normal' }]);
  });

  it('marks "good point" as agreement', () => {
    const out = parseThinkingSegmentsWithAgreement('Good point, we should do that.');
    expect(out.some((s: ThinkingSegmentWithKind) => s.kind === 'agreement' && s.text.toLowerCase().includes('good point'))).toBe(
      true
    );
  });

  it('marks "you\'re right" and "makes sense" as agreement', () => {
    const out = parseThinkingSegmentsWithAgreement("You're right. That makes sense.");
    expect(out.some((s: ThinkingSegmentWithKind) => s.kind === 'agreement')).toBe(true);
  });

  it('marks error as suspicious', () => {
    const out = parseThinkingSegmentsWithAgreement('Error connecting.');
    expect(out.some((s: ThinkingSegmentWithKind) => s.kind === 'suspicious' && s.text.toLowerCase().includes('error'))).toBe(
      true
    );
  });

  it('suspicious wins over agreement when overlapping', () => {
    const out = parseThinkingSegmentsWithAgreement('Good point. But authentication fails. Agreed.');
    const kinds = out.map((s: ThinkingSegmentWithKind) => s.kind);
    expect(kinds).toContain('suspicious');
    expect(kinds).toContain('agreement');
  });

  it('marks "I\'m not sure" as uncertainty', () => {
    const out = parseThinkingSegmentsWithAgreement("I'm not sure which approach to take.");
    expect(out.some((s: ThinkingSegmentWithKind) => s.kind === 'uncertainty' && s.text.toLowerCase().includes("i'm not sure"))).toBe(
      true
    );
  });

  it('marks "perhaps" and "maybe" as uncertainty', () => {
    const out = parseThinkingSegmentsWithAgreement('Perhaps we could try. Maybe later.');
    expect(out.some((s: ThinkingSegmentWithKind) => s.kind === 'uncertainty')).toBe(true);
  });

  it('marks "Should I" as question', () => {
    const out = parseThinkingSegmentsWithAgreement('Should I run the tests first?');
    expect(out.some((s: ThinkingSegmentWithKind) => s.kind === 'question' && s.text.toLowerCase().includes('should i'))).toBe(
      true
    );
  });

  it('marks "Would you prefer" as question', () => {
    const out = parseThinkingSegmentsWithAgreement('Would you prefer option A or B?');
    expect(out.some((s: ThinkingSegmentWithKind) => s.kind === 'question')).toBe(true);
  });
});

describe('AGREEMENT_TOOLTIP', () => {
  it('is a non-empty string', () => {
    expect(typeof AGREEMENT_TOOLTIP).toBe('string');
    expect(AGREEMENT_TOOLTIP.length).toBeGreaterThan(0);
  });
});

describe('UNCERTAINTY_TOOLTIP', () => {
  it('is a non-empty string', () => {
    expect(typeof UNCERTAINTY_TOOLTIP).toBe('string');
    expect(UNCERTAINTY_TOOLTIP.length).toBeGreaterThan(0);
  });
});

describe('QUESTION_TOOLTIP', () => {
  it('is a non-empty string', () => {
    expect(typeof QUESTION_TOOLTIP).toBe('string');
    expect(QUESTION_TOOLTIP.length).toBeGreaterThan(0);
  });
});

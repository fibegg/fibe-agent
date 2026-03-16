import { parseThinkingSegments, SUSPICIOUS_TOOLTIP } from './thinking-failure-patterns';

describe('parseThinkingSegments', () => {
  it('returns single non-suspicious segment when no patterns match', () => {
    const out = parseThinkingSegments('User wants to get Github username.');
    expect(out).toEqual([{ text: 'User wants to get Github username.', suspicious: false }]);
  });

  it('marks "but ... fails" as suspicious', () => {
    const out = parseThinkingSegments(
      'User wants to get GIthub username... But authentication fails… Let me try.'
    );
    const suspicious = out.filter((s) => s.suspicious);
    expect(suspicious.length).toBeGreaterThan(0);
    expect(suspicious.some((s) => s.text.toLowerCase().includes('authentication fails'))).toBe(true);
  });

  it('marks "error" as suspicious', () => {
    const out = parseThinkingSegments('Something went wrong. Error connecting.');
    expect(out.some((s) => s.suspicious && s.text.toLowerCase().includes('error'))).toBe(true);
  });

  it('marks 401 and 403 as suspicious', () => {
    const out = parseThinkingSegments('Got 401 then 403.');
    expect(out.filter((s) => s.suspicious).map((s) => s.text)).toContain('401');
    expect(out.filter((s) => s.suspicious).map((s) => s.text)).toContain('403');
  });

  it('marks permission denied and access denied as suspicious', () => {
    const out = parseThinkingSegments('Permission denied. Access denied.');
    expect(out.some((s) => s.suspicious && s.text.includes('Permission denied'))).toBe(true);
    expect(out.some((s) => s.suspicious && s.text.includes('Access denied'))).toBe(true);
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

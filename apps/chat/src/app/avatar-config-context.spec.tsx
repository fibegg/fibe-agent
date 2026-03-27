import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { act } from 'react';
import { AvatarConfigProvider, useAvatarConfig } from './avatar-config-context';


function TestConsumer() {
  const cfg = useAvatarConfig();
  return (
    <div>
      <span data-testid="user">{cfg.userAvatarUrl ?? 'none'}</span>
      <span data-testid="assistant">{cfg.assistantAvatarUrl ?? 'none'}</span>
    </div>
  );
}

describe('AvatarConfigProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('provides undefined defaults before fetch resolves', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {/* never resolves */})));
    const { getByTestId } = render(
      <AvatarConfigProvider>
        <TestConsumer />
      </AvatarConfigProvider>
    );
    expect(getByTestId('user').textContent).toBe('none');
    expect(getByTestId('assistant').textContent).toBe('none');
    vi.unstubAllGlobals();
  });

  it('provides resolved avatar URLs after fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        userAvatarUrl: 'https://avatars.githubusercontent.com/u/3822576?v=4',
        userAvatarBase64: null,
        assistantAvatarUrl: 'https://assistantbot.png',
        assistantAvatarBase64: null,
      }),
    }));

    const { getByTestId } = render(
      <AvatarConfigProvider>
        <TestConsumer />
      </AvatarConfigProvider>
    );

    await act(async () => { await Promise.resolve(); });

    expect(getByTestId('user').textContent).toBe('https://avatars.githubusercontent.com/u/3822576?v=4');
    expect(getByTestId('assistant').textContent).toBe('https://assistantbot.png');
    vi.unstubAllGlobals();
  });

  it('keeps undefined values when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    const { getByTestId } = render(
      <AvatarConfigProvider>
        <TestConsumer />
      </AvatarConfigProvider>
    );

    await act(async () => { await Promise.resolve(); });

    expect(getByTestId('user').textContent).toBe('none');
    expect(getByTestId('assistant').textContent).toBe('none');
    vi.unstubAllGlobals();
  });

  it('keeps undefined values when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const { getByTestId } = render(
      <AvatarConfigProvider>
        <TestConsumer />
      </AvatarConfigProvider>
    );

    await act(async () => { await Promise.resolve(); });

    expect(getByTestId('user').textContent).toBe('none');
    vi.unstubAllGlobals();
  });

  it('resolves base64 over url when both are present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        userAvatarUrl: 'https://example.com/me.png',
        userAvatarBase64: 'PHN2ZyAvPg==',
        assistantAvatarUrl: null,
        assistantAvatarBase64: null,
      }),
    }));

    const { getByTestId } = render(
      <AvatarConfigProvider>
        <TestConsumer />
      </AvatarConfigProvider>
    );

    await act(async () => { await Promise.resolve(); });

    expect(getByTestId('user').textContent).toBe('data:image/svg+xml;base64,PHN2ZyAvPg==');
    vi.unstubAllGlobals();
  });
});

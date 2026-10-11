import { beforeEach, describe, expect, it, vi } from 'vitest';
import indexHtml from '../../index.html?raw';

const bootstrap = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .find((script) => script.includes('chat-theme'));

function hydrate() {
  if (!bootstrap) throw new Error('Missing first-paint theme bootstrap');
  new Function(bootstrap)();
}

beforeEach(() => {
  localStorage.removeItem('chat-theme');
  document.documentElement.removeAttribute('data-theme');
  document.head.innerHTML =
    '<meta name="theme-color"><meta name="apple-mobile-web-app-status-bar-style">';
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true })),
  );
});

describe('first-paint theme', () => {
  it('follows the system without persisting an inferred choice', () => {
    hydrate();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('chat-theme')).toBeNull();
    expect(
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute('content'),
    ).toBe('#fafafa');
  });

  it.each(['halloween', 'dracula', 'midnight', 'contrast'])(
    'migrates %s before the first paint',
    (theme) => {
      localStorage.setItem('chat-theme', theme);
      hydrate();
      expect(document.documentElement.dataset.theme).toBe('dark');
      expect(localStorage.getItem('chat-theme')).toBe('dark');
      expect(
        document
          .querySelector('meta[name="theme-color"]')
          ?.getAttribute('content'),
      ).toBe('#09090b');
    },
  );

  it('migrates winter before the first paint', () => {
    localStorage.setItem('chat-theme', 'winter');
    hydrate();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('chat-theme')).toBe('light');
  });

  it('still paints when browser storage is unavailable', () => {
    const get = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    expect(hydrate).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('light');
    get.mockRestore();
  });
});

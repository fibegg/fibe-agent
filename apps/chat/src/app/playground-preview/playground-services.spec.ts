import { describe, expect, it } from 'vitest';
import { normalizePlaygroundServices, normalizeServiceUrl } from './playground-services';

describe('playground preview services', () => {
  it('normalizes CLI service-url rows', () => {
    expect(normalizePlaygroundServices(['app|https://app.example.test', 'admin|admin.example.test'])).toEqual([
      expect.objectContaining({ name: 'app', url: 'https://app.example.test', source: 'cli' }),
      expect.objectContaining({ name: 'admin', url: 'https://admin.example.test', source: 'cli' }),
    ]);
  });

  it('normalizes parent-provided services and removes duplicates', () => {
    const services = normalizePlaygroundServices(
      [
        { name: 'app', url: 'https://app.example.test' },
        { service: 'app', url: 'https://app.example.test' },
        { service: 'admin', url: 'https://admin.example.test' },
      ],
      'parent',
    );

    expect(services).toHaveLength(2);
    expect(services[0]).toEqual(expect.objectContaining({ name: 'app', source: 'parent' }));
    expect(services[1]).toEqual(expect.objectContaining({ name: 'admin', source: 'parent' }));
  });

  it('infers service names for bare urls', () => {
    expect(normalizePlaygroundServices(['https://frontend.example.test'])[0]).toEqual(
      expect.objectContaining({ name: 'frontend', url: 'https://frontend.example.test' }),
    );
  });

  it('ignores invalid services', () => {
    expect(normalizePlaygroundServices(['app|', { name: 'admin' }, null])).toEqual([]);
  });

  it('adds https to host-only urls', () => {
    expect(normalizeServiceUrl('admin.example.test')).toBe('https://admin.example.test');
  });
});

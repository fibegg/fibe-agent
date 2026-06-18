import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlaygroundServices } from './use-playground-services';

const mockApiRequest = vi.fn();

vi.mock('../api-url', () => ({
  apiRequest: (path: string, options?: RequestInit) => mockApiRequest(path, options),
}));

describe('usePlaygroundServices', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    mockApiRequest.mockResolvedValue({
      ok: true,
      json: async () => ({ urls: [] }),
    });
  });

  it('fetches service urls for the selected playground', async () => {
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        urls: ['api|http://api-alice.phoenix.test', 'frontend|http://alice.phoenix.test'],
      }),
    });

    const { result } = renderHook(() => usePlaygroundServices('alice'));

    await waitFor(() => {
      expect(result.current.services).toHaveLength(2);
    });

    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/playgrounds/urls?playground=alice',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.services.map((service) => [service.name, service.url])).toEqual([
      ['api', 'http://api-alice.phoenix.test'],
      ['frontend', 'http://alice.phoenix.test'],
    ]);
  });

  it('refreshes when the selected playground changes', async () => {
    mockApiRequest
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ urls: ['frontend|http://alice.phoenix.test'] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ urls: ['frontend|http://bob.phoenix.test'] }),
      });

    const { result, rerender } = renderHook(
      ({ playground }) => usePlaygroundServices(playground),
      { initialProps: { playground: 'alice' } },
    );

    await waitFor(() => {
      expect(result.current.services[0]?.url).toBe('http://alice.phoenix.test');
    });

    rerender({ playground: 'bob' });

    await waitFor(() => {
      expect(result.current.services[0]?.url).toBe('http://bob.phoenix.test');
    });

    expect(mockApiRequest).toHaveBeenNthCalledWith(
      1,
      '/api/playgrounds/urls?playground=alice',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockApiRequest).toHaveBeenNthCalledWith(
      2,
      '/api/playgrounds/urls?playground=bob',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

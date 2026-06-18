import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DiffPanel } from './diff-panel';
import { API_PATHS } from '@shared/api-paths';

const mockApiRequest = vi.fn();

vi.mock('../api-url', () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

describe('DiffPanel', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
  });

  it('does not request a repo-less diff before a multi-repo selection', async () => {
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        repos: [
          {
            id: 'backend',
            service: 'api',
            prop: 'backend',
            link_path: '/app/playground/backend',
            target: '/opt/fibe/playgrounds/alice/backend',
            repo_root: '/opt/fibe/playgrounds/alice/backend',
          },
          {
            id: 'frontend',
            service: 'frontend',
            prop: 'frontend',
            link_path: '/app/playground/frontend',
            target: '/opt/fibe/playgrounds/alice/frontend',
            repo_root: '/opt/fibe/playgrounds/alice/frontend',
          },
        ],
      }),
    });

    render(<DiffPanel />);

    await waitFor(() => {
      expect(screen.getByText('Select a repository to view changes.')).toBeTruthy();
    });

    expect(mockApiRequest).toHaveBeenCalledWith(API_PATHS.PLAYGROUNDS_REPOS);
    expect(
      mockApiRequest.mock.calls.some(([path]) => path === API_PATHS.PLAYGROUNDS_DIFF),
    ).toBe(false);
  });
});

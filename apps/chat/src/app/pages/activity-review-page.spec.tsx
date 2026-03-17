import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ActivityReviewPage, type ActivityReviewData } from './activity-review-page';

const mockActivity: ActivityReviewData = {
  id: 'test-activity-id',
  created_at: '2025-01-15T12:00:00Z',
  story: [
    {
      id: 'e1',
      type: 'reasoning_start',
      message: '',
      timestamp: '2025-01-15T12:00:00Z',
      details: 'Some reasoning',
    },
    {
      id: 'e2',
      type: 'step',
      message: 'Step one',
      timestamp: '2025-01-15T12:00:01Z',
    },
  ],
};

vi.mock('../api-url', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('../embed-config', () => ({
  shouldHideThemeSwitch: vi.fn(() => false),
}));

function renderWithRoute(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/activity/${id}`]}>
      <Routes>
        <Route path="/activity/:id" element={<ActivityReviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ActivityReviewPage', () => {
  beforeEach(async () => {
    const { apiRequest } = await import('../api-url');
    (apiRequest as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state when activity is being fetched', async () => {
    const { apiRequest } = await import('../api-url');
    (apiRequest as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise<Response>(() => undefined),
    );
    renderWithRoute('some-id');
    expect(screen.getByText('Loading activity…')).toBeTruthy();
  });

  it('shows error and Back to chat link when fetch returns 404', async () => {
    const { apiRequest } = await import('../api-url');
    (apiRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(null, { status: 404 }),
    );
    renderWithRoute('missing-id');
    await waitFor(() => {
      expect(screen.getByText('Activity not found')).toBeTruthy();
    });
    expect(screen.getByRole('link', { name: /Back to chat/i })).toBeTruthy();
  });

  it('shows activity content when fetch returns 200 with story', async () => {
    const { apiRequest } = await import('../api-url');
    (apiRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockActivity,
    });
    renderWithRoute('test-activity-id');
    await waitFor(() => {
      expect(screen.queryByText('Loading activity…')).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Back to chat/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByPlaceholderText('Search activity...')).toBeTruthy();
    expect(screen.getByText(/Activity ·/)).toBeTruthy();
  });

  it('opens settings dialog when Settings is clicked and closes when Close is clicked', async () => {
    const { apiRequest } = await import('../api-url');
    (apiRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockActivity,
    });
    renderWithRoute('test-id');
    await waitFor(() => {
      expect(screen.queryByText('Loading activity…')).toBeNull();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    });
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('hides theme toggle when shouldHideThemeSwitch is true', async () => {
    const { shouldHideThemeSwitch } = await import('../embed-config');
    (shouldHideThemeSwitch as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const { apiRequest } = await import('../api-url');
    (apiRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockActivity,
    });
    renderWithRoute('test-id');
    await waitFor(() => {
      expect(screen.queryByText('Loading activity…')).toBeNull();
    });
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Switch to (dark|light) mode/ })).toBeNull();
  });
});

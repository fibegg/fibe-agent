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
        <Route path="/activity/:activityStoryId" element={<ActivityReviewPage />} />
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

  it('shows loading state when activities are being fetched', async () => {
    const { apiRequest } = await import('../api-url');
    (apiRequest as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise<Response>(() => undefined),
    );
    renderWithRoute('some-id');
    expect(screen.getByText('Loading activities…')).toBeTruthy();
  });

  it('shows error and Back to chat link when fetch returns 404', async () => {
    const { apiRequest } = await import('../api-url');
    (apiRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(null, { status: 404 }),
    );
    renderWithRoute('missing-id');
    await waitFor(() => {
      expect(screen.getByText('Failed to load activities')).toBeTruthy();
    });
    expect(screen.getByRole('link', { name: /Back to chat/i })).toBeTruthy();
  });

  it('shows activity content when fetch returns 200 with activities array', async () => {
    const { apiRequest } = await import('../api-url');
    (apiRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [mockActivity],
    });
    renderWithRoute('test-activity-id');
    await waitFor(() => {
      expect(screen.queryByText('Loading activities…')).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Back to chat/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByPlaceholderText('Search stories...')).toBeTruthy();
    expect(screen.getByText(/Reasoning|All activities/)).toBeTruthy();
  });

  it('opens settings dialog when Settings is clicked and closes when Close is clicked', async () => {
    const { apiRequest } = await import('../api-url');
    (apiRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [mockActivity],
    });
    renderWithRoute('test-id');
    await waitFor(() => {
      expect(screen.queryByText('Loading activities…')).toBeNull();
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
      json: async () => [mockActivity],
    });
    renderWithRoute('test-id');
    await waitFor(() => {
      expect(screen.queryByText('Loading activities…')).toBeNull();
    });
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Switch to (dark|light) mode/ })).toBeNull();
  });

  it('shows No stories yet when activities array is empty', async () => {
    const { apiRequest } = await import('../api-url');
    (apiRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    });
    render(
      <MemoryRouter initialEntries={['/activity']}>
        <Routes>
          <Route path="/activity" element={<ActivityReviewPage />} />
          <Route path="/activity/:activityStoryId" element={<ActivityReviewPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.queryByText('Loading activities…')).toBeNull();
    });
    expect(screen.getByText('No stories yet.')).toBeTruthy();
  });

  it('shows story list and selects story by id from URL', async () => {
    const { apiRequest } = await import('../api-url');
    (apiRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [mockActivity],
    });
    renderWithRoute('e1');
    await waitFor(() => {
      expect(screen.queryByText('Loading activities…')).toBeNull();
    });
    expect(screen.getAllByText(/Some reasoning/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Step one')).toBeTruthy();
  });
});

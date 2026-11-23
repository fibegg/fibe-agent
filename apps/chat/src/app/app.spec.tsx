import { fireEvent, render, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';

import App from './app';
import { buildApiUrl, clearToken } from './api-url';
import { useConversations } from './chat/use-conversations';

vi.mock('./pages/chat-page', () => ({
  ChatPage: function TestChatPage() {
    useConversations();
    return null;
  },
}));

describe('App', () => {
  beforeEach(clearToken);

  afterEach(() => {
    clearToken();
    vi.unstubAllGlobals();
  });

  it('should render successfully', () => {
    const { baseElement } = render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
    expect(baseElement).toBeTruthy();
  });

  it('should show login form when not authenticated', async () => {
    const { findByRole } = render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await findByRole('button', { name: 'Login' }, { timeout: 10000 }),
    ).toBeTruthy();
  });

  it.each([
    { name: 'password', token: 'fixture-password' },
    { name: 'passwordless', token: undefined },
  ])('requests the conversation list only after $name login', async ({ token }) => {
    const listUrl = buildApiUrl('/api/conversations');
    const loginUrl = buildApiUrl('/api/auth/login');
    const fetchRequest = vi.fn<typeof fetch>(async (url) => {
      if (url === loginUrl) return Response.json({ success: true, token });
      return Response.json(url === listUrl ? [] : {});
    });
    vi.stubGlobal('fetch', fetchRequest);

    const { findByRole, getByLabelText } = render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    const login = await findByRole('button', { name: 'Login' });
    expect(fetchRequest).not.toHaveBeenCalledWith(listUrl, expect.anything());

    fireEvent.change(getByLabelText('Playground password'), {
      target: { value: token ?? '' },
    });
    fireEvent.click(login);

    await waitFor(() => {
      const request = fetchRequest.mock.calls.find(([url]) => url === listUrl);
      expect(request).toBeDefined();
      expect(new Headers(request?.[1]?.headers).get('Authorization')).toBe(
        token ? `Bearer ${token}` : null,
      );
    });
  });
});

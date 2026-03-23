import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './login-page';

// Mock the api-url module
vi.mock('../api-url', () => ({
  loginWithPassword: vi.fn(),
  isAuthenticated: vi.fn().mockReturnValue(false),
}));

// Mock postmessage-auth module
vi.mock('../postmessage-auth', () => ({
  waitForAutoAuth: vi.fn().mockResolvedValue(false),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const orig = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...orig,
    useNavigate: () => mockNavigate,
  };
});

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stub __APP_VERSION__
    vi.stubGlobal('__APP_VERSION__', '1.0.0');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the login form', () => {
    renderLoginPage();
    expect(screen.getByRole('button', { name: /login/i })).toBeTruthy();
    expect(screen.getByPlaceholderText(/enter password/i)).toBeTruthy();
  });

  it('shows version from __APP_VERSION__', () => {
    renderLoginPage();
    expect(screen.getByText(/v1\.0\.0/)).toBeTruthy();
  });

  it('updates password field as user types', () => {
    renderLoginPage();
    const input = screen.getByPlaceholderText(/enter password/i);
    fireEvent.change(input, { target: { value: 'mypassword' } });
    expect((input as HTMLInputElement).value).toBe('mypassword');
  });

  it('shows error message on failed login', async () => {
    const { loginWithPassword } = await import('../api-url');
    vi.mocked(loginWithPassword).mockResolvedValue({ success: false, error: 'Wrong password' });

    const { container } = renderLoginPage();
    const input = screen.getByPlaceholderText(/enter password/i);
    fireEvent.change(input, { target: { value: 'wrong' } });
    const form = container.querySelector('form');
    if (form) fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Wrong password')).toBeTruthy();
    });
  });

  it('shows fallback error message when error is undefined', async () => {
    const { loginWithPassword } = await import('../api-url');
    vi.mocked(loginWithPassword).mockResolvedValue({ success: false });

    const { container } = renderLoginPage();
    const form = container.querySelector('form');
    if (form) fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/authentication failed/i)).toBeTruthy();
    });
  });

  it('navigates to / on successful login', async () => {
    const { loginWithPassword } = await import('../api-url');
    vi.mocked(loginWithPassword).mockResolvedValue({ success: true });

    const { container } = renderLoginPage();
    const input = screen.getByPlaceholderText(/enter password/i);
    fireEvent.change(input, { target: { value: 'correct' } });
    const form = container.querySelector('form');
    if (form) fireEvent.submit(form);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('shows loading state while authenticating', async () => {
    const { loginWithPassword } = await import('../api-url');
    let resolveLogin!: (v: { success: boolean }) => void;
    vi.mocked(loginWithPassword).mockReturnValue(
      new Promise(r => { resolveLogin = r; })
    );

    const { container } = renderLoginPage();
    fireEvent.change(screen.getByPlaceholderText(/enter password/i), { target: { value: 'pwd' } });
    const form = container.querySelector('form');
    if (form) fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/authenticating/i)).toBeTruthy();
    });

    resolveLogin({ success: false });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /login/i })).toBeTruthy();
    });
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AuthModal } from './auth-modal';
import type { AuthModalState } from './use-chat-websocket';

const DEFAULT_AUTH_MODAL: AuthModalState = {
  authUrl: null,
  deviceCode: null,
  isManualToken: false,
};

describe('AuthModal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = render(
      <AuthModal
        open={false}
        authModal={DEFAULT_AUTH_MODAL}
        onClose={vi.fn()}
        onSubmitCode={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal content when open is true', () => {
    render(
      <AuthModal
        open={true}
        authModal={DEFAULT_AUTH_MODAL}
        onClose={vi.fn()}
        onSubmitCode={vi.fn()}
      />
    );
    expect(screen.getByText(/connect to provider/i)).toBeTruthy();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(
      <AuthModal
        open={true}
        authModal={DEFAULT_AUTH_MODAL}
        onClose={onClose}
        onSubmitCode={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <AuthModal
        open={true}
        authModal={DEFAULT_AUTH_MODAL}
        onClose={onClose}
        onSubmitCode={vi.fn()}
      />
    );
    // Click the outer overlay div (first child)
    fireEvent.click(container.firstChild as Element);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not propagate click from inner card', () => {
    const onClose = vi.fn();
    render(
      <AuthModal
        open={true}
        authModal={DEFAULT_AUTH_MODAL}
        onClose={onClose}
        onSubmitCode={vi.fn()}
      />
    );
    // Click the heading inside the modal — should not trigger onClose
    fireEvent.click(screen.getByText(/connect to provider/i));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows auth URL link when authUrl is present and not manual token', () => {
    render(
      <AuthModal
        open={true}
        authModal={{ authUrl: 'https://auth.example.com', deviceCode: null, isManualToken: false }}
        onClose={vi.fn()}
        onSubmitCode={vi.fn()}
      />
    );
    expect(screen.getByText(/open authentication url/i)).toBeTruthy();
  });

  it('shows submit button for standard code mode', () => {
    render(
      <AuthModal
        open={true}
        authModal={DEFAULT_AUTH_MODAL}
        onClose={vi.fn()}
        onSubmitCode={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /submit/i })).toBeTruthy();
  });

  it('calls onSubmitCode with input value when Submit clicked', () => {
    const onSubmitCode = vi.fn();
    render(
      <AuthModal
        open={true}
        authModal={DEFAULT_AUTH_MODAL}
        onClose={vi.fn()}
        onSubmitCode={onSubmitCode}
      />
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my-auth-code' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(onSubmitCode).toHaveBeenCalledWith('my-auth-code');
  });

  it('does not call onSubmitCode when input is empty and not readOnly', () => {
    const onSubmitCode = vi.fn();
    render(
      <AuthModal
        open={true}
        authModal={DEFAULT_AUTH_MODAL}
        onClose={vi.fn()}
        onSubmitCode={onSubmitCode}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(onSubmitCode).not.toHaveBeenCalled();
  });

  it('calls onSubmitCode on Enter key press (no shift)', () => {
    const onSubmitCode = vi.fn();
    render(
      <AuthModal
        open={true}
        authModal={DEFAULT_AUTH_MODAL}
        onClose={vi.fn()}
        onSubmitCode={onSubmitCode}
      />
    );
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'code' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
    expect(onSubmitCode).toHaveBeenCalledWith('code');
  });

  it('does not call onSubmitCode on Shift+Enter', () => {
    const onSubmitCode = vi.fn();
    render(
      <AuthModal
        open={true}
        authModal={DEFAULT_AUTH_MODAL}
        onClose={vi.fn()}
        onSubmitCode={onSubmitCode}
      />
    );
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'code' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSubmitCode).not.toHaveBeenCalled();
  });

  it('shows device code with copy button in device code mode', () => {
    render(
      <AuthModal
        open={true}
        authModal={{ authUrl: null, deviceCode: 'ABCD-1234', isManualToken: false }}
        onClose={vi.fn()}
        onSubmitCode={vi.fn()}
      />
    );
    expect(screen.getByTitle(/copy device code/i)).toBeTruthy();
    expect(screen.getByDisplayValue('ABCD-1234')).toBeTruthy();
  });

  it('shows password input for manual token mode', () => {
    render(
      <AuthModal
        open={true}
        authModal={{ authUrl: null, deviceCode: null, isManualToken: true }}
        onClose={vi.fn()}
        onSubmitCode={vi.fn()}
      />
    );
    expect(screen.getByText(/paste api key or token/i)).toBeTruthy();
  });

  it('copies device code to clipboard when copy button is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.useFakeTimers();

    render(
      <AuthModal
        open={true}
        authModal={{ authUrl: null, deviceCode: 'ABCD-1234', isManualToken: false }}
        onClose={vi.fn()}
        onSubmitCode={vi.fn()}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByTitle(/copy device code/i));
    });

    expect(writeText).toHaveBeenCalledWith('ABCD-1234');

    act(() => { vi.advanceTimersByTime(2001); });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows separator when both authUrl and device code are present', () => {
    const { container } = render(
      <AuthModal
        open={true}
        authModal={{ authUrl: 'https://auth.example.com', deviceCode: 'ABCD-1234', isManualToken: false }}
        onClose={vi.fn()}
        onSubmitCode={vi.fn()}
      />
    );
    // The border-t div acts as separator
    expect(container.querySelector('.border-t')).toBeTruthy();
  });
});

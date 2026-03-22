import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppErrorBoundary } from './error-boundary';

// Helper component that throws an error
function Bomb({ shouldThrow = false }: { shouldThrow?: boolean }) {
  if (shouldThrow) throw new Error('Test explosion!');
  return <div>Safe</div>;
}

describe('AppErrorBoundary', () => {
  it('renders children normally when no error', () => {
    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>
    );
    expect(screen.getByText('Safe')).toBeTruthy();
  });

  it('renders default error UI when child throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <AppErrorBoundary>
        <Bomb shouldThrow />
      </AppErrorBoundary>
    );
    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
    expect(screen.getByText('Test explosion!')).toBeTruthy();
    consoleError.mockRestore();
  });

  it('renders custom fallback when provided and child throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <AppErrorBoundary fallback={<div>Custom fallback</div>}>
        <Bomb shouldThrow />
      </AppErrorBoundary>
    );
    expect(screen.getByText('Custom fallback')).toBeTruthy();
    consoleError.mockRestore();
  });

  it('calls console.error when child throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <AppErrorBoundary>
        <Bomb shouldThrow />
      </AppErrorBoundary>
    );
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('shows Retry button that resets error state', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <AppErrorBoundary>
        <Bomb shouldThrow />
      </AppErrorBoundary>
    );
    const retry = screen.getByRole('button', { name: /retry/i });
    expect(retry).toBeTruthy();
    // Click should reset state (hasError becomes false → renders children again which may throw again)
    fireEvent.click(retry);
    // After click, the component re-renders — it will throw again & show error UI again
    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
    consoleError.mockRestore();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlaygroundServicePreviewPanel } from './playground-service-preview-panel';

const services = [
  { id: 'app', name: 'app', url: 'https://app.example.test' },
  { id: 'admin', name: 'admin', url: 'https://admin.example.test' },
];

describe('PlaygroundServicePreviewPanel', () => {
  it('renders the selected service in an iframe', () => {
    render(<PlaygroundServicePreviewPanel services={services} initialServiceId="admin" onClose={vi.fn()} />);

    const frame = screen.getByTitle('admin preview') as HTMLIFrameElement;
    expect(frame.src).toBe('https://admin.example.test/');
  });

  it('switches between preview services', () => {
    render(<PlaygroundServicePreviewPanel services={services} initialServiceId="app" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'admin' }));

    const frame = screen.getByTitle('admin preview') as HTMLIFrameElement;
    expect(frame.src).toBe('https://admin.example.test/');
  });

  it('shows a placeholder when no services are available', () => {
    render(<PlaygroundServicePreviewPanel services={[]} loading={false} onClose={vi.fn()} />);

    expect(screen.getByText('No preview services')).toBeTruthy();
  });

  it('refreshes iframe and service metadata', () => {
    const onRefresh = vi.fn();
    render(<PlaygroundServicePreviewPanel services={services} onClose={vi.fn()} onRefresh={onRefresh} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reload preview' }));

    expect(onRefresh).toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModelSelector } from './model-selector';

describe('ModelSelector', () => {
  it('returns null when visible is false', () => {
    const { container } = render(
      <ModelSelector
        currentModel=""
        options={['flash', 'pro']}
        onSelect={vi.fn()}
        onInputChange={vi.fn()}
        visible={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders only disabled input when visible and modelLocked', () => {
    render(
      <ModelSelector
        currentModel="flash"
        options={['flash', 'pro']}
        onSelect={vi.fn()}
        onInputChange={vi.fn()}
        visible
        modelLocked
      />
    );
    const input = screen.getByRole('textbox', { name: 'Model in use' });
    expect((input as HTMLInputElement).value).toBe('flash');
    expect((input as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders input and option buttons when visible and not locked', () => {
    render(
      <ModelSelector
        currentModel=""
        options={['flash', 'pro']}
        onSelect={vi.fn()}
        onInputChange={vi.fn()}
        visible
      />
    );
    const input = screen.getByPlaceholderText('Model (default)');
    expect((input as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'flash' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'pro' })).toBeTruthy();
  });

  it('calls onSelect with option when clicking unselected option', () => {
    const onSelect = vi.fn();
    render(
      <ModelSelector
        currentModel=""
        options={['flash', 'pro']}
        onSelect={onSelect}
        onInputChange={vi.fn()}
        visible
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'pro' }));
    expect(onSelect).toHaveBeenCalledWith('pro');
  });

  it('calls onSelect with empty string when clicking selected option', () => {
    const onSelect = vi.fn();
    render(
      <ModelSelector
        currentModel="pro"
        options={['flash', 'pro']}
        onSelect={onSelect}
        onInputChange={vi.fn()}
        visible
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'pro' }));
    expect(onSelect).toHaveBeenCalledWith('');
  });

  it('calls onInputChange when typing in input', () => {
    const onInputChange = vi.fn();
    render(
      <ModelSelector
        currentModel=""
        options={[]}
        onSelect={vi.fn()}
        onInputChange={onInputChange}
        visible
      />
    );
    fireEvent.change(screen.getByPlaceholderText('Model (default)'), {
      target: { value: 'custom' },
    });
    expect(onInputChange).toHaveBeenCalledWith('custom');
  });
});

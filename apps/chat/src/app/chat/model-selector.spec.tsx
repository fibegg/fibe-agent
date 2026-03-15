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

  it('renders read-only trigger when visible and modelLocked', () => {
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
    expect(screen.getByLabelText('Model in use')).toBeTruthy();
    expect(screen.getByText('flash')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /select model/i })).toBeNull();
  });

  it('renders trigger with Model (default) when currentModel is empty', () => {
    render(
      <ModelSelector
        currentModel=""
        options={['flash', 'pro']}
        onSelect={vi.fn()}
        onInputChange={vi.fn()}
        visible
      />
    );
    expect(screen.getByRole('button', { name: 'Select model' })).toBeTruthy();
    expect(screen.getByText('Model (default)')).toBeTruthy();
  });

  it('opens dropdown with options when trigger is clicked', () => {
    render(
      <ModelSelector
        currentModel=""
        options={['flash', 'pro']}
        onSelect={vi.fn()}
        onInputChange={vi.fn()}
        visible
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));
    expect(screen.getByRole('listbox', { name: 'Model options' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Model (default)' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'flash' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'pro' })).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));
    fireEvent.click(screen.getByRole('option', { name: 'pro' }));
    expect(onSelect).toHaveBeenCalledWith('pro');
  });

  it('calls onSelect with empty string when clicking Model (default)', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));
    fireEvent.click(screen.getByRole('option', { name: 'Model (default)' }));
    expect(onSelect).toHaveBeenCalledWith('');
  });

  it('shows Custom model option and calls onInputChange when entering custom value', () => {
    const onInputChange = vi.fn();
    const onSelect = vi.fn();
    render(
      <ModelSelector
        currentModel=""
        options={[]}
        onSelect={onSelect}
        onInputChange={onInputChange}
        visible
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));
    fireEvent.click(screen.getByRole('option', { name: 'Custom model...' }));
    const input = screen.getByLabelText('Custom model name');
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: 'custom' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onInputChange).toHaveBeenCalledWith('custom');
    expect(onSelect).toHaveBeenCalledWith('custom');
  });
});

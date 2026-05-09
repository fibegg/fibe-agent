import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CliDrawerContent } from './cli-drawer';

describe('CliDrawerContent', () => {
  it('renders current SDK command snippets', () => {
    const onSelectCommand = vi.fn();
    const rawText = { normalizer: (text: string) => text };

    render(<CliDrawerContent onSelectCommand={onSelectCommand} />);

    for (const command of [
      'fibe playgrounds list',
      'fibe playgrounds start ',
      'fibe agents list',
      'fibe agents interrupt ',
      'fibe status',
      'fibe mcp docs',
    ]) {
      expect(screen.getByText(command, rawText)).toBeTruthy();
    }

    expect(screen.queryByText('fibe agents stop ', rawText)).toBeNull();
    expect(screen.queryByText('fibe mcp list', rawText)).toBeNull();

    const button = screen.getByText('fibe mcp docs').closest('button');
    expect(button).toBeTruthy();
    fireEvent.click(button as HTMLElement);

    expect(onSelectCommand).toHaveBeenCalledWith('fibe mcp docs');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RightDrawer } from './right-drawer';

describe('RightDrawer', () => {
  it('renders the drawer panel in document.body so app layout stacking cannot cover it', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    render(
      <RightDrawer open onClose={vi.fn()} title="Drawer">
        <div>Drawer content</div>
      </RightDrawer>,
      { container: host }
    );

    expect(host.querySelector('[role="dialog"][aria-label="Drawer"]')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Drawer' })).toBeTruthy();
  });
});

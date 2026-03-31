import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChatLeftPanel } from './chat-left-panel';

// Mock the heavy child components
vi.mock('../file-explorer/file-explorer', () => ({
  FileExplorer: (props: Record<string, unknown>) => (
    <div data-testid="file-explorer" data-collapsed={String(props.collapsed)} />
  ),
}));

const baseProps = {
  hasAnyFiles: true,
  sidebarCollapsed: false,
  width: 280,
  playgroundTree: [],
  agentFileTree: [],
  activeFileTab: 'playground' as const,
  onTabChange: vi.fn(),
  onSettingsClick: vi.fn(),
  onToggleCollapse: vi.fn(),
  onFileSelect: vi.fn(),
  onResizeStart: vi.fn(),
  panelRef: { current: null },
  selectedPath: null,
  dirtyPaths: new Set<string>(),
};

describe('ChatLeftPanel', () => {
  it('renders the FileExplorer', () => {
    const { getByTestId } = render(
      <MemoryRouter>
        <ChatLeftPanel {...baseProps} />
      </MemoryRouter>
    );
    expect(getByTestId('file-explorer')).toBeTruthy();
  });

  it('passes collapsed=true when sidebarCollapsed is true', () => {
    const { getByTestId } = render(
      <MemoryRouter>
        <ChatLeftPanel {...baseProps} sidebarCollapsed={true} />
      </MemoryRouter>
    );
    expect(getByTestId('file-explorer').getAttribute('data-collapsed')).toBe('true');
  });

  it('passes collapsed=true when hasAnyFiles is false', () => {
    const { getByTestId } = render(
      <MemoryRouter>
        <ChatLeftPanel {...baseProps} hasAnyFiles={false} />
      </MemoryRouter>
    );
    expect(getByTestId('file-explorer').getAttribute('data-collapsed')).toBe('true');
  });

  it('renders resize handle when expanded and has files', () => {
    const { container } = render(
      <MemoryRouter>
        <ChatLeftPanel {...baseProps} hasAnyFiles={true} sidebarCollapsed={false} />
      </MemoryRouter>
    );
    expect(container.querySelector('[role="separator"]')).toBeTruthy();
  });

  it('does not render resize handle when collapsed', () => {
    const { container } = render(
      <MemoryRouter>
        <ChatLeftPanel {...baseProps} sidebarCollapsed={true} />
      </MemoryRouter>
    );
    expect(container.querySelector('[role="separator"]')).toBeNull();
  });
});

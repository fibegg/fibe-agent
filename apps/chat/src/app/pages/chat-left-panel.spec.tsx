import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChatLeftPanel } from './chat-left-panel';

// Mock the heavy child components
vi.mock('../file-explorer/file-explorer', () => ({
  FileExplorer: (props: Record<string, unknown>) => (
    <div
      data-testid="file-explorer"
      data-collapsed={String(props.collapsed)}
      data-agent-workspace={String(props.agentWorkspaceAvailable)}
    />
  ),
}));

vi.mock('../chat/conversation-sidebar', () => ({
  ConversationSidebar: () => <div data-testid="conversation-sidebar" />,
}));

vi.mock('../sidebar-toggle', () => ({
  SidebarToggle: ({ isCollapsed }: { isCollapsed: boolean }) => (
    <button data-testid="sidebar-toggle" data-collapsed={String(isCollapsed)} />
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

const conversationProps = {
  conversations: [],
  conversationsLoading: false,
  activeConversationId: 'default',
  onConversationSelect: vi.fn(),
  onConversationCreate: vi.fn(),
  onConversationRename: vi.fn(),
  onConversationDelete: vi.fn(),
};

describe('ChatLeftPanel', () => {
  it('renders the FileExplorer when files exist', () => {
    render(
      <MemoryRouter>
        <ChatLeftPanel {...baseProps} />
      </MemoryRouter>
    );
    expect(screen.getByTestId('file-explorer')).toBeTruthy();
  });

  it('passes agent workspace availability into FileExplorer', () => {
    render(
      <MemoryRouter>
        <ChatLeftPanel {...baseProps} agentWorkspaceAvailable />
      </MemoryRouter>
    );
    expect(screen.getByTestId('file-explorer').getAttribute('data-agent-workspace')).toBe('true');
  });

  it('passes collapsed=true when sidebarCollapsed is true', () => {
    render(
      <MemoryRouter>
        <ChatLeftPanel {...baseProps} sidebarCollapsed={true} />
      </MemoryRouter>
    );
    expect(screen.getByTestId('file-explorer').getAttribute('data-collapsed')).toBe('true');
  });

  it('shows icon-rail (collapsed FileExplorer) when no files and no conversations provided', () => {
    render(
      <MemoryRouter>
        <ChatLeftPanel {...baseProps} hasAnyFiles={false} />
      </MemoryRouter>
    );
    // FileExplorer still rendered as icon rail
    expect(screen.getByTestId('file-explorer').getAttribute('data-collapsed')).toBe('true');
  });

  it('renders SidebarToggle centered over full panel when expanded and has files', () => {
    render(
      <MemoryRouter>
        <ChatLeftPanel {...baseProps} hasAnyFiles={true} sidebarCollapsed={false} />
      </MemoryRouter>
    );
    const toggle = screen.getByTestId('sidebar-toggle');
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('data-collapsed')).toBe('false');
  });

  it('renders SidebarToggle in collapsed state when sidebarCollapsed=true', () => {
    render(
      <MemoryRouter>
        <ChatLeftPanel {...baseProps} sidebarCollapsed={true} />
      </MemoryRouter>
    );
    expect(screen.getByTestId('sidebar-toggle').getAttribute('data-collapsed')).toBe('true');
  });

  it('does not render resize handle when explicitly collapsed', () => {
    const { container } = render(
      <MemoryRouter>
        <ChatLeftPanel {...baseProps} sidebarCollapsed={true} />
      </MemoryRouter>
    );
    expect(container.querySelector('[role="separator"]')).toBeNull();
  });

  it('renders ConversationSidebar at the bottom when conversations prop is provided', () => {
    render(
      <MemoryRouter>
        <ChatLeftPanel {...baseProps} {...conversationProps} />
      </MemoryRouter>
    );
    expect(screen.getByTestId('conversation-sidebar')).toBeTruthy();
    // File explorer also still present (files exist)
    expect(screen.getByTestId('file-explorer')).toBeTruthy();
  });

  it('shows ConversationSidebar at full height when there are no files', () => {
    render(
      <MemoryRouter>
        <ChatLeftPanel {...baseProps} hasAnyFiles={false} {...conversationProps} />
      </MemoryRouter>
    );
    // Conversations take full height — no file explorer rendered
    expect(screen.getByTestId('conversation-sidebar')).toBeTruthy();
    expect(screen.queryByTestId('file-explorer')).toBeNull();
  });

  it('hides ConversationSidebar when panel is explicitly collapsed', () => {
    render(
      <MemoryRouter>
        <ChatLeftPanel {...baseProps} sidebarCollapsed={true} {...conversationProps} />
      </MemoryRouter>
    );
    // No room in icon-rail for conversations
    expect(screen.queryByTestId('conversation-sidebar')).toBeNull();
  });

  it('does not render ConversationSidebar when conversations prop is not provided', () => {
    render(
      <MemoryRouter>
        <ChatLeftPanel {...baseProps} />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('conversation-sidebar')).toBeNull();
  });
});

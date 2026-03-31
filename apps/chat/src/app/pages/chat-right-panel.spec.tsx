import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChatRightPanel } from './chat-right-panel';

// Mock the heavy child component
vi.mock('../agent-thinking-sidebar', () => ({
  AgentThinkingSidebar: (props: Record<string, unknown>) => (
    <div
      data-testid="thinking-sidebar"
      data-collapsed={String(props.isCollapsed)}
      data-streaming={String(props.isStreaming)}
    />
  ),
}));

const baseProps = {
  rightSidebarCollapsed: false,
  onToggle: vi.fn(),
  isStreaming: false,
  reasoningText: '',
  streamingResponseText: '',
  thinkingSteps: [],
  storyItems: [],
  sessionActivity: [],
  pastActivityFromMessages: [],
  sessionTokenUsage: null,
  width: 280,
  onResizeStart: vi.fn(),
  panelRef: { current: null },
};

describe('ChatRightPanel', () => {
  it('renders the AgentThinkingSidebar', () => {
    const { getByTestId } = render(
      <MemoryRouter>
        <ChatRightPanel {...baseProps} />
      </MemoryRouter>
    );
    expect(getByTestId('thinking-sidebar')).toBeTruthy();
  });

  it('passes isCollapsed prop correctly', () => {
    const { getByTestId } = render(
      <MemoryRouter>
        <ChatRightPanel {...baseProps} rightSidebarCollapsed={true} />
      </MemoryRouter>
    );
    expect(getByTestId('thinking-sidebar').getAttribute('data-collapsed')).toBe('true');
  });

  it('passes isStreaming prop correctly', () => {
    const { getByTestId } = render(
      <MemoryRouter>
        <ChatRightPanel {...baseProps} isStreaming={true} />
      </MemoryRouter>
    );
    expect(getByTestId('thinking-sidebar').getAttribute('data-streaming')).toBe('true');
  });

  it('forwards sessionTokenUsage when provided', () => {
    const usage = { inputTokens: 100, outputTokens: 50 };
    const { getByTestId } = render(
      <MemoryRouter>
        <ChatRightPanel {...baseProps} sessionTokenUsage={usage} />
      </MemoryRouter>
    );
    expect(getByTestId('thinking-sidebar')).toBeTruthy();
  });

  it('renders without crashing when given a custom width', () => {
    const { getByTestId } = render(
      <MemoryRouter>
        <ChatRightPanel {...baseProps} width={400} />
      </MemoryRouter>
    );
    expect(getByTestId('thinking-sidebar')).toBeTruthy();
  });
});

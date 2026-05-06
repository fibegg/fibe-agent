import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import { ConversationSidebar } from './conversation-sidebar';

const conversations = [
  {
    id: 'default',
    title: 'Default',
    createdAt: new Date().toISOString(),
    lastMessageAt: new Date().toISOString(),
  },
];

const props = {
  conversations,
  activeId: 'default',
  loading: false,
  onSelect: vi.fn(),
  onCreate: vi.fn(),
  onRename: vi.fn(),
  onDelete: vi.fn(),
};

describe('ConversationSidebar', () => {
  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders collapsed header without the conversation list', () => {
    const onCollapsedChange = vi.fn();
    render(
      <ConversationSidebar
        {...props}
        collapsed
        onCollapsedChange={onCollapsedChange}
      />
    );

    expect(screen.getByText('Conversations')).toBeTruthy();
    expect(screen.queryByText('Default')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /expand conversations/i }));
    expect(onCollapsedChange).toHaveBeenCalledWith(false);
  });

  it('uses i18n labels in the expanded sidebar', () => {
    localStorage.setItem('chat-locale', 'uk');
    render(
      <I18nProvider>
        <ConversationSidebar {...props} collapsed={false} />
      </I18nProvider>
    );

    expect(screen.getByText('Розмови')).toBeTruthy();
    expect(screen.getByPlaceholderText('Пошук...')).toBeTruthy();
    expect(screen.getByRole('button', { name: /нова розмова/i })).toBeTruthy();
  });
});

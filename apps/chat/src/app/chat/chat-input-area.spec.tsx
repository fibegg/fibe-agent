import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ChatInputArea } from './chat-input-area';
import { CHAT_STATES } from './chat-state';

vi.mock('./mention-input', () => ({
  MentionInput: ({ value, onChange, placeholder, disabled, onKeyDown, onPaste }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    disabled?: boolean;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    onPaste?: (e: React.ClipboardEvent) => void;
  }) => (
    <textarea
      data-testid="mention-input"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    />
  ),
}));

vi.mock('./file-mention-dropdown', () => ({
  FileMentionDropdown: () => null,
}));

vi.mock('../file-icon', () => ({
  FileIcon: () => <span data-testid="file-icon" />,
}));

const BASE_PROPS = {
  state: CHAT_STATES.AUTHENTICATED,
  inputValue: '',
  onInputChange: vi.fn(),
  onCursorChange: vi.fn(),
  onKeyDown: vi.fn(),
  onPaste: vi.fn(),
  placeholder: 'Type a message...',
  chatInputRef: { current: null },
  mentionOpen: false,
  atMentionQuery: '',
  playgroundEntries: [],
  onMentionSelect: vi.fn(),
  onMentionClose: vi.fn(),
  pendingImages: [],
  pendingAttachments: [],
  pendingVoice: null,
  voiceRecorder: { isSupported: false, isRecording: false, recordingTimeSec: 0, error: null },
  voiceUploadError: null,
  attachmentUploadError: null,
  onRemovePendingImage: vi.fn(),
  onRemovePendingAttachment: vi.fn(),
  onRemovePendingVoice: vi.fn(),
  onFileChange: vi.fn(),
  onSend: vi.fn(),
  onInterrupt: vi.fn(),
  onVoiceToggle: vi.fn(),
  maxPendingTotal: 5,
};

describe('ChatInputArea', () => {
  it('renders the mention input with placeholder', () => {
    render(<ChatInputArea {...BASE_PROPS} />);
    expect(screen.getByPlaceholderText('Type a message...')).toBeTruthy();
  });

  it('renders Send button when state is AUTHENTICATED', () => {
    render(<ChatInputArea {...BASE_PROPS} />);
    expect(screen.getByRole('button', { name: /send/i })).toBeTruthy();
  });

  it('calls onSend when Send button is clicked', () => {
    const onSend = vi.fn();
    render(<ChatInputArea {...BASE_PROPS} onSend={onSend} />);
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(onSend).toHaveBeenCalled();
  });

  it('shows Attach files button', () => {
    render(<ChatInputArea {...BASE_PROPS} />);
    expect(screen.getByRole('button', { name: /attach files/i })).toBeTruthy();
  });

  it('Attach files button is disabled when not AUTHENTICATED', () => {
    render(<ChatInputArea {...BASE_PROPS} state={CHAT_STATES.AWAITING_RESPONSE} />);
    const attachBtn = screen.getByRole('button', { name: /attach files/i });
    expect(attachBtn.getAttribute('disabled')).not.toBeNull();
  });

  it('shows Stop and Queue buttons when AWAITING_RESPONSE', () => {
    render(<ChatInputArea {...BASE_PROPS} state={CHAT_STATES.AWAITING_RESPONSE} inputValue="hello" />);
    expect(screen.getByRole('button', { name: /stop/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /queue message/i })).toBeTruthy();
  });

  it('calls onInterrupt when Stop button is clicked', () => {
    const onInterrupt = vi.fn();
    render(<ChatInputArea {...BASE_PROPS} state={CHAT_STATES.AWAITING_RESPONSE} onInterrupt={onInterrupt} />);
    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    expect(onInterrupt).toHaveBeenCalled();
  });

  it('shows pending image thumbnails', () => {
    render(<ChatInputArea {...BASE_PROPS} pendingImages={['data:image/png;base64,abc']} />);
    expect(screen.getByRole('button', { name: /remove image/i })).toBeTruthy();
  });

  it('calls onRemovePendingImage when image remove button clicked', () => {
    const onRemovePendingImage = vi.fn();
    render(
      <ChatInputArea
        {...BASE_PROPS}
        pendingImages={['data:image/png;base64,abc']}
        onRemovePendingImage={onRemovePendingImage}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /remove image/i }));
    expect(onRemovePendingImage).toHaveBeenCalledWith(0);
  });

  it('shows pending attachment names', () => {
    render(
      <ChatInputArea
        {...BASE_PROPS}
        pendingAttachments={[{ filename: 'server-file.txt', name: 'file.txt' }]}
      />
    );
    expect(screen.getByTitle('file.txt')).toBeTruthy();
  });

  it('calls onRemovePendingAttachment when attachment remove button clicked', () => {
    const onRemovePendingAttachment = vi.fn();
    render(
      <ChatInputArea
        {...BASE_PROPS}
        pendingAttachments={[{ filename: 'srv.txt', name: 'doc.txt' }]}
        onRemovePendingAttachment={onRemovePendingAttachment}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /remove attachment/i }));
    expect(onRemovePendingAttachment).toHaveBeenCalledWith(0);
  });

  it('shows pending voice audio player', () => {
    const { container } = render(<ChatInputArea {...BASE_PROPS} pendingVoice="data:audio/webm;base64,abc" />);
    expect(container.querySelector('audio')).toBeTruthy();
  });

  it('calls onRemovePendingVoice when voice remove button clicked', () => {
    const onRemovePendingVoice = vi.fn();
    render(
      <ChatInputArea
        {...BASE_PROPS}
        pendingVoice="data:audio/webm;base64,abc"
        onRemovePendingVoice={onRemovePendingVoice}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /remove voice/i }));
    expect(onRemovePendingVoice).toHaveBeenCalled();
  });

  it('shows error messages', () => {
    render(<ChatInputArea {...BASE_PROPS} voiceUploadError="Upload failed" />);
    expect(screen.getByText('Upload failed')).toBeTruthy();
  });

  it('shows attachment error messages', () => {
    render(<ChatInputArea {...BASE_PROPS} attachmentUploadError="File too large" />);
    expect(screen.getByText('File too large')).toBeTruthy();
  });

  it('shows voice recorder error', () => {
    render(
      <ChatInputArea
        {...BASE_PROPS}
        voiceRecorder={{ isSupported: true, isRecording: false, recordingTimeSec: 0, error: 'Mic denied' }}
      />
    );
    expect(screen.getByText('Mic denied')).toBeTruthy();
  });

  it('shows voice button when recorder is supported', () => {
    render(
      <ChatInputArea
        {...BASE_PROPS}
        voiceRecorder={{ isSupported: true, isRecording: false, recordingTimeSec: 0, error: null }}
      />
    );
    expect(screen.getByRole('button', { name: /voice input/i })).toBeTruthy();
  });

  it('shows Stop recording when isRecording is true', () => {
    render(
      <ChatInputArea
        {...BASE_PROPS}
        voiceRecorder={{ isSupported: true, isRecording: true, recordingTimeSec: 5, error: null }}
      />
    );
    expect(screen.getByRole('button', { name: /stop recording/i })).toBeTruthy();
  });

  it('shows recording time in mm:ss format', () => {
    render(
      <ChatInputArea
        {...BASE_PROPS}
        voiceRecorder={{ isSupported: true, isRecording: true, recordingTimeSec: 75, error: null }}
      />
    );
    // 75 seconds = 1:15
    expect(screen.getByText(/1:15/)).toBeTruthy();
  });

  it('calls onVoiceToggle when voice button clicked', () => {
    const onVoiceToggle = vi.fn();
    render(
      <ChatInputArea
        {...BASE_PROPS}
        voiceRecorder={{ isSupported: true, isRecording: false, recordingTimeSec: 0, error: null }}
        onVoiceToggle={onVoiceToggle}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /voice input/i }));
    expect(onVoiceToggle).toHaveBeenCalled();
  });

  it('shows queued badge when queuedCount > 0', () => {
    render(
      <ChatInputArea
        {...BASE_PROPS}
        state={CHAT_STATES.AWAITING_RESPONSE}
        inputValue="hello"
        queuedCount={3}
      />
    );
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('input is disabled when state is not AUTHENTICATED or AWAITING_RESPONSE', () => {
    render(<ChatInputArea {...BASE_PROPS} state={CHAT_STATES.UNAUTHENTICATED} />);
    const input = screen.getByTestId('mention-input');
    expect(input.getAttribute('disabled')).not.toBeNull();
  });

  // ── Deferred focus after Send (iframe postMessage fix) ───────────────────
  // Clicking a button blurs the input. We restore focus via setTimeout(fn, 0)
  // so the call happens *after* the parent frame's sortable-tabs DOM mutation
  // triggered by window.parent.postMessage({ type: 'player_message_sent' }).

  it('Send button restores focus to chatInputRef asynchronously, not synchronously', () => {
    vi.useFakeTimers();
    const focusMock = vi.fn();
    const chatInputRef = { current: { focus: focusMock } } as unknown as React.RefObject<HTMLDivElement>;

    render(<ChatInputArea {...BASE_PROPS} chatInputRef={chatInputRef} />);
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    // Must NOT have been called synchronously during the click handler
    expect(focusMock).not.toHaveBeenCalled();

    // Flush the deferred setTimeout(fn, 0)
    act(() => vi.runAllTimers());
    expect(focusMock).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  it('Queue-message button restores focus asynchronously when AWAITING_RESPONSE', () => {
    vi.useFakeTimers();
    const focusMock = vi.fn();
    const chatInputRef = { current: { focus: focusMock } } as unknown as React.RefObject<HTMLDivElement>;

    render(
      <ChatInputArea
        {...BASE_PROPS}
        state={CHAT_STATES.AWAITING_RESPONSE}
        inputValue="hello"
        chatInputRef={chatInputRef}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /queue message/i }));

    expect(focusMock).not.toHaveBeenCalled();

    act(() => vi.runAllTimers());
    expect(focusMock).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });
});

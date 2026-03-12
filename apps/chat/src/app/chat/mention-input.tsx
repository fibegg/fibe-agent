import { useCallback, useEffect, useRef } from 'react';
import { getFileIconInfo, type FileIconId } from '../file-extension-icons';
import { AT_MENTION_REGEX, pathDisplayName } from './mention-utils';

type Segment = { type: 'text'; value: string } | { type: 'mention'; path: string };

function parseToSegments(str: string): Segment[] {
  if (!str) return [{ type: 'text', value: '' }];
  const parts = str.split(AT_MENTION_REGEX);
  const segments: Segment[] = [];
  for (const p of parts) {
    const m = p.match(/^@([^\s@]+)$/);
    if (m) segments.push({ type: 'mention', path: m[1] ?? '' });
    else segments.push({ type: 'text', value: p });
  }
  return segments;
}

function segmentsToStr(segments: Segment[]): string {
  return segments
    .map((s) => (s.type === 'text' ? s.value : `@${s.path}`))
    .join('');
}

function readDomFromEl(el: HTMLElement): Segment[] {
  const out: Segment[] = [];
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const v = node.textContent ?? '';
      if (v) out.push({ type: 'text', value: v });
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const span = node as HTMLElement;
      const path = span.getAttribute('data-path');
      if (path) out.push({ type: 'mention', path });
      else out.push({ type: 'text', value: span.textContent ?? '' });
    }
  }
  if (out.length === 0) return [{ type: 'text', value: '' }];
  return out;
}

function getCaretOffset(root: Node, sel: Selection): number {
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.currentNode;
  while (node) {
    if (node === sel.anchorNode) return offset + sel.anchorOffset;
    if (node.nodeType === Node.TEXT_NODE) {
      offset += (node.textContent ?? '').length;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.getAttribute?.('data-path')) offset += ('@' + (el.getAttribute('data-path') ?? '')).length;
    }
    node = walker.nextNode();
  }
  return offset;
}

function setCaretOffset(root: HTMLElement, targetOffset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.currentNode;
  while (node) {
    let len = 0;
    if (node.nodeType === Node.TEXT_NODE) {
      len = (node.textContent ?? '').length;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.getAttribute?.('data-path')) len = ('@' + (el.getAttribute('data-path') ?? '')).length;
    }
    if (offset + len >= targetOffset) {
      const range = document.createRange();
      if (node.nodeType === Node.TEXT_NODE) {
        const pos = Math.min(targetOffset - offset, len);
        range.setStart(node, pos);
        range.collapse(true);
      } else {
        range.setStartAfter(node);
        range.collapse(true);
      }
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    offset += len;
    node = walker.nextNode();
  }
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

const CHIP_CLASS =
  'group relative inline-flex items-center gap-1.5 rounded-md pl-1.5 pr-2 py-0.5 text-xs font-medium bg-muted/80 border border-border-subtle text-foreground shrink-0';

const CHIP_ICON_SVG: Record<FileIconId, string> = {
  folder:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
  file: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>',
  'file-text':
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
  'file-code':
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m10 13-2 2 2 2"/><path d="m14 17 2-2-2-2"/></svg>',
  'file-json':
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1"/><path d="M10 9a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1Z"/></svg>',
  'file-config':
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
  'file-data':
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>',
  image:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
};

function buildChipSpan(path: string, onRemove: () => void): HTMLSpanElement {
  const span = document.createElement('span');
  span.contentEditable = 'false';
  span.setAttribute('data-path', path);
  span.className = CHIP_CLASS;
  span.title = path;
  const { iconId, colorClass } = getFileIconInfo(path);
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.className = `chip-icon shrink-0 flex items-center [&_svg]:shrink-0 ${colorClass}`;
  icon.innerHTML = CHIP_ICON_SVG[iconId];
  const label = document.createElement('span');
  label.className = 'truncate max-w-[100px] sm:max-w-[120px]';
  label.textContent = pathDisplayName(path);
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className =
    'absolute top-1/2 -translate-y-1/2 right-[5px] opacity-0 group-hover:opacity-100 size-4 rounded-full flex items-center justify-center hover:bg-muted transition-opacity';
  removeBtn.setAttribute('aria-label', 'Remove');
  removeBtn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  removeBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove();
  };
  span.appendChild(icon);
  span.appendChild(label);
  span.appendChild(removeBtn);
  return span;
}

export function MentionInput({
  value,
  onChange,
  onCursorChange,
  onValueAndCursor,
  placeholder,
  disabled,
  onKeyDown,
  onPaste,
  id,
  className,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onCursorChange?: (offset: number) => void;
  onValueAndCursor?: (value: string, cursorOffset: number) => void;
  placeholder?: string;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  id?: string;
  className?: string;
  inputRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const ref = inputRef ?? divRef;
  const lastEmittedRef = useRef(value);
  const savedCaretRef = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    const segments = parseToSegments(value);
    el.innerHTML = '';
    const isEmpty = segments.length === 1 && segments[0]?.type === 'text' && segments[0].value === '';
    if (!isEmpty) {
      for (const s of segments) {
        if (s.type === 'text') {
          el.appendChild(document.createTextNode(s.value));
        } else {
          const chipPath = s.path;
          const onRemove = () => {
            const root = ref.current;
            if (!root) return;
            const segs = readDomFromEl(root);
            const next = segs.filter((seg) => seg.type !== 'mention' || seg.path !== chipPath);
            const str = segmentsToStr(next);
            onChange(str);
          };
          el.appendChild(buildChipSpan(chipPath, onRemove));
        }
      }
    }
    const totalLen = segmentsToStr(segments).length;
    if (savedCaretRef.current !== null) {
      setCaretOffset(el, Math.min(savedCaretRef.current, totalLen));
      savedCaretRef.current = null;
    } else {
      setCaretOffset(el, totalLen);
    }
    onCursorChange?.(totalLen);
  }, [value, onCursorChange, onChange, ref]);

  const readDomToSegments = useCallback((): Segment[] => {
    const el = ref.current;
    if (!el) return [];
    const out: Segment[] = [];
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const v = node.textContent ?? '';
        if (v) out.push({ type: 'text', value: v });
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const span = node as HTMLElement;
        const path = span.getAttribute('data-path');
        if (path) out.push({ type: 'mention', path });
        else out.push({ type: 'text', value: span.textContent ?? '' });
      }
    }
    if (out.length === 0) return [{ type: 'text', value: '' }];
    return out;
  }, [ref]);

  const handleInput = useCallback(() => {
    const next = readDomToSegments();
    const str = segmentsToStr(next);
    const sel = window.getSelection();
    const offset = sel && ref.current?.contains(sel.anchorNode) ? getCaretOffset(ref.current, sel) : str.length;
    if (str !== lastEmittedRef.current) {
      savedCaretRef.current = sel && ref.current?.contains(sel.anchorNode) ? offset : null;
      lastEmittedRef.current = str;
      onChange(str);
    }
    if (onValueAndCursor) {
      onValueAndCursor(str, offset);
    } else {
      onCursorChange?.(offset);
    }
  }, [readDomToSegments, onChange, onCursorChange, onValueAndCursor, ref]);

  const handleSelect = useCallback(() => {
    const sel = window.getSelection();
    if (sel && ref.current?.contains(sel.anchorNode)) {
      onCursorChange?.(getCaretOffset(ref.current, sel));
    }
  }, [onCursorChange, ref]);

  const removeChipAtPath = useCallback(
    (path: string) => {
      const root = ref.current;
      if (!root) return;
      const segs = readDomFromEl(root);
      let offset = 0;
      for (const s of segs) {
        if (s.type === 'mention' && s.path === path) break;
        offset += s.type === 'text' ? s.value.length : 1 + s.path.length;
      }
      const next = segs.filter((s) => s.type !== 'mention' || s.path !== path);
      const newVal = segmentsToStr(next);
      savedCaretRef.current = offset;
      if (onValueAndCursor) {
        onValueAndCursor(newVal, offset);
      } else {
        lastEmittedRef.current = newVal;
        onChange(newVal);
        onCursorChange?.(offset);
      }
    },
    [onChange, onCursorChange, onValueAndCursor, ref]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Backspace' && ref.current) {
        const sel = window.getSelection();
        if (!sel || !ref.current.contains(sel.anchorNode)) {
          onKeyDown?.(e);
          return;
        }
        const root = ref.current;
        let node: Node | null = sel.anchorNode;
        while (node && node !== root) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const path = (node as HTMLElement).getAttribute('data-path');
            if (path) {
              removeChipAtPath(path);
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }
          node = node.parentNode;
        }
        if (sel.anchorNode === root && sel.anchorOffset > 0) {
          const prevChild = root.childNodes[sel.anchorOffset - 1];
          if (prevChild?.nodeType === Node.ELEMENT_NODE) {
            const el = prevChild as HTMLElement;
            const path = el.getAttribute('data-path');
            if (path) {
              removeChipAtPath(path);
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }
        }
        if (sel.anchorOffset !== 0) {
          onKeyDown?.(e);
          return;
        }
        node = sel.anchorNode;
        while (node && node !== root) {
          const prev = node.previousSibling;
          if (prev && prev.nodeType === Node.ELEMENT_NODE) {
            const el = prev as HTMLElement;
            const path = el.getAttribute('data-path');
            if (path) {
              removeChipAtPath(path);
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }
          node = node.parentNode;
        }
      }
      onKeyDown?.(e);
    },
    [onChange, onCursorChange, onValueAndCursor, onKeyDown, ref, removeChipAtPath]
  );

  return (
    <div
      ref={ref}
      id={id}
      contentEditable={!disabled}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={placeholder}
      data-placeholder={placeholder}
      className={`min-h-[24px] max-h-32 overflow-y-auto py-2 outline-none resize-none text-xs sm:text-sm text-foreground [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-muted-foreground ${className ?? ''}`}
      onInput={handleInput}
      onSelect={handleSelect}
      onKeyDown={handleKeyDown}
      onPaste={onPaste}
    />
  );
}

export type ContentEditableSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; path: string };

function mergeTextIntoSegments(out: ContentEditableSegment[], chunk: string): void {
  if (!chunk) return;
  const last = out[out.length - 1];
  if (last?.type === 'text') last.value += chunk;
  else out.push({ type: 'text', value: chunk });
}

function hasRenderableOutput(out: ContentEditableSegment[]): boolean {
  return out.some((s) => (s.type === 'text' ? s.value.length > 0 : true));
}

function endsWithNewline(out: ContentEditableSegment[]): boolean {
  const last = out[out.length - 1];
  return last?.type === 'text' && last.value.endsWith('\n');
}

function isEffectivelyEmptySegments(segs: ContentEditableSegment[]): boolean {
  return segs.every((s) => s.type === 'text' && s.value === '');
}

function isBlockContainer(hi: HTMLElement): boolean {
  const tag = hi.tagName;
  return tag === 'DIV' || tag === 'P' || tag === 'PRE' || tag === 'LI';
}

function appendSegmentsMerge(out: ContentEditableSegment[], inner: ContentEditableSegment[]): void {
  for (const seg of inner) {
    if (seg.type === 'mention') out.push(seg);
    else mergeTextIntoSegments(out, seg.value);
  }
}

export function segmentsToStr(segments: ContentEditableSegment[]): string {
  return segments.map((s) => (s.type === 'text' ? s.value : `@${s.path}`)).join('');
}

/**
 * Reads a contenteditable root into segments. Browsers often represent line breaks as
 * sibling block nodes (e.g. Chrome uses DIVs) instead of BR; flattening only direct
 * children collapses newlines and breaks fenced code pasted across lines.
 */
export function readDomFromEl(el: HTMLElement): ContentEditableSegment[] {
  const out: ContentEditableSegment[] = [];
  const nodes = Array.from(el.childNodes);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    if (node.nodeType === Node.TEXT_NODE) {
      const v = node.textContent ?? '';
      if (v) mergeTextIntoSegments(out, v);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const hi = node as HTMLElement;
    const path = hi.getAttribute('data-path');
    if (path) {
      out.push({ type: 'mention', path });
      continue;
    }
    if (hi.tagName === 'BR') {
      mergeTextIntoSegments(out, '\n');
      continue;
    }
    if (isBlockContainer(hi)) {
      if (i > 0 && hasRenderableOutput(out) && !endsWithNewline(out)) {
        mergeTextIntoSegments(out, '\n');
      }
      const inner = readDomFromEl(hi);
      if (isEffectivelyEmptySegments(inner)) {
        mergeTextIntoSegments(out, '\n');
      } else {
        appendSegmentsMerge(out, inner);
      }
      continue;
    }
    const inner = readDomFromEl(hi);
    appendSegmentsMerge(out, inner);
  }
  if (out.length === 0) return [{ type: 'text', value: '' }];
  return out;
}

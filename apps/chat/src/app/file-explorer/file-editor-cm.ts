/**
 * Lazy-loaded CodeMirror 6 editor factory.
 * Import this module dynamically to keep the editor out of the initial bundle.
 */

import {
  EditorView, keymap, lineNumbers, highlightActiveLine,
  highlightActiveLineGutter, drawSelection, dropCursor,
  rectangularSelection, crosshairCursor, highlightSpecialChars,
} from '@codemirror/view';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  indentOnInput, bracketMatching, foldGutter, foldKeymap,
  syntaxHighlighting, defaultHighlightStyle,
} from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { markdown } from '@codemirror/lang-markdown';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { sql } from '@codemirror/lang-sql';
import { json } from '@codemirror/lang-json';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { go } from '@codemirror/lang-go';
import { yaml } from '@codemirror/lang-yaml';
import { xml } from '@codemirror/lang-xml';
import { sass } from '@codemirror/lang-sass';
import { vue } from '@codemirror/lang-vue';
import { php } from '@codemirror/lang-php';

export type EditorHandle = {
  view: EditorView;
  setContent: (content: string) => void;
  setReadOnly: (readOnly: boolean) => void;
  setTheme: (dark: boolean) => void;
  getContent: () => string;
  focus: () => void;
  destroy: () => void;
};

// Map of file extensions to CodeMirror language extensions.
// Exported so it can be tested and extended.
export const LANG_MAP: Record<string, () => Extension> = {
  js:   () => javascript(),
  jsx:  () => javascript({ jsx: true }),
  ts:   () => javascript({ typescript: true }),
  tsx:  () => javascript({ jsx: true, typescript: true }),
  mjs:  () => javascript(),
  cjs:  () => javascript(),
  mts:  () => javascript({ typescript: true }),
  cts:  () => javascript({ typescript: true }),
  md:   () => markdown(),
  mdx:  () => markdown(),
  css:  () => css(),
  scss: () => sass({ indented: false }),
  sass: () => sass({ indented: true }),
  less: () => css(),
  html: () => html(),
  htm:  () => html(),
  vue:  () => vue(),
  py:   () => python(),
  pyw:  () => python(),
  rs:   () => rust(),
  sql:  () => sql(),
  json: () => json(),
  json5:() => json(),
  java: () => java(),
  kt:   () => java(),
  kts:  () => java(),
  cpp:  () => cpp(),
  cc:   () => cpp(),
  cxx:  () => cpp(),
  c:    () => cpp(),
  h:    () => cpp(),
  hpp:  () => cpp(),
  go:   () => go(),
  yaml: () => yaml(),
  yml:  () => yaml(),
  xml:  () => xml(),
  svg:  () => xml(),
  toml: () => xml(),
  php:  () => php(),
};

/** Returns the CodeMirror language extension for a given filename, or null for plain text. */
export function getLanguageExtension(filename: string): Extension | null {
  const base = filename.includes('/') ? filename.slice(filename.lastIndexOf('/') + 1) : filename;
  // Special filenames with no dedicated CM6 language
  if (base === 'Dockerfile' || base.startsWith('Dockerfile.')) return null;
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1).toLowerCase() : '';
  return LANG_MAP[ext]?.() ?? null;
}

const LABEL_MAP: Record<string, string> = {
  js: 'JavaScript', jsx: 'JavaScript (JSX)',
  ts: 'TypeScript', tsx: 'TypeScript (TSX)',
  mjs: 'JavaScript', cjs: 'JavaScript',
  mts: 'TypeScript', cts: 'TypeScript',
  md: 'Markdown', mdx: 'MDX',
  css: 'CSS', scss: 'SCSS', sass: 'Sass', less: 'Less',
  html: 'HTML', htm: 'HTML', vue: 'Vue',
  py: 'Python', pyw: 'Python',
  rs: 'Rust', go: 'Go',
  sql: 'SQL', json: 'JSON', json5: 'JSON5',
  java: 'Java', kt: 'Kotlin', kts: 'Kotlin',
  cpp: 'C++', cc: 'C++', cxx: 'C++', c: 'C', h: 'C/C++ Header', hpp: 'C++ Header',
  yaml: 'YAML', yml: 'YAML',
  xml: 'XML', svg: 'SVG', toml: 'TOML',
  php: 'PHP',
};

/** Returns a human-readable language label for the status bar. */
export function getLanguageLabel(filename: string): string {
  const base = filename.includes('/') ? filename.slice(filename.lastIndexOf('/') + 1) : filename;
  if (base === 'Dockerfile' || base.startsWith('Dockerfile.')) return 'Dockerfile';
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1).toLowerCase() : '';
  return LABEL_MAP[ext] ?? (ext ? ext.toUpperCase() : 'Plain text');
}

// ── Shared theme spec ─────────────────────────────────────────────────────────

const FONT_FAMILY = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, Monaco, 'Courier New', monospace";

function buildTheme(dark: boolean): Extension {
  if (dark) {
    return EditorView.theme({
      '&': { backgroundColor: 'transparent', height: '100%', fontSize: '13px', fontFamily: FONT_FAMILY },
      '.cm-content': { padding: '8px 0', caretColor: '#a78bfa' },
      '.cm-focused': { outline: 'none' },
      '&.cm-focused .cm-cursor': { borderLeftColor: '#a78bfa' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'rgba(124,58,237,0.3)' },
      '.cm-gutters': { backgroundColor: 'rgba(0,0,0,0.2)', color: '#5a5a7a', border: 'none', borderRight: '1px solid rgba(255,255,255,0.06)', paddingRight: '8px', minWidth: '48px' },
      '.cm-lineNumbers': { color: '#4a4a6a' },
      '.cm-activeLine': { backgroundColor: 'rgba(124,58,237,0.06)' },
      '.cm-activeLineGutter': { backgroundColor: 'rgba(124,58,237,0.12)', color: '#c4c4dc' },
      '.cm-foldGutter span': { color: '#5a5a7a' },
      '.cm-matchingBracket': { backgroundColor: 'rgba(124,58,237,0.2)', outline: '1px solid rgba(167,139,250,0.4)' },
    }, { dark: true });
  }
  return EditorView.theme({
    '&': { backgroundColor: 'transparent', height: '100%', fontSize: '13px', fontFamily: FONT_FAMILY },
    '.cm-content': { padding: '8px 0', caretColor: '#7c3aed' },
    '.cm-focused': { outline: 'none' },
    '&.cm-focused .cm-cursor': { borderLeftColor: '#7c3aed' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: '#ddd6fe' },
    '.cm-gutters': { backgroundColor: 'hsl(var(--card)/0.5)', color: 'hsl(var(--muted-foreground))', border: 'none', borderRight: '1px solid hsl(var(--border)/0.5)', paddingRight: '8px', minWidth: '48px' },
    '.cm-lineNumbers': { color: 'hsl(var(--muted-foreground)/0.7)' },
    '.cm-activeLine': { backgroundColor: 'hsl(var(--muted)/0.3)' },
    '.cm-activeLineGutter': { backgroundColor: 'hsl(var(--muted)/0.4)', color: 'hsl(var(--foreground))' },
    '.cm-foldGutter span': { color: 'hsl(var(--muted-foreground))' },
    '.cm-matchingBracket': { backgroundColor: '#7c3aed22', outline: '1px solid #7c3aed55' },
  }, { dark: false });
}

// ── Editor factory ────────────────────────────────────────────────────────────

export function createEditor({
  parent,
  content,
  filename,
  isDark,
  readOnly,
  onChange,
  onSave,
}: {
  parent: HTMLElement;
  content: string;
  filename: string;
  isDark: boolean;
  readOnly: boolean;
  onChange?: (content: string) => void;
  onSave?: (content: string) => void;
}): EditorHandle {
  const themeCompartment = new Compartment();
  const readOnlyCompartment = new Compartment();
  const langExtension = getLanguageExtension(filename);

  const extensions: Extension[] = [
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    lineNumbers(),
    foldGutter(),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
    keymap.of([{ key: 'Mod-s', run(view) { onSave?.(view.state.doc.toString()); return true; } }]),
    EditorView.updateListener.of((u) => { if (u.docChanged) onChange?.(u.state.doc.toString()); }),
    EditorView.lineWrapping,
    themeCompartment.of(isDark ? [oneDark, buildTheme(true)] : [buildTheme(false)]),
    readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
  ];

  if (langExtension) extensions.push(langExtension);

  const view = new EditorView({ state: EditorState.create({ doc: content, extensions }), parent });

  return {
    view,
    setContent: (c) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: c } }),
    setReadOnly: (ro) => view.dispatch({ effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(ro)) }),
    setTheme: (dark) => view.dispatch({ effects: themeCompartment.reconfigure(dark ? [oneDark, buildTheme(true)] : [buildTheme(false)]) }),
    getContent: () => view.state.doc.toString(),
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}

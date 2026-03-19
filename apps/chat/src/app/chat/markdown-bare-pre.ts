const LANGUAGE_NONE_CLASS = 'language-none';

export function normalizeBarePreElementsInContainer(container: ParentNode): boolean {
  let changed = false;
  container.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector('code')) return;
    if (!pre.firstChild) return;
    const code = document.createElement('code');
    code.className = LANGUAGE_NONE_CLASS;
    while (pre.firstChild) {
      code.appendChild(pre.firstChild);
    }
    pre.appendChild(code);
    changed = true;
  });
  return changed;
}

export function wrapBarePreElementsInHtmlString(html: string): string {
  if (typeof document === 'undefined') return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return normalizeBarePreElementsInContainer(tpl.content) ? tpl.innerHTML : html;
}

export function stringHash32(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

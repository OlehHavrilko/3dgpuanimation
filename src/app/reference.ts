import type { LevelMeta } from '../core/types';
import { content } from '../content';

/**
 * Sources & glossary: one modal with two tabs. Opens from the accuracy note, the finale, the
 * command palette, `G`, or `#ref=sources` / `#ref=glossary` in the URL. A glossary term can
 * jump to the scale where the thing is on screen.
 */
export function setupReference(opts: { metas: LevelMeta[]; jumpToLevel: (index: number) => void }) {
  const R = content.reference;
  const root = document.getElementById('reference')!;
  let open = false;
  let lastFocus: HTMLElement | null = null;
  let savedOverflow = '';

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  const panel = el('div', 'ref-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'ref-title');
  const head = el('div', 'ref-head');
  const title = el('h2', undefined, R.title);
  title.id = 'ref-title';
  const close = el('button', 'ref-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', R.close);
  head.append(title, close);

  const tabs = el('div', 'ref-tabs');
  tabs.setAttribute('role', 'tablist');
  const tabButtons = {} as Record<'glossary' | 'sources', HTMLButtonElement>;
  const sections = {} as Record<'glossary' | 'sources', HTMLElement>;
  for (const key of ['glossary', 'sources'] as const) {
    const b = el('button', 'ref-tab', R.tabs[key]);
    b.type = 'button';
    b.id = `ref-tab-${key}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `ref-${key}`);
    b.addEventListener('click', () => show(key));
    tabButtons[key] = b;
    tabs.appendChild(b);
    const s = el('section', 'ref-body');
    s.id = `ref-${key}`;
    s.setAttribute('role', 'tabpanel');
    s.setAttribute('aria-labelledby', b.id);
    sections[key] = s;
  }

  // Glossary, grouped by the scale it belongs to.
  const dl = el('dl', 'ref-terms');
  R.glossary.forEach((g) => {
    const dt = el('dt');
    dt.append(el('span', 'ref-term', g.term));
    const meta = opts.metas[g.level];
    if (meta) {
      const go = el('button', 'ref-go', R.goTo(meta.scale));
      go.type = 'button';
      go.addEventListener('click', () => {
        hide();
        opts.jumpToLevel(g.level);
      });
      dt.append(go);
    }
    dl.append(dt, el('dd', undefined, g.def));
  });
  sections.glossary.appendChild(dl);

  sections.sources.appendChild(el('p', 'ref-intro', R.sourcesIntro));
  const list = el('ol', 'ref-sources');
  for (const s of R.sources) {
    const li = el('li');
    const a = el('a', undefined, s.title);
    a.href = s.url;
    a.target = '_blank';
    a.rel = 'noopener';
    li.append(a, el('span', 'ref-pub', s.publisher), el('span', 'ref-covers', s.covers));
    list.appendChild(li);
  }
  sections.sources.appendChild(list);

  panel.append(head, tabs, sections.glossary, sections.sources);
  root.appendChild(panel);

  function show(key: 'glossary' | 'sources') {
    for (const k of ['glossary', 'sources'] as const) {
      const on = k === key;
      tabButtons[k].setAttribute('aria-selected', String(on));
      tabButtons[k].tabIndex = on ? 0 : -1;
      sections[k].hidden = !on;
    }
  }

  function toggle(key: 'glossary' | 'sources' = 'glossary', force = !open) {
    if (force) {
      show(key);
      if (open) return;
      open = true;
      lastFocus = document.activeElement as HTMLElement | null;
      savedOverflow = document.documentElement.style.overflow;
      // The page behind must not scroll (that would move the descent) while the list does.
      document.documentElement.style.overflow = 'hidden';
      root.classList.add('on');
      root.setAttribute('aria-hidden', 'false');
      document.body.classList.add('reference-open');
      close.focus();
    } else hide();
  }

  function hide() {
    if (!open) return;
    open = false;
    document.documentElement.style.overflow = savedOverflow;
    root.classList.remove('on');
    root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('reference-open');
    lastFocus?.focus?.();
  }

  close.addEventListener('click', hide);
  root.addEventListener('click', (e) => {
    if (e.target === root) hide();
  });
  // Any element can open it: `data-reference="sources"` (or "glossary").
  document.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-reference]');
    if (!t) return;
    e.preventDefault();
    toggle(t.dataset.reference === 'sources' ? 'sources' : 'glossary', true);
  });
  // Capture phase: while open, the dialog owns the keyboard (no F, Space, arrows for the scene).
  window.addEventListener(
    'keydown',
    (e) => {
      if (open) {
        if (e.key === 'Escape') hide();
        if (e.key !== 'Tab') e.stopPropagation();
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (document.body.classList.contains('palette')) return;
      if (e.code === 'KeyG' && !e.metaKey && !e.ctrlKey && !e.altKey) toggle('glossary', true);
    },
    true,
  );

  const fromHash = new URLSearchParams(location.hash.replace(/^#/, '')).get('ref');
  if (fromHash === 'sources' || fromHash === 'glossary') toggle(fromHash, true);

  return {
    toggle,
    get open() {
      return open;
    },
  };
}

import { content } from '../content';
export interface PaletteItem {
  id: string;
  label: string;
  kind: string;
  hint?: string;
  run: () => void;
}

/**
 * Ctrl/Cmd+K command palette: jump to any of the eight scales or straight to a named
 * part of the current one. Levels are always listed; entities come from the level's own
 * pickables, so every level gets the feature for free.
 */
export class CommandPalette {
  isOpen = false;
  private root = document.getElementById('palette')!;
  private input: HTMLInputElement;
  private list: HTMLElement;
  private items: PaletteItem[] = [];
  private shown: PaletteItem[] = [];
  private active = 0;
  private lastFocus: HTMLElement | null = null;

  constructor(private provider: () => PaletteItem[]) {
    this.root.innerHTML = `
      <div class="pal-panel" role="dialog" aria-modal="true">
        <div class="pal-search">
          <span class="pal-glyph">&#8984;K</span>
          <input type="text" autocomplete="off" spellcheck="false" />
        </div>
        <div class="pal-list" role="listbox"></div>
        <div class="pal-foot"></div>
      </div>`;
    const T = content.story.palette;
    this.root.querySelector('.pal-panel')!.setAttribute('aria-label', T.label);
    this.root.querySelector('input')!.placeholder = T.placeholder;
    this.root.querySelector('.pal-foot')!.textContent = T.foot;
    this.input = this.root.querySelector('input')!;
    this.list = this.root.querySelector('.pal-list')!;
    this.input.addEventListener('input', () => this.render());
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    this.isOpen = true;
    this.items = this.provider();
    this.root.classList.add('on');
    // The dialog must announce itself; leaving `aria-hidden="true"` hid it from screen readers.
    this.root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('palette');
    this.lastFocus = (document.activeElement as HTMLElement | null) ?? null;
    this.input.value = '';
    this.active = 0;
    this.render();
    this.input.focus();
  }

  close() {
    this.isOpen = false;
    this.root.classList.remove('on');
    this.root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('palette');
    this.input.blur();
    this.lastFocus?.focus?.();
    this.lastFocus = null;
  }

  private onKey(e: KeyboardEvent) {
    if (e.code === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.code === 'ArrowDown') {
      e.preventDefault();
      this.move(1);
    } else if (e.code === 'ArrowUp') {
      e.preventDefault();
      this.move(-1);
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      this.activate();
    }
  }

  private move(d: number) {
    if (!this.shown.length) return;
    this.active = (this.active + d + this.shown.length) % this.shown.length;
    this.paintActive();
  }

  private activate() {
    const item = this.shown[this.active];
    if (!item) return;
    this.close();
    item.run();
  }

  private render() {
    const q = this.input.value.trim().toLowerCase();
    this.shown = q
      ? this.items.filter((i) => `${i.label} ${i.kind} ${i.hint ?? ''}`.toLowerCase().includes(q))
      : this.items.slice();
    if (this.active >= this.shown.length) this.active = 0;
    this.list.innerHTML = '';
    if (!this.shown.length) {
      const empty = document.createElement('div');
      empty.className = 'pal-empty';
      empty.textContent = content.story.palette.empty;
      this.list.appendChild(empty);
      return;
    }
    this.shown.forEach((item, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'pal-row';
      row.innerHTML = '<span class="pal-kind"></span><span class="pal-label"></span><span class="pal-hint"></span>';
      (row.querySelector('.pal-kind') as HTMLElement).textContent = item.kind;
      (row.querySelector('.pal-label') as HTMLElement).textContent = item.label;
      (row.querySelector('.pal-hint') as HTMLElement).textContent = item.hint ?? '';
      row.addEventListener('click', () => {
        this.close();
        item.run();
      });
      if (i === this.active) row.classList.add('active');
      this.list.appendChild(row);
    });
  }

  private paintActive() {
    [...this.list.children].forEach((el, i) => el.classList.toggle('active', i === this.active));
    this.list.children[this.active]?.scrollIntoView({ block: 'nearest' });
  }
}

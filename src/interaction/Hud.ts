import type { EntityInfo, LevelControl, LevelMeta } from '../core/types';

export interface InspectorAction {
  label: string;
  run: () => void;
}

/** DOM side of the interaction layer: tooltip + leader line, spotlight, inspector, breadcrumb, nav. */
export class Hud {
  private tip = document.getElementById('tip')!;
  private tipKind = this.tip.querySelector('.tip-kind')!;
  private tipTitle = this.tip.querySelector('.tip-title')!;
  private tipSpecs = this.tip.querySelector('.tip-specs')!;
  private leader = document.getElementById('leader') as unknown as SVGSVGElement;
  private leaderLine = this.leader.querySelector('polyline')!;
  private leaderDot = this.leader.querySelector('circle')!;
  private spot = document.getElementById('spot')!;
  private insp = document.getElementById('inspector')!;
  private inspKind = this.insp.querySelector('.insp-kind')!;
  private inspTitle = this.insp.querySelector('.insp-title')!;
  private inspSpecs = this.insp.querySelector('.insp-specs')!;
  private inspNote = this.insp.querySelector('.insp-note')!;
  private inspActions = this.insp.querySelector('.insp-actions')!;
  private inspControls = this.insp.querySelector('.insp-controls')!;
  private crumbs = document.getElementById('crumbs')!;
  private prevBtn = document.getElementById('nav-prev') as HTMLButtonElement;
  private nextBtn = document.getElementById('nav-next') as HTMLButtonElement;
  private tipKey = '';

  onClose: (() => void) | null = null;

  constructor() {
    this.insp.querySelector('.insp-close')!.addEventListener('click', () => this.onClose?.());
  }

  // ---------------------------------------------------------------- tooltip
  showTip(key: string, info: EntityInfo, x: number, y: number) {
    if (key !== this.tipKey) {
      this.tipKey = key;
      this.tipKind.textContent = info.kind;
      this.tipTitle.textContent = info.title;
      this.tipSpecs.innerHTML = '';
      (info.specs ?? []).slice(0, 3).forEach(([k, v]) => {
        const row = document.createElement('div');
        row.innerHTML = `<span></span><b></b>`;
        row.children[0].textContent = k;
        row.children[1].textContent = v;
        this.tipSpecs.appendChild(row);
      });
    }
    // Card up-right of the target, flipped when it would leave the screen.
    const w = this.tip.offsetWidth || 200;
    const h = this.tip.offsetHeight || 80;
    const flipX = x + 70 + w > window.innerWidth - 12;
    const flipY = y - 60 - h < 12;
    const cx = flipX ? x - 70 - w : x + 70;
    const cy = flipY ? y + 50 : y - 60 - h;
    this.tip.style.transform = `translate(${cx}px, ${cy}px)`;
    this.tip.classList.add('on');
    // Leader: target dot -> elbow -> card corner.
    const ax = flipX ? cx + w : cx;
    const ay = flipY ? cy : cy + h;
    const ex = x + (ax - x) * 0.45;
    this.leaderLine.setAttribute('points', `${x},${y} ${ex},${ay} ${ax},${ay}`);
    this.leaderDot.setAttribute('cx', String(x));
    this.leaderDot.setAttribute('cy', String(y));
    this.leader.classList.add('on');
  }

  hideTip() {
    this.tipKey = '';
    this.tip.classList.remove('on');
    this.leader.classList.remove('on');
  }

  // ---------------------------------------------------------------- spotlight
  setSpot(x: number, y: number, r: number) {
    const inner = Math.max(40, r);
    this.spot.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(0,0,0,0) ${inner}px, rgba(1,3,2,0.62) ${inner * 1.9 + 40}px)`;
    this.spot.classList.add('on');
  }

  hideSpot() {
    this.spot.classList.remove('on');
  }

  // ---------------------------------------------------------------- inspector
  openInspector(
    heading: { kind: string; title: string; specs?: [string, string][]; note?: string },
    actions: InspectorAction[],
    controls: LevelControl[],
  ) {
    this.inspKind.textContent = heading.kind;
    this.inspTitle.textContent = heading.title;
    this.inspSpecs.innerHTML = '';
    (heading.specs ?? []).forEach(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      this.inspSpecs.append(dt, dd);
    });
    this.inspNote.textContent = heading.note ?? '';
    this.inspActions.innerHTML = '';
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = a.label;
      b.addEventListener('click', a.run);
      this.inspActions.appendChild(b);
    });
    this.renderControls(controls);
    this.insp.classList.add('on');
    document.body.classList.add('inspecting');
  }

  closeInspector() {
    this.insp.classList.remove('on');
    document.body.classList.remove('inspecting');
  }

  private renderControls(controls: LevelControl[]) {
    this.inspControls.innerHTML = '';
    for (const c of controls) {
      const wrap = document.createElement('div');
      wrap.className = 'ctl';
      const head = document.createElement('div');
      head.className = 'ctl-head';
      const label = document.createElement('span');
      label.textContent = c.label;
      const val = document.createElement('b');
      head.append(label, val);
      wrap.appendChild(head);
      if (c.kind === 'slider') {
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(c.min);
        input.max = String(c.max);
        input.step = String(c.step);
        input.value = String(c.value);
        const fmt = c.format ?? ((v: number) => v.toFixed(2));
        val.textContent = fmt(c.value);
        input.addEventListener('input', () => {
          const v = Number(input.value);
          c.value = v;
          val.textContent = fmt(v);
          c.onInput(v);
        });
        wrap.appendChild(input);
      } else {
        const seg = document.createElement('div');
        seg.className = 'seg';
        const buttons = c.options.map((o) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = o;
          b.classList.toggle('on', o === c.value);
          b.addEventListener('click', () => {
            c.value = o;
            buttons.forEach((x) => x.classList.toggle('on', x === b));
            c.onChange(o);
          });
          seg.appendChild(b);
          return b;
        });
        wrap.appendChild(seg);
      }
      this.inspControls.appendChild(wrap);
    }
  }

  // ---------------------------------------------------------------- breadcrumb + nav
  setCrumbs(metas: LevelMeta[], index: number, entity: string | null, onJump: (i: number) => void) {
    this.crumbs.innerHTML = '';
    for (let i = 0; i <= index; i++) {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'sep' + (i < index - 1 ? ' far' : '');
        sep.textContent = '›';
        this.crumbs.appendChild(sep);
      }
      const isCurrent = i === index;
      const el = document.createElement(isCurrent ? 'span' : 'button');
      el.textContent = metas[i].name;
      el.className = isCurrent ? 'current' : i < index - 1 ? 'far' : '';
      if (!isCurrent) el.addEventListener('click', () => onJump(i));
      this.crumbs.appendChild(el);
    }
    if (entity) {
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.textContent = '›';
      const el = document.createElement('span');
      el.className = 'entity';
      el.textContent = entity;
      this.crumbs.append(sep, el);
    }
  }

  setNav(index: number, count: number) {
    this.prevBtn.disabled = index <= 0;
    this.nextBtn.disabled = index >= count - 1;
  }
}

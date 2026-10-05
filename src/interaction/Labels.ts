import * as THREE from 'three';
import type { Level, PickHit } from '../core/types';
import { collectEntities } from './entities';

const _v = new THREE.Vector3();

/**
 * Optional 3D labels ("hotspots") for a level's named parts.
 *
 * Entities are read from the level's own pickables, so this stays level-agnostic: whatever
 * a level exposes for hover can also be pinned in space. Toggle with `L`.
 */
export class Labels {
  private container = document.getElementById('labels')!;
  private items: { hit: PickHit; el: HTMLElement }[] = [];
  visible = false;
  onPick: ((hit: PickHit) => void) | null = null;

  setLevel(level: Level) {
    this.clear();
    for (const hit of collectEntities(level)) {
      if (!hit.info.title) continue;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'label';
      el.innerHTML = '<span class="label-dot"></span><span class="label-text"></span>';
      const text = el.querySelector('.label-text') as HTMLElement;
      const kind = document.createElement('em');
      kind.textContent = hit.info.kind;
      const title = document.createElement('b');
      title.textContent = hit.info.title;
      text.append(kind, title);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onPick?.(hit);
      });
      this.container.appendChild(el);
      this.items.push({ hit, el });
    }
    this.sync();
  }

  setVisible(on: boolean) {
    this.visible = on;
    this.sync();
  }

  /**
   * Recompute entity bounds after a part has moved (a fan spinning, a slider exploding the
   * card). Called on a slow timer rather than per frame: `setFromObject` traverses children.
   */
  refreshBoxes(level: Level) {
    if (!this.visible || !this.items.length) return;
    const byKey = new Map(collectEntities(level).map((h) => [h.key, h]));
    for (const item of this.items) {
      const fresh = byKey.get(item.hit.key);
      if (fresh) item.hit.box.copy(fresh.box);
    }
  }

  toggle() {
    this.setVisible(!this.visible);
    return this.visible;
  }

  /** Refresh the stored hit (boxes move as parts animate / explode). */
  refresh() {
    for (const item of this.items) item.hit.box.copy(item.hit.box);
  }

  clear() {
    for (const item of this.items) item.el.remove();
    this.items = [];
  }

  private sync() {
    this.container.classList.toggle('on', this.visible && this.items.length > 0);
  }

  update(camera: THREE.PerspectiveCamera, hoverKey: string | null) {
    if (!this.visible) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const { hit, el } of this.items) {
      hit.box.getCenter(_v);
      const behind = _v.clone().sub(camera.position).dot(camera.getWorldDirection(_v2));
      _v.project(camera);
      if (behind < 0 || _v.z < -1 || _v.z > 1) {
        el.style.display = 'none';
        continue;
      }
      const x = (_v.x * 0.5 + 0.5) * w;
      const y = (-_v.y * 0.5 + 0.5) * h;
      const margin = 40;
      const onScreen = x > -margin && x < w + margin && y > -margin && y < h + margin;
      el.style.display = onScreen ? 'flex' : 'none';
      if (onScreen) el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
      el.classList.toggle('hot', hit.key === hoverKey);
    }
  }
}

const _v2 = new THREE.Vector3();

import type { LevelManager } from '../core/LevelManager';
import type { LevelMeta } from '../core/types';
import type { InteractionManager } from '../interaction/InteractionManager';
import type { Labels } from '../interaction/Labels';
import { CommandPalette, type PaletteItem } from '../interaction/CommandPalette';
import { collectEntities } from '../interaction/entities';
import { content } from '../content';

/** Ctrl/Cmd+K: jump to a scale, a part of the current level, or a view command. */
export function setupPalette(opts: {
  metas: LevelMeta[];
  manager: LevelManager;
  interaction: InteractionManager;
  labels: Labels;
  jumpToLevel: (index: number) => void;
  enabled: () => boolean;
  openReference: (tab: 'glossary' | 'sources') => void;
}) {
  const { metas, manager, interaction, labels, jumpToLevel, enabled, openReference } = opts;
  const T = content.ui.palette;
  const palette = new CommandPalette((): PaletteItem[] => {
    const items: PaletteItem[] = metas.map((m, i) => ({
      id: `lvl-${i}`,
      kind: T.scale(i + 1),
      label: m.name,
      hint: m.scale,
      run: () => jumpToLevel(i),
    }));
    const level = manager.current;
    if (level) {
      for (const hit of collectEntities(level)) {
        items.push({
          id: hit.key,
          kind: T.part,
          label: hit.info.title,
          hint: hit.info.kind,
          run: () => interaction.selectEntity(hit),
        });
      }
    }
    items.push({ id: 'cmd-labels', kind: T.view, label: T.labels, hint: 'L', run: () => labels.setVisible(true) });
    items.push({
      id: 'cmd-glossary',
      kind: T.view,
      label: T.glossary,
      hint: 'G',
      run: () => openReference('glossary'),
    });
    items.push({ id: 'cmd-sources', kind: T.view, label: T.sources, run: () => openReference('sources') });
    items.push({
      id: 'cmd-fullscreen',
      kind: T.view,
      label: T.fullscreen,
      hint: '⇧F',
      run: () =>
        void (document.fullscreenElement
          ? document.exitFullscreen().catch(() => {})
          : document.documentElement.requestFullscreen?.().catch(() => {})),
    });
    return items;
  });
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.code === 'KeyK' && enabled()) {
      e.preventDefault();
      palette.toggle();
    }
  });
  return palette;
}

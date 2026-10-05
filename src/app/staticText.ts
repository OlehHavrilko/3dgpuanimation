import { content } from '../content';

/** Fill the fixed HUD text in index.html from the content dictionary (the HTML keeps English fallbacks). */
export function applyStaticText() {
  const t = content.ui.static;
  const set = (selector: string, text: string) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  };
  set('#nav-explore', t.explore);
  set('#nav-follow', content.ui.follow);
  set('.fov-label', t.fovLabel);
  set('.tip-hint', t.tipHint);
  set('#explore-hint .mouse', t.exploreHintMouse);
  set('#explore-hint .touch', t.exploreHintTouch);
  const hint = document.getElementById('scroll-hint');
  if (hint?.firstChild) hint.firstChild.textContent = `${t.scrollHint} `;
}

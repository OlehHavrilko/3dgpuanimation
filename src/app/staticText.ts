import { content, lang, LANGS, switchLang } from '../content';

type StaticKey = keyof typeof content.ui.static;

/**
 * Fill the fixed text in index.html from the content dictionary (the HTML keeps English
 * fallbacks): data-i18n sets the text, data-i18n-title / data-i18n-aria the title and aria-label.
 */
export function applyStaticText() {
  const t = content.ui.static;
  const get = (key: string | undefined) => (key && key in t ? t[key as StaticKey] : undefined);
  document.documentElement.lang = lang;
  document.title = t.docTitle;
  document.querySelector('meta[name="description"]')?.setAttribute('content', t.docDescription);

  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const text = get(el.dataset.i18n);
    if (text !== undefined) el.textContent = text;
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    const text = get(el.dataset.i18nTitle);
    if (text !== undefined) el.title = text;
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    const text = get(el.dataset.i18nAria);
    if (text !== undefined) el.setAttribute('aria-label', text);
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-act]')) {
    const act = content.story.acts[Number(el.dataset.i18nAct)];
    if (act) el.textContent = act.title;
  }
  document.getElementById('nav-follow')!.textContent = content.ui.follow;
  document.getElementById('nav-sound')!.textContent = content.ui.sound.off;
  document.getElementById('nav-voice')!.textContent = content.ui.voice.off;
  setupLangSwitches();
}

/** EN | RU buttons (one on the landing card, one in the HUD); the current language is pressed. */
function setupLangSwitches() {
  for (const root of document.querySelectorAll<HTMLElement>('.lang-switch')) {
    root.replaceChildren(
      ...LANGS.map(({ id, label, name }) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.lang = id;
        b.textContent = label;
        b.title = name;
        b.setAttribute('aria-pressed', String(id === lang));
        b.addEventListener('click', () => switchLang(id));
        return b;
      }),
    );
  }
}

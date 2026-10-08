import { en } from './en';
import type { ru } from './ru';

/**
 * All user-facing text, per language. Levels and UI read from `content`; nothing user-visible
 * should be hard-coded in scene code. Every dictionary has the shape of the English one.
 *
 * The language is fixed for the page's lifetime: levels read their text when they are built,
 * so switching language stores the choice and reloads (keeping the #l=…&p=… position).
 */
export type Content = typeof en;
// Dictionaries must stay interchangeable: this fails to compile when `ru` drifts from the shape of `en`.
export type RuMatches = typeof ru extends Content ? true : never;
export type Lang = 'en' | 'ru';

export const LANGS: { id: Lang; label: string; name: string }[] = [
  { id: 'en', label: 'EN', name: 'English' },
  { id: 'ru', label: 'RU', name: 'Русский' },
];
const STORAGE_KEY = 'gpu-atom:lang';

const isLang = (v: unknown): v is Lang => v === 'en' || v === 'ru';

/** ?lang= wins (and is remembered), then the stored choice, then the browser's language. */
export function detectLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  const param = new URLSearchParams(window.location.search).get('lang');
  if (isLang(param)) {
    storeLang(param);
    return param;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    /* storage disabled: fall through to the browser language */
  }
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const p of prefs) {
    const base = (p ?? '').toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}

function storeLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

export const lang: Lang = detectLang();
// English ships with the page; Russian is a separate chunk fetched only when it is the active language.
export const content: Content = lang === 'ru' ? (await import('./ru')).ru : en;

/** Remember the choice and reload in that language, at the same place in the descent. */
export function switchLang(next: Lang) {
  if (next === lang) return;
  storeLang(next);
  const url = new URL(window.location.href);
  url.searchParams.delete('lang');
  window.location.replace(url.toString());
}

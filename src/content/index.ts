import { en } from './en';

/**
 * All user-facing text, per language. Levels and UI read from `content`; nothing user-visible
 * should be hard-coded in scene code. Only English exists today: a `ru` dictionary with the
 * same shape (typed as `Content`) slots in here.
 */
export type Content = typeof en;
export const content: Content = en;

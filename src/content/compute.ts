import { compute as en } from './en/compute';
import { compute as ru } from './ru/compute';
import { lang } from './index';

/**
 * The compute branch's own strings. Like the memory branch's, they are kept out of the shared
 * `en`/`ru` dictionaries so the main page never downloads them; `compute.html` imports this.
 */
export type ComputeContent = typeof en;
export const computeContent: ComputeContent = lang === 'ru' ? ru : en;

import { memory as en } from './en/memory';
import { memory as ru } from './ru/memory';
import { lang } from './index';

/**
 * The memory branch's own strings. They are deliberately kept out of the shared `en`/`ru`
 * dictionaries: the main page never reads them, and pulling them in made every visitor to
 * `index.html` download the whole memory glossary. `memory.html` imports this module instead.
 */
export type MemoryContent = typeof en;
export const memoryContent: MemoryContent = lang === 'ru' ? ru : en;

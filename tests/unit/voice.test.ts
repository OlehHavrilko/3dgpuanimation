import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { clipName } from '../../src/app/voice';
import { en } from '../../src/content/en';
import { ru } from '../../src/content/ru';
import { memory as memoryEn } from '../../src/content/en/memory';
import { memory as memoryRu } from '../../src/content/ru/memory';

const manifest = JSON.parse(readFileSync('public/voice/manifest.json', 'utf8')) as Record<
  string,
  Record<string, string>
>;

describe('narration clips', () => {
  for (const [lang, c, mem] of [
    ['en', en, memoryEn],
    ['ru', ru, memoryRu],
  ] as const) {
    it(`${lang}: every clip is named after the hash of its text`, () => {
      for (const [hash, text] of Object.entries(manifest[lang])) expect(clipName(text)).toBe(hash);
    });
    it(`${lang}: act cards and anchor numbers have a recording`, () => {
      const spoken = [
        ...c.story.acts.map((a) => `${a.title}. ${a.blurb}`),
        ...c.story.keyNumbers.map((k) => `${k.value} ${k.unit}. ${k.caption}`),
      ];
      for (const text of spoken) expect(manifest[lang][clipName(text)], text).toBe(text);
    });
    it(`${lang}: every fixed caption of the memory branch has a recording`, () => {
      const { chip, die, array, cell } = mem as unknown as Record<string, { captions: Record<string, unknown> }>;
      const captions = [chip, die, array, cell].flatMap((l) =>
        Object.values(l.captions).filter((v) => typeof v === 'string'),
      );
      for (const text of captions) expect(manifest[lang][clipName(text as string)], text as string).toBe(text);
    });
  }
});

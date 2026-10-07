import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { clipName } from '../../src/app/voice';
import { en } from '../../src/content/en';
import { ru } from '../../src/content/ru';

const manifest = JSON.parse(readFileSync('public/voice/manifest.json', 'utf8')) as Record<
  string,
  Record<string, string>
>;

describe('narration clips', () => {
  for (const [lang, c] of [
    ['en', en],
    ['ru', ru],
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
  }
});

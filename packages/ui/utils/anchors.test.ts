import { describe, expect, test } from 'bun:test';
import {
  decodeAnchorHash,
  getHeadingAnchorAliases,
  legacySlugifyHeadingAnchor,
  normalizeAnchorText,
  slugifyHeadingAnchor,
} from './anchors';

describe('anchor helpers', () => {
  test('normalizes inline markdown before slugging', () => {
    expect(normalizeAnchorText('Part I: **Project** `Overview`')).toBe('Part I: Project Overview');
    expect(normalizeAnchorText('[Docs](./docs.md) and [[notes|Notes Page]]')).toBe('Docs and Notes Page');
  });

  test('decodes anchor hashes and strips callback suffixes', () => {
    expect(decodeAnchorHash('#section--overview')).toBe('section--overview');
    expect(decodeAnchorHash('#section--overview?cb=https://example.com&ct=token')).toBe(
      'section--overview',
    );
  });

  test('keeps malformed percent-encoded hashes non-fatal', () => {
    expect(decodeAnchorHash('#bad%E0%A4%A')).toBe('bad%E0%A4%A');
  });

  test('creates a canonical collapsed slug', () => {
    expect(slugifyHeadingAnchor('Part I: Project Overview: Goals and Scope')).toBe(
      'part-i-project-overview-goals-and-scope',
    );
  });

  test('creates a legacy slug variant that preserves repeated separators', () => {
    expect(legacySlugifyHeadingAnchor('Part I: Project Overview: Goals and Scope')).toBe(
      'part-i--project-overview--goals-and-scope',
    );
  });

  test('returns both canonical and legacy aliases without duplicates', () => {
    expect(getHeadingAnchorAliases('Simple Heading')).toEqual(['simple-heading']);
    expect(getHeadingAnchorAliases('Part I: Project Overview: Goals and Scope')).toEqual([
      'part-i-project-overview-goals-and-scope',
      'part-i--project-overview--goals-and-scope',
    ]);
  });
});

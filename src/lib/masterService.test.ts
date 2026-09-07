import { describe, it, expect } from 'vitest';
import { findRowByAwb, resolveCanonicalAwb, normalize, type MasterRow } from './masterService';

describe('findRowByAwb', () => {
  it('finds an exact match on a plain "awb" column', () => {
    const rows: MasterRow[] = [{ awb: '111111111111' }, { awb: '222222222222' }];
    expect(findRowByAwb(rows, '222222222222')).toBe(1);
  });

  it('is case-insensitive and trims whitespace', () => {
    const rows: MasterRow[] = [{ awb: 'AbC123' }];
    expect(findRowByAwb(rows, '  abc123  ')).toBe(0);
  });

  it('returns -1 when there is no match at all', () => {
    const rows: MasterRow[] = [{ awb: '111111111111' }];
    expect(findRowByAwb(rows, '999999999999')).toBe(-1);
  });

  it('treats leading zeros as equivalent for purely numeric AWBs, regardless of courier', () => {
    const rows: MasterRow[] = [{ awb: '123456789' }];
    expect(findRowByAwb(rows, '0123456789')).toBe(0);
  });

  it('falls back to scanning every column when no recognized AWB-pattern column exists', () => {
    const rows: MasterRow[] = [{ 'Some Random Field': '555555555555' }];
    expect(findRowByAwb(rows, '555555555555')).toBe(0);
  });

  describe('Amazon/SHIPEASO checksum leniency (isAmazon: true)', () => {
    // Real production case from this app's own debugging session: Amazon's return
    // label barcode decodes to [0-pad][real AWB][GS1 mod-10 check digit].
    const REAL_AWB = '370321220945';
    const SCANNED = '03703212209458'; // leading 0 + trailing check digit 8

    it('strips a verified GS1 check digit + leading zero pad to find the real row', () => {
      const rows: MasterRow[] = [{ awb: REAL_AWB }];
      expect(findRowByAwb(rows, SCANNED, { isAmazon: true })).toBe(0);
    });

    it('does NOT apply checksum leniency when isAmazon is false — same input, strict courier stays exact-match-only', () => {
      const rows: MasterRow[] = [{ awb: REAL_AWB }];
      expect(findRowByAwb(rows, SCANNED, { isAmazon: false })).toBe(-1);
      expect(findRowByAwb(rows, SCANNED)).toBe(-1); // default (no opts) must also stay strict
    });

    it('falls back to a 1-character edge trim when the AWB is not purely numeric (so no GS1 checksum applies)', () => {
      // Alphanumeric AWB: stripValidCheckDigit only ever operates on digit strings,
      // so this can only resolve via the edge-trim fallback, not the GS1 check-digit path.
      const rows: MasterRow[] = [{ awb: 'ax7f3210' }];
      expect(findRowByAwb(rows, '0ax7f3210', { isAmazon: true })).toBe(0);
    });

    it('refuses to guess when different edge trims each match a different row', () => {
      // Scanning "0bbbbbbb9": dropping the first char ("bbbbbbb9") matches row 0,
      // and separately dropping the last char ("0bbbbbbb") matches row 1 — two
      // genuinely different, equally-plausible candidates. Must not pick either.
      const rows: MasterRow[] = [{ awb: 'bbbbbbb9' }, { awb: '0bbbbbbb' }];
      expect(findRowByAwb(rows, '0bbbbbbb9', { isAmazon: true })).toBe(-1);
    });
  });
});

describe('resolveCanonicalAwb', () => {
  it('prefers a non-empty AWB-pattern column over the scanned fallback text', () => {
    const row: MasterRow = { AWB: '', awb: '370321220945', 'AWB Number': '370321220945' };
    expect(resolveCanonicalAwb(row, '03703212209458')).toBe('370321220945');
  });

  it('falls back to the provided value when no AWB-pattern column has real data', () => {
    const row: MasterRow = { AWB: '', awb: '' };
    expect(resolveCanonicalAwb(row, '03703212209458')).toBe('03703212209458');
  });
});

describe('normalize', () => {
  it('converts a whole-number float to a plain integer string (Excel numeric-AWB artifact)', () => {
    expect(normalize(370321220945)).toBe('370321220945');
  });

  it('lowercases and trims strings', () => {
    expect(normalize('  ABC123  ')).toBe('abc123');
  });

  it('returns an empty string for null/undefined', () => {
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
  });
});

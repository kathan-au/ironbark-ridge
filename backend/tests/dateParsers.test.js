const { parseFuelDate, isMonthYearFormat, parseIncidentDate } = require('../src/lib/dateParsers');

describe('parseFuelDate', () => {
  test('parses ISO format (YYYY-MM-DD)', () => {
    expect(parseFuelDate('2025-12-19')).toBe('2025-12-19');
  });

  test('parses DD/MM/YYYY format', () => {
    expect(parseFuelDate('21/05/2026')).toBe('2026-05-21');
  });

  test('parses Mon-YY format, defaulting to the 1st of the month', () => {
    expect(parseFuelDate('Oct-25')).toBe('2025-10-01');
  });

  test('parses Feb-26 correctly (regression: 2-digit year handling)', () => {
    expect(parseFuelDate('Feb-26')).toBe('2026-02-01');
  });

  test('returns null for a completely unrecognised format', () => {
    expect(parseFuelDate('not a date')).toBeNull();
  });

  test('returns null for an empty string', () => {
    expect(parseFuelDate('')).toBeNull();
  });

  test('handles surrounding whitespace', () => {
    expect(parseFuelDate('  2025-06-01  ')).toBe('2025-06-01');
  });
});

describe('isMonthYearFormat', () => {
  test('recognises a valid Mon-YY string', () => {
    expect(isMonthYearFormat('Oct-25')).toBe(true);
  });

  test('rejects a full ISO date', () => {
    expect(isMonthYearFormat('2025-10-25')).toBe(false);
  });

  test('rejects an invalid month abbreviation', () => {
    expect(isMonthYearFormat('Xyz-25')).toBe(false);
  });

  test('rejects a string with no dash', () => {
    expect(isMonthYearFormat('Oct25')).toBe(false);
  });
});

describe('parseIncidentDate', () => {
  test('parses DD/MM/YYYY correctly', () => {
    expect(parseIncidentDate('22/01/2025')).toBe('2025-01-22');
  });

  test('does not confuse day and month (regression check)', () => {
    // 05/11/2025 should be 5 November, NOT 11 May -- this is the exact class
    // of bug that silently produces a plausible-but-wrong date.
    expect(parseIncidentDate('05/11/2025')).toBe('2025-11-05');
  });

  test('returns null for an unrecognised format', () => {
    expect(parseIncidentDate('2025-11-05')).toBeNull();
  });
});
const { normaliseAbn, normaliseNameForMatching, groupDuplicateSuppliers } = require('../src/lib/supplierMatching');

describe('normaliseAbn', () => {
  test('strips spaces from a valid 11-digit ABN', () => {
    expect(normaliseAbn('63 004 085 616')).toBe('63004085616');
  });

  test('returns null for a blank ABN', () => {
    expect(normaliseAbn('')).toBeNull();
  });

  test('returns null for an ABN with the wrong digit count', () => {
    expect(normaliseAbn('5501822')).toBeNull();
  });
});

describe('normaliseNameForMatching', () => {
  test('strips "Pty Ltd" suffix', () => {
    expect(normaliseNameForMatching('Ironline Fuel Distributors Pty Ltd'))
      .toBe(normaliseNameForMatching('Ironline Fuel Distributors P/L'));
  });

  test('is case-insensitive', () => {
    expect(normaliseNameForMatching('ACME CO')).toBe(normaliseNameForMatching('acme co'));
  });
});

describe('groupDuplicateSuppliers', () => {
  test('merges two rows sharing a valid ABN despite a name typo (Blackwood case)', () => {
    const records = [
      { supplier_name: 'Blackwood Heavy Maintenance', abn: '84 112 334 908', fy_spend_aud: '2150000' },
      { supplier_name: 'Blackwood Heavy Maintanence', abn: '84 112 334 908', fy_spend_aud: '415000' },
    ];
    const groups = groupDuplicateSuppliers(records);
    expect(groups.length).toBe(1);
    expect(groups[0].length).toBe(2);
  });

  test('merges two rows via name match when one has a missing ABN (Ironline case)', () => {
    const records = [
      { supplier_name: 'Ironline Fuel Distributors Pty Ltd', abn: '63 004 085 616', fy_spend_aud: '8940000' },
      { supplier_name: 'Ironline Fuel Distributors P/L', abn: '', fy_spend_aud: '1212000' },
    ];
    const groups = groupDuplicateSuppliers(records);
    expect(groups.length).toBe(1);
    expect(groups[0].length).toBe(2);
  });

  test('does NOT merge genuinely distinct suppliers', () => {
    const records = [
      { supplier_name: 'Apex Drill & Blast Services', abn: '39 601 227 114', fy_spend_aud: '1000000' },
      { supplier_name: 'Coral Coast Camp Catering', abn: '77 098 445 231', fy_spend_aud: '500000' },
    ];
    const groups = groupDuplicateSuppliers(records);
    expect(groups.length).toBe(2);
  });

  test('handles a supplier with no duplicates as its own group', () => {
    const records = [
      { supplier_name: 'Queensland Grid Energy Retail', abn: '21 010 991 452', fy_spend_aud: '3480000' },
    ];
    const groups = groupDuplicateSuppliers(records);
    expect(groups.length).toBe(1);
    expect(groups[0].length).toBe(1);
  });

  test('transitively merges three rows connected via different signals', () => {
    const records = [
      { supplier_name: 'Delta Comms', abn: '53 134 887 209', fy_spend_aud: '100000' },
      { supplier_name: 'Delta Comms & IT', abn: '53 134 887 209', fy_spend_aud: '200000' },
      { supplier_name: 'Delta Comms & IT', abn: '', fy_spend_aud: '50000' },
    ];
    const groups = groupDuplicateSuppliers(records);
    expect(groups.length).toBe(1);
    expect(groups[0].length).toBe(3);
  });
});
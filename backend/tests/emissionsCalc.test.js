const {
  calculateFuelEmissions,
  calculateElectricityEmissions,
  sumFuelEmissionsByMonth,
} = require('../src/lib/emissionsCalc');

describe('calculateFuelEmissions', () => {
  test('multiplies litres by the emission factor', () => {
    expect(calculateFuelEmissions(1000, 2.7)).toBe(2700);
  });

  test('returns 0 when quantity is null (unparseable source data)', () => {
    expect(calculateFuelEmissions(null, 2.7)).toBe(0);
  });

  test('returns 0 when factor is null (unmatched fuel type)', () => {
    expect(calculateFuelEmissions(1000, null)).toBe(0);
  });

  test('handles zero litres correctly (not the same as missing data)', () => {
    expect(calculateFuelEmissions(0, 2.7)).toBe(0);
  });
});

describe('calculateElectricityEmissions', () => {
  test('multiplies kWh by the emission factor', () => {
    expect(calculateElectricityEmissions(1000000, 0.71)).toBe(710000);
  });

  test('returns 0 when consumption is null', () => {
    expect(calculateElectricityEmissions(null, 0.71)).toBe(0);
  });
});

describe('sumFuelEmissionsByMonth', () => {
test('sums multiple deliveries within the same month', () => {
  const rows = [
    { fuel_type: 'Diesel', quantity_litres: 1000, month: '2025-01' },
    { fuel_type: 'Diesel', quantity_litres: 500, month: '2025-01' },
  ];
  const factors = { 'Diesel combustion (stationary & transport)': 2.7 };

  const result = sumFuelEmissionsByMonth(rows, factors);
  expect(result['2025-01']).toBeCloseTo(1500 * 2.7); // floating-point safe comparison
});

  test('keeps different months separate', () => {
    const rows = [
      { fuel_type: 'Diesel', quantity_litres: 1000, month: '2025-01' },
      { fuel_type: 'Diesel', quantity_litres: 1000, month: '2025-02' },
    ];
    const factors = { 'Diesel combustion (stationary & transport)': 2.7 };

    const result = sumFuelEmissionsByMonth(rows, factors);
    expect(result['2025-01']).toBe(2700);
    expect(result['2025-02']).toBe(2700);
  });

  test('skips rows with an unrecognised fuel type rather than crashing', () => {
    const rows = [
      { fuel_type: 'Unknown Fuel', quantity_litres: 1000, month: '2025-01' },
    ];
    const factors = { 'Diesel combustion (stationary & transport)': 2.7 };

    const result = sumFuelEmissionsByMonth(rows, factors);
    expect(result['2025-01']).toBeUndefined();
  });

  test('correctly handles Petrol (ULP) using its own factor, not diesel\'s', () => {
    const rows = [
      { fuel_type: 'Petrol (ULP)', quantity_litres: 1000, month: '2025-01' },
    ];
    const factors = {
      'Diesel combustion (stationary & transport)': 2.7,
      'Petrol (ULP) combustion': 2.31,
    };

    const result = sumFuelEmissionsByMonth(rows, factors);
    expect(result['2025-01']).toBe(2310); // NOT 2700
  });
});
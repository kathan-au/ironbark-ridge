// Maps a fuel_type value to the matching activity name in emission_factors.
const FUEL_TYPE_TO_ACTIVITY = {
  'Diesel': 'Diesel combustion (stationary & transport)',
  'Petrol (ULP)': 'Petrol (ULP) combustion',
};

// Pure function: given a litres amount and a kg CO2e-per-litre factor, returns emissions in kg CO2e.
function calculateFuelEmissions(quantityLitres, kgCo2ePerLitre) {
  if (quantityLitres == null || kgCo2ePerLitre == null) return 0;
  return quantityLitres * kgCo2ePerLitre;
}

// Pure function: same idea for electricity.
function calculateElectricityEmissions(consumptionKwh, kgCo2ePerKwh) {
  if (consumptionKwh == null || kgCo2ePerKwh == null) return 0;
  return consumptionKwh * kgCo2ePerKwh;
}

// Pure function: given fuel rows and a lookup of activity->factor, sums emissions by month.
function sumFuelEmissionsByMonth(fuelRows, activityToFactor) {
  const byMonth = {};
  for (const row of fuelRows) {
    const activity = FUEL_TYPE_TO_ACTIVITY[row.fuel_type];
    const factor = activityToFactor[activity];
    if (!factor) continue;

    const emissions = calculateFuelEmissions(row.quantity_litres, factor);
    byMonth[row.month] = (byMonth[row.month] || 0) + emissions;
  }
  return byMonth;
}

module.exports = {
  FUEL_TYPE_TO_ACTIVITY,
  calculateFuelEmissions,
  calculateElectricityEmissions,
  sumFuelEmissionsByMonth,
};
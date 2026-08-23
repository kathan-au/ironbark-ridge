require('dotenv').config();

async function main() {
  console.log('--- Ingesting fuel deliveries ---');
  await require('./ingestFuel');

  console.log('--- Ingesting electricity readings ---');
  await require('./ingestElectricity');

  // add incidents + suppliers here once written
}

main();
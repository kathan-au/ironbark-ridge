function normaliseAbn(rawAbn) {
  if (!rawAbn || rawAbn.trim() === '') return null;
  const digitsOnly = rawAbn.split(' ').join('');
  if (digitsOnly.length !== 11) return null; // not a valid ABN length
  return digitsOnly;
}

function normaliseNameForMatching(name) {
  // Strip common legal suffixes/punctuation so near-identical names can be compared
  let value = name.trim().toLowerCase();
  const suffixesToStrip = ['pty ltd', 'p/l', 'co', 'ltd', 'pty', 'inc'];
  for (const suffix of suffixesToStrip) {
    value = value.split(' ' + suffix).join('');
  }
  value = value.split('.').join('').split(',').join('').trim();
  return value;
}

// Groups supplier rows that appear to be the same company.
// Pass 1: group by normalised name.
// Pass 2: merge any two name-groups that also share a valid ABN
// (catches typo cases like "Maintenance" vs "Maintanence", where names
// don't match but ABN does).
function groupDuplicateSuppliers(records) {
  const nameGroups = {};
  for (const row of records) {
    const nameKey = normaliseNameForMatching(row['supplier_name']);
    if (!nameGroups[nameKey]) nameGroups[nameKey] = [];
    nameGroups[nameKey].push(row);
  }

  const abnToNameKey = {};

  for (const nameKey in nameGroups) {
    for (const row of nameGroups[nameKey]) {
      const abn = normaliseAbn(row['abn']);
      if (!abn) continue;

      if (abnToNameKey[abn] && abnToNameKey[abn] !== nameKey) {
        const targetKey = abnToNameKey[abn];
        nameGroups[targetKey].push(...nameGroups[nameKey]);
        nameGroups[nameKey] = [];
      } else {
        abnToNameKey[abn] = nameKey;
      }
    }
  }

  return Object.values(nameGroups).filter(group => group.length > 0);
}

module.exports = {
  normaliseAbn,
  normaliseNameForMatching,
  groupDuplicateSuppliers,
};
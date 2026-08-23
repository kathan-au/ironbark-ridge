function normaliseAbn(rawAbn) {
  if (!rawAbn || rawAbn.trim() === '') return null;
  const digitsOnly = rawAbn.split(' ').join('');
  if (digitsOnly.length !== 11) return null;
  return digitsOnly;
}

function normaliseNameForMatching(name) {
  let value = name.trim().toLowerCase();
  const suffixesToStrip = ['pty ltd', 'p/l', 'co', 'ltd', 'pty', 'inc'];
  for (const suffix of suffixesToStrip) {
    value = value.split(' ' + suffix).join('');
  }
  value = value.split('.').join('').split(',').join('').trim();
  return value;
}

function createUnionFind(size) {
  const parent = Array.from({ length: size }, (_, i) => i);

  function find(i) {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  }

  function union(i, j) {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) parent[rootI] = rootJ;
  }

  return { find, union };
}

// Groups supplier rows that appear to be the same company, matching on
// shared ABN or matching normalised name. Returns an array of groups,
// where each group is an array of the original rows.
function groupDuplicateSuppliers(records) {
  const abns = records.map(r => normaliseAbn(r['abn']));
  const nameKeys = records.map(r => normaliseNameForMatching(r['supplier_name']));

  const uf = createUnionFind(records.length);

  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const sameAbn = abns[i] && abns[j] && abns[i] === abns[j];
      const sameName = nameKeys[i] === nameKeys[j];
      if (sameAbn || sameName) {
        uf.union(i, j);
      }
    }
  }

  const groups = {};
  for (let i = 0; i < records.length; i++) {
    const root = uf.find(i);
    if (!groups[root]) groups[root] = [];
    groups[root].push(records[i]);
  }

  return Object.values(groups);
}

module.exports = {
  normaliseAbn,
  normaliseNameForMatching,
  groupDuplicateSuppliers,
};
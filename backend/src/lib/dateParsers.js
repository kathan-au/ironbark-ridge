// Parses fuel_deliveries.csv dates, which appear in 3 different formats:
// ISO ("2025-12-19"), DD/MM/YYYY ("21/05/2026"), and Mon-YY ("Oct-25").
function parseFuelDate(rawDate) {
  const value = rawDate.trim();

  // Format 1: ISO date, e.g. "2025-12-19"
  if (value.includes('-')) {
    const parts = value.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const [year, month, day] = parts;
      return `${year}-${month}-${day}`;
    }
  }

  // Format 2: DD/MM/YYYY, e.g. "21/05/2026"
  if (value.includes('/')) {
    const parts = value.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      return `${year}-${month}-${day}`;
    }
  }

  // Format 3: Mon-YY, e.g. "Oct-25" or "Feb-26"
  const months = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };
  if (value.includes('-')) {
    const parts = value.split('-');
    if (parts.length === 2 && months[parts[0]]) {
      const monthNumber = months[parts[0]];
      const year = '20' + parts[1];
      return `${year}-${monthNumber}-01`;
    }
  }

  return null;
}

function isMonthYearFormat(rawDate) {
  const value = rawDate.trim();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  if (!value.includes('-')) return false;

  const parts = value.split('-');
  if (parts.length !== 2) return false;

  const [monthPart, yearPart] = parts;
  return months.includes(monthPart) && yearPart.length === 2;
}

// Parses incident_register.csv dates, which are consistently DD/MM/YYYY.
function parseIncidentDate(rawDate) {
  const value = rawDate.trim();
  if (!value.includes('/')) return null;

  const parts = value.split('/');
  if (parts.length !== 3) return null;

  const [day, month, year] = parts;
  return `${year}-${month}-${day}`;
}

module.exports = { parseFuelDate, isMonthYearFormat, parseIncidentDate };
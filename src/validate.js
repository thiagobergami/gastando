const isMonth = v => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v);
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isPositiveInt = v => Number.isInteger(v) && v > 0;

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

module.exports = { isMonth, isDate, isPositiveInt, fail };

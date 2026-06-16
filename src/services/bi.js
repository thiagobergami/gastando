const { addMonths } = require('./dates');

function monthRange(from, to) {
  const months = [];
  let cur = from;
  for (let i = 0; i < 600 && cur <= to; i++) { months.push(cur); cur = addMonths(cur, 1); }
  return months;
}

function trends(db, from, to) {
  const months = monthRange(from, to);
  const cats = db.prepare('SELECT id, name FROM categories WHERE active=1 ORDER BY sort_order, id').all();
  const q = db.prepare(
    `SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions
     WHERE category_id=? AND strftime('%Y-%m', date)=?`);
  const series = cats.map(c => ({
    category_id: c.id, name: c.name,
    spent_cents: months.map(m => q.get(c.id, m).s),
  }));
  return { months, series };
}

module.exports = { trends, monthRange };

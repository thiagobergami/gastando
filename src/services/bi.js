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

function byCard(db, from, to) {
  const months = monthRange(from, to);
  const cards = db.prepare('SELECT id, name FROM cards ORDER BY id').all();
  const q = db.prepare(
    `SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions WHERE card_id=? AND strftime('%Y-%m', date)=?`);
  const series = cards.map(c => ({
    card_id: c.id, name: c.name,
    spent_cents: months.map(m => q.get(c.id, m).s),
  }));
  return { months, series };
}

function byGroup(db, from, to) {
  const months = monthRange(from, to);
  const groups = db.prepare('SELECT id, name FROM groups ORDER BY sort_order, id').all();
  const q = db.prepare(
    `SELECT COALESCE(SUM(t.amount_cents),0) AS s FROM transactions t
     JOIN categories c ON c.id = t.category_id
     WHERE c.group_id=? AND strftime('%Y-%m', t.date)=?`);
  const series = groups.map(g => ({
    group_id: g.id, name: g.name,
    spent_cents: months.map(m => q.get(g.id, m).s),
  }));
  return { months, series };
}

function budgetVsActual(db, from, to) {
  const months = monthRange(from, to);
  const cats = db.prepare('SELECT id FROM categories WHERE active=1').all();
  const pickLimit = db.prepare(
    `SELECT limit_cents FROM category_limits WHERE category_id=? AND month<=? ORDER BY month DESC LIMIT 1`);
  const spendAll = db.prepare(
    `SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions WHERE strftime('%Y-%m', date)=?`);
  const limit_cents = months.map(m =>
    cats.reduce((sum, c) => {
      const l = pickLimit.get(c.id, m);
      return sum + (l ? l.limit_cents : 0);
    }, 0));
  const spent_cents = months.map(m => spendAll.get(m).s);
  return {
    months,
    series: [
      { name: 'Limit', spent_cents: limit_cents },
      { name: 'Spent', spent_cents },
    ],
  };
}

function installmentForecast(db, from, to) {
  const months = monthRange(from, to);
  const q = db.prepare(
    `SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions WHERE installment_group_id IS NOT NULL AND strftime('%Y-%m', date)=?`);
  return {
    months,
    series: [{ name: 'Committed installments', spent_cents: months.map(m => q.get(m).s) }],
  };
}

module.exports = { trends, byCard, byGroup, budgetVsActual, installmentForecast, monthRange };

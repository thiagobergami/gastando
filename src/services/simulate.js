const { splitCents } = require('./installments');
const { addMonths } = require('./dates');

// Read-only what-if. Projects a (possibly installment) purchase onto a category's
// monthly limit across the affected months. Returns null if the category is unknown/inactive.
function simulatePurchase(db, { category_id, total_cents, count, first_month }) {
  const cat = db.prepare(`SELECT id, name FROM categories WHERE id=? AND active=1`).get(category_id);
  if (!cat) return null;

  // No limit row for the category/month yields limit_cents: 0 (mirrors dashboard.js).
  const pickLimit = db.prepare(
    `SELECT limit_cents FROM category_limits WHERE category_id=? AND month<=? ORDER BY month DESC LIMIT 1`);
  const sumSpend = db.prepare(
    `SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions WHERE category_id=? AND strftime('%Y-%m', date)=?`);

  const amounts = splitCents(total_cents, count);
  const months = amounts.map((installment_cents, i) => {
    const month = addMonths(first_month, i);
    const lim = pickLimit.get(category_id, month);
    const limit_cents = lim ? lim.limit_cents : 0;
    const spent_before_cents = sumSpend.get(category_id, month).s;
    const spent_after_cents = spent_before_cents + installment_cents;
    return {
      month,
      installment_cents,
      limit_cents,
      spent_before_cents,
      spent_after_cents,
      remaining_before_cents: limit_cents - spent_before_cents,
      remaining_after_cents: limit_cents - spent_after_cents,
      status: spent_after_cents > limit_cents ? 'over' : 'ok',
    };
  });

  return { category_id: cat.id, name: cat.name, months };
}

module.exports = { simulatePurchase };

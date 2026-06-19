const { addMonths } = require('./dates');

function computeCarryIn(db, categoryId, month, pickLimit, sumSpend) {
  const first = db.prepare(
    `SELECT MIN(strftime('%Y-%m', date)) AS m FROM transactions WHERE category_id=?`).get(categoryId);
  if (!first || !first.m || first.m >= month) return 0;
  let carry = 0;
  for (let m = first.m; m < month; m = addMonths(m, 1)) {
    const limitRow = pickLimit.get(categoryId, m);
    const limit = limitRow ? limitRow.limit_cents : 0;
    const actual = sumSpend.get(categoryId, m).s;
    carry = limit > 0 ? Math.max(0, actual + carry - limit) : 0;
  }
  return carry;
}

function buildDashboard(db, month) {
  const cats = db.prepare(
    `SELECT c.id, c.name, c.group_id, c.examples, g.name AS group_name, g.color AS group_color, g.sort_order AS group_sort
     FROM categories c JOIN groups g ON g.id = c.group_id
     WHERE c.active = 1 ORDER BY g.sort_order, c.sort_order, c.id`).all();

  const pickLimit = db.prepare(
    `SELECT limit_cents FROM category_limits WHERE category_id=? AND month<=? ORDER BY month DESC LIMIT 1`);
  const sumSpend = db.prepare(
    `SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions WHERE category_id=? AND strftime('%Y-%m', date)=?`);

  const categories = cats.map(c => {
    const limit = pickLimit.get(c.id, month);
    const limit_cents = limit ? limit.limit_cents : 0;
    const spent_cents = sumSpend.get(c.id, month).s;
    const carry_in_cents = computeCarryIn(db, c.id, month, pickLimit, sumSpend);
    const effective_spent_cents = spent_cents + carry_in_cents;
    return {
      category_id: c.id, name: c.name, examples: c.examples,
      group_id: c.group_id, group_name: c.group_name, group_color: c.group_color,
      limit_cents, spent_cents, carry_in_cents, effective_spent_cents,
      remaining_cents: limit_cents - effective_spent_cents,
      status: effective_spent_cents > limit_cents ? 'over' : 'ok',
    };
  });

  const groupsMap = new Map();
  for (const c of categories) {
    if (!groupsMap.has(c.group_id)) {
      groupsMap.set(c.group_id, {
        group_id: c.group_id, name: c.group_name, color: c.group_color,
        limit_cents: 0, spent_cents: 0, effective_spent_cents: 0,
      });
    }
    const g = groupsMap.get(c.group_id);
    g.limit_cents += c.limit_cents;
    g.spent_cents += c.spent_cents;
    g.effective_spent_cents += c.effective_spent_cents;
  }
  const groups = [...groupsMap.values()];

  const num = k => {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(k);
    return row ? Number(row.value) : 0;
  };
  const income = num('monthly_income');
  const fixed = num('fixed_costs');
  const goal = num('savings_goal');
  const spent_cents = categories.reduce((s, c) => s + c.spent_cents, 0);
  const limit_total = categories.reduce((s, c) => s + c.limit_cents, 0);
  const teto_cents = income - fixed - goal;
  const projected_savings_cents = income - fixed - spent_cents;

  return {
    month, categories, groups,
    totals: {
      limit_cents: limit_total, spent_cents,
      monthly_income_cents: income, fixed_costs_cents: fixed,
      savings_goal_cents: goal, teto_cents,
      projected_savings_cents,
      vs_goal_cents: projected_savings_cents - goal,
    },
  };
}

module.exports = { buildDashboard };

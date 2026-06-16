const { addMonths } = require('./dates');
const { fail } = require('../validate');

// Split total into `count` parts; first (total % count) parts get +1 cent.
function splitCents(total, count) {
  const base = Math.floor(total / count);
  const rem = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}

// Creates the group + N month-spaced child transactions atomically. Returns group id.
function createInstallmentPurchase(db, p) {
  const { category_id, card_id, description = '', total_cents, count, first_month } = p;
  const tx = db.transaction(() => {
    const g = db.prepare(
      `INSERT INTO installment_groups (description, total_cents, total_count, first_month, category_id, card_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(description, total_cents, count, first_month, category_id, card_id);
    const groupId = g.lastInsertRowid;
    const amounts = splitCents(total_cents, count);
    const insert = db.prepare(
      `INSERT INTO transactions (date, category_id, card_id, amount_cents, description,
        installment_group_id, installment_no, installment_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    amounts.forEach((amt, i) => {
      const month = addMonths(first_month, i);
      insert.run(`${month}-01`, category_id, card_id, amt, description, groupId, i + 1, count);
    });
    return groupId;
  });
  return tx();
}

function deleteInstallmentGroup(db, id) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM transactions WHERE installment_group_id=?').run(id);
    const r = db.prepare('DELETE FROM installment_groups WHERE id=?').run(id);
    if (r.changes === 0) fail(404, 'installment group not found');
  });
  tx();
}

module.exports = { splitCents, createInstallmentPurchase, deleteInstallmentGroup };

const { test } = require('node:test');
const assert = require('node:assert');

test('the review stat tile escapes the category name it is given', async () => {
  const { tile } = await import('../public/js/decidir.js');
  const html = tile('MAIOR MUDANÇA', '+ R$ 268,00', '<img src=x onerror=alert(1)>');
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/);
});

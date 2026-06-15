const { test } = require('node:test');
const assert = require('node:assert');
const { errorHandler } = require('../src/errorHandler');

function fakeRes() {
  return { code: null, body: null,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; } };
}

test('uses err.status and err.message when present', () => {
  const res = fakeRes();
  errorHandler({ status: 400, message: 'bad input' }, {}, res, () => {});
  assert.equal(res.code, 400);
  assert.deepEqual(res.body, { error: 'bad input' });
});

test('defaults to 500 and a generic message', () => {
  const res = fakeRes();
  const orig = console.error; console.error = () => {}; // silence expected log
  errorHandler({}, {}, res, () => {});
  console.error = orig;
  assert.equal(res.code, 500);
  assert.deepEqual(res.body, { error: 'Internal error' });
});

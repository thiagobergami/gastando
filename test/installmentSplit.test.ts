import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allocateInstallmentSplit,
  previewInstallmentSplit,
} from '../src/domain/services/installmentSplit';

test('split uses cumulative cents, with exact totals and zero shares', () => {
  assert.deepEqual(
    allocateInstallmentSplit([20000, 20000, 20000, 20000, 20000, 20000], 50),
    [10000, 10000, 10000, 10000, 10000, 10000],
  );
  assert.deepEqual(allocateInstallmentSplit([34, 33, 33], 50), [17, 17, 16]);
  assert.deepEqual(allocateInstallmentSplit([1, 1, 1], 1), [0, 0, 0]);
  assert.equal(previewInstallmentSplit(100, 3, 50).total_receivable_cents, 50);
  assert.throws(() => previewInstallmentSplit(2, 3, 50));
  assert.throws(() => allocateInstallmentSplit([100], 100));
  assert.throws(() => allocateInstallmentSplit([Number.MAX_SAFE_INTEGER, 1], 50));
  assert.equal(allocateInstallmentSplit([Number.MAX_SAFE_INTEGER], 50)[0], 4503599627370496);
});

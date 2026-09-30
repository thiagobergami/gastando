import { AppError } from '../errors';
import { splitCents } from './installments';

export interface InstallmentSplitPreview {
  installment_amounts_cents: number[];
  receivable_amounts_cents: number[];
  total_receivable_cents: number;
}

function positiveInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AppError(400, 'Valores devem ser inteiros positivos em centavos.');
  }
}

export function allocateInstallmentSplit(amounts: readonly number[], percent: number): number[] {
  positiveInteger(percent);
  if (percent > 99) throw new AppError(400, 'Porcentagem inválida (1 a 99).');
  let accumulated = 0n;
  let previous = 0n;
  return amounts.map((amount) => {
    positiveInteger(amount);
    accumulated += BigInt(amount);
    if (accumulated > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new AppError(400, 'Valor total excede o limite de centavos.');
    }
    const rounded = (accumulated * BigInt(percent) + 50n) / 100n;
    const share = Number(rounded - previous);
    previous = rounded;
    return share;
  });
}

export function previewInstallmentSplit(
  totalCents: number,
  count: number,
  percent: number,
): InstallmentSplitPreview {
  validateInstallmentAmounts(totalCents, count);
  const amounts = splitCents(totalCents, count);
  const receivables = allocateInstallmentSplit(amounts, percent);
  return {
    installment_amounts_cents: amounts,
    receivable_amounts_cents: receivables,
    total_receivable_cents: receivables.reduce((sum, amount) => sum + amount, 0),
  };
}

export function validateInstallmentAmounts(totalCents: number, count: number): void {
  positiveInteger(totalCents);
  positiveInteger(count);
  if (count > totalCents) throw new AppError(400, 'Cada parcela deve ter pelo menos um centavo.');
}

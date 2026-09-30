import { z } from 'zod';
import { zPositiveInt } from './common';
export const zSplitPersonId = z
  .union([zPositiveInt('split_person_id must be a positive integer'), z.null()])
  .optional();

export const zSplitPercent = z
  .union([
    z.custom<number>((v) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 99, {
      message: 'split_percent must be an integer 1..99',
    }),
    z.null(),
  ])
  .optional();

// split_person_id e split_percent chegam juntos ou nenhum dos dois — enviar só
// um dos dois deixaria a transação com metade de um split, que não é um
// estado válido (design 2026-08-14, "Data model").
export function bothSplitFieldsOrNeither(v: {
  split_person_id?: number | null;
  split_percent?: number | null;
}) {
  const hasPerson = v.split_person_id !== undefined && v.split_person_id !== null;
  const hasPercent = v.split_percent !== undefined && v.split_percent !== null;
  const suppliedTogether = (v.split_person_id !== undefined) === (v.split_percent !== undefined);
  return suppliedTogether && hasPerson === hasPercent;
}

export const SPLIT_TOGETHER_MESSAGE = 'split_person_id and split_percent must be provided together';

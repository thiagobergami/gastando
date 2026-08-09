import { z } from 'zod';

// `essential` é opcional (default 0) mas, se vier, tem de ser 0 ou 1 — evitar
// que um `true`/`2` acidental vire um valor gravado sem sentido.
const essentialFlag = z.custom<number | undefined>((v) => v === undefined || v === 0 || v === 1, {
  message: 'essential must be 0 or 1',
});

export const categoryBodySchema = z.object({
  name: z.custom<string>((v) => !!v, { message: 'name is required' }),
  essential: essentialFlag,
});

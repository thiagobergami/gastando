export interface OfxTransaction {
  date: string; // "YYYY-MM-DD", de DTPOSTED
  amountCents: number; // inteiro, negativo para DEBIT, positivo para CREDIT
  description: string; // de MEMO, trimmed
  fitId: string; // de FITID
  type: 'CREDIT' | 'DEBIT';
}

function extractField(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>([^\r\n<]+)`));
  return match ? match[1].trim() : null;
}

function parseDate(dtposted: string): string {
  const y = dtposted.slice(0, 4);
  const m = dtposted.slice(4, 6);
  const d = dtposted.slice(6, 8);
  return `${y}-${m}-${d}`;
}

function parseAmountCents(trnamt: string): number {
  return Math.round(parseFloat(trnamt) * 100);
}

export function parseOfx(content: string): OfxTransaction[] {
  const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/g) ?? [];

  return blocks.map((block) => {
    const type = extractField(block, 'TRNTYPE') as 'CREDIT' | 'DEBIT';
    const dtposted = extractField(block, 'DTPOSTED') ?? '';
    const trnamt = extractField(block, 'TRNAMT') ?? '0';
    const fitId = extractField(block, 'FITID') ?? '';
    const memo = extractField(block, 'MEMO') ?? '';

    return {
      date: parseDate(dtposted),
      amountCents: parseAmountCents(trnamt),
      description: memo,
      fitId,
      type,
    };
  });
}

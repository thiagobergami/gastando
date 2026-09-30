import { readFileSync } from 'node:fs';
import { parseOfx } from '../src/domain/services/ofx';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Uso: tsx scripts/read-ofx.ts <caminho-do-arquivo.ofx>');
  process.exit(1);
}

const content = readFileSync(filePath, 'latin1');
const transactions = parseOfx(content);

console.log(JSON.stringify(transactions, null, 2));
console.error(`\n${transactions.length} transações lidas.`);

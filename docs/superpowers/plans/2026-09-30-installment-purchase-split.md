# Divisão de compra parcelada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Dividir uma compra parcelada com uma pessoa, com valores exatos e recebimento independente por parcela.

**Architecture:** A configuração pertence a `installment_groups`; `transactions.split_received` pertence à parcela. Os repositórios resolvem o split efetivo sem duplicar sua configuração nas parcelas. Um serviço puro calcula os valores; um endpoint de prévia reutiliza esse serviço para o navegador, sem introduzir bundler ou duplicar o algoritmo em JavaScript.

**Tech Stack:** TypeScript, Express, Zod, better-sqlite3, JavaScript/DOM, node:test e supertest; sem dependências novas.

**Spec:** `docs/superpowers/specs/2026-09-30-installment-purchase-split-design.md` (aprovada).

## Global Constraints

- Uma pessoa, porcentagem inteira de 1 a 99, recebimento integral por parcela; recorrência permanece incompatível.
- Valor integral conta no cartão/orçamento/projeções; marcar recebido não cria renda.
- Pessoa e porcentagem são nulas juntas ou preenchidas juntas; parcelas de grupo compartilhado mantêm ambas as colunas físicas nulas.
- Arredondamento pela diferença de acumulados, meio centavo para cima, ordem `installment_no`; soma exata mesmo depois de marcar recebido, filtrar ou quitar.
- `count <= total_cents`; parcela com zero a receber não é pendência.
- Edição descritiva preserva ids/datas/valores/recebimentos; financeira após qualquer recebimento retorna 409 atomicamente.
- Omissão do par na edição preserva configuração; dois nulos removem quando permitido; par incompleto retorna 400.
- Splits individuais legados são preservados, impedem configuração de grupo e reexpansão financeira até serem removidos.
- Exclusão/edição individual de grupo compartilhado retorna 409; quitação move apenas datas e preserva recebimentos.
- Classificação entre mês corrente/anterior e futuro usa mês real, independente do seletor do dashboard.
- A área Recebidos permite desfazer após reload, inclusive quando não há pendências.
- Preservar alterações locais preexistentes. `src/domain/ports/index.ts` e `test/dashboard.test.ts` já têm mudanças; commits da implementação devem incluir apenas os hunks desta feature nesses arquivos. Não adicionar bancos, backups ou extratos.

## Review Focus

1. Edição com par omitido, um campo nulo ou somente um campo: preservar no primeiro caso e rejeitar pares incompletos (Tarefa 3).
2. Pessoa desativada após a compra: continuar exibindo e editando a pessoa atual, sem criá-la novamente (Tarefas 2 e 4).
3. Parcelas com mesma data após quitação ou com zero a receber: manter ordem de cálculo e total, sem pendências de R$ 0 (Tarefas 1 e 3).
4. Respostas de prévia fora de ordem ou erro de rede: não mostrar prévia antiga como se fosse do formulário atual (Tarefa 4).
5. Só recebidos, mudança de ano e página aberta na virada de mês: reversão acessível e referência local atual ao recarregar os dados (Tarefa 5).

## Estrutura de arquivos

| Arquivos | Responsabilidade |
|---|---|
| `migrations/012_installment_group_split.sql` | Configuração opcional no grupo, FK e integridade do par |
| `src/domain/services/installmentSplit.ts` | Cálculo puro e prévia |
| `src/domain/entities/index.ts`, `src/domain/ports/index.ts` | Tipos de grupo, recebível, entrada de compra e repositórios |
| `src/infra/repositories/installments.ts` | Escrita atômica, proteção de edição e progresso |
| `src/infra/repositories/transactions.ts` | Leituras efetivas, recebíveis, proteção de parcelas |
| `src/application/use-cases/{transactions,installments}.ts`, `src/infra/composition.ts` | Validações, recebimento e prévia |
| `src/adapters/http/schemas/{transactions,installments,split}.ts`, `controllers/{transactions,installmentGroups}.ts` | Validação comum de split e contratos HTTP |
| `public/js/installmentEntry.js` | Estado compatível do formulário e cliente de prévia |
| `public/{registrar,parcelas}.html`, `public/js/{registrar,parcelas}.js` | Registro, prévia e edição da compra |
| `public/js/{receivables,dashboard}.js` | Classificação, subtotais e reversão de recebimento |
| `test/{installmentSplit,installmentPurchaseSplit,installmentEntry}.test.ts` | Novos testes de domínio, integração e formulário |
| `test/{migrations,installments,transactions,registrarRender,parcelasRender,receivables}.test.ts` | Migração, compatibilidade e renderização |

Confirmar o próximo número de migração antes de implementar; atualmente 012 está livre.

### Tarefa 1: Modelo e cálculo exato

**Files:** criar migração e `src/domain/services/installmentSplit.ts`; modificar entidades/ports; testar em `test/installmentSplit.test.ts` e `test/migrations.test.ts`.

**Interfaces:** produzir `SplitConfig { split_person_id: number | null; split_percent: number | null }`, `InstallmentPurchaseInput { category_id: number; card_id: number; description?: string; total_cents: number; count: number; first_month: string; split_person_id?: number | null; split_percent?: number | null }` e `Receivable` com os campos atuais mais os três campos de parcelamento nulos ou numéricos. `InstallmentGroup`/`InstallmentProgress` ganham configuração; progresso ganha `split_person_name: string | null` e `has_individual_splits: boolean`. Novos campos de leitura são obrigatórios; novos campos de entrada são opcionais para chamadas existentes.

- [x] Escrever testes dos serviços e da migração. Fixar estas assertivas:
  ```ts
  assert.deepEqual(allocateInstallmentSplit([20000, 20000, 20000, 20000, 20000, 20000], 50), [10000, 10000, 10000, 10000, 10000, 10000]);
  assert.deepEqual(allocateInstallmentSplit([34, 33, 33], 50), [17, 17, 16]);
  assert.deepEqual(allocateInstallmentSplit([1, 1, 1], 1), [0, 0, 0]);
  assert.equal(previewInstallmentSplit(100, 3, 50).total_receivable_cents, 50);
  assert.throws(() => previewInstallmentSplit(2, 3, 50));
  assert.throws(() => allocateInstallmentSplit([100], 100));
  ```
  Migração: banco migrado até 011 com compra existente recebe colunas nulas; FK desconhecida e par incompleto falham; `split_percent` não inteiro ou fora da faixa falha; recebimentos individuais preexistentes ficam intactos.
- [x] Rodar `node --import tsx --test test/installmentSplit.test.ts test/migrations.test.ts`; esperar falhas pelas interfaces/colunas ausentes.
- [x] Implementar `allocateInstallmentSplit(amounts: readonly number[], percent: number): number[]` e `previewInstallmentSplit(totalCents: number, count: number, percent: number): InstallmentSplitPreview`. Prévia: `installment_amounts_cents: number[]`, `receivable_amounts_cents: number[]`, `total_receivable_cents: number`. Validar inteiros seguros, valores positivos, faixa e quantidade antes do cálculo; usar acumulados e aritmética inteira (BigInt internamente evita overflow de `total * percent`). Criar a migração com CHECK do par/tipo/faixa e FK. Manter `splitCents` e callers existentes.
- [x] Rodar os mesmos testes e `npm run typecheck`; ambos devem passar. Atualizar as assinaturas de compra/edição do port para `InstallmentPurchaseInput` e a assinatura de recebíveis para `Receivable[]`, adaptando resultados existentes com nulos até a próxima tarefa.
- [x] Criar commit contendo somente migração, serviço, tipos e testes desta tarefa: `feat: model shared installment purchases and exact split amounts`.

### Tarefa 2: Persistência e leituras consistentes

**Files:** modificar os dois repositórios e `test/{installments,transactions}.test.ts`; criar `test/installmentPurchaseSplit.test.ts`.

**Interfaces:** consumir tipos e cálculo da Tarefa 1. Preservar nomes de `createPurchase(p): number`, `update(id, p): void`, `listWithProgress(month): InstallmentProgress[]` e métodos de transação. Produzir leituras `Transaction` com split efetivo e `Receivable[]`; cálculos dos grupos usam todas as parcelas físicas.

- [x] Escrever testes de repositório com `makeTestDb()`. Para compra de 120000/6/50%, assegurar seis transações físicas com par nulo, grupo com pessoa/50%, `findById`, `list` e `firstByGroup` com par efetivo e seis recebíveis de 10000. Para 100/3/50%, marcar a segunda recebida e assegurar `[17, 17, 16]` na consulta completa e pendentes totalizando 33. Pessoa desativada continua resolvida. Split legado no grupo sem configuração conserva arredondamento individual.
- [x] Rodar `node --import tsx --test test/installmentPurchaseSplit.test.ts test/installments.test.ts test/transactions.test.ts`; esperar falha nas novas leituras.
- [x] Implementar resolução por LEFT JOIN explícito, preservando filtros, paginação, contagem e campos existentes. Para recebíveis de grupo, buscar todas as parcelas ordenadas por número, calcular uma vez por grupo e anexar estados; unir aos splits individuais avulsos/legados. Omitir valores zero. `listWithProgress` resolve pessoa mesmo inativa e detecta splits individuais sem duplicar linhas.
- [x] Implementar as escritas atômicas: comparar campos financeiros com valores persistidos; descrição/categoria/cartão atualizam filhos em lugar; somente alterações financeiras reexpandem. Na mesma transação, rejeitar reexpansão quando há recebido ou split individual, e rejeitar adicionar divisão se há legado. Dois nulos removem quando permitido; omissão preserva. Não mudar `payOffEarly` além de assegurar preservação dos estados.
- [x] Adicionar casos de assertivas antes de finalizar:
  ```ts
  assert.deepEqual(idsAfterDescriptiveEdit, idsBefore);
  assert.deepEqual(receivedAfterDescriptiveEdit, receivedBefore);
  assert.throws(() => repo.update(id, changedTotal), (e) => e.status === 409);
  assert.deepEqual(rowsAfterRejectedEdit, rowsBeforeRejectedEdit);
  assert.equal(groupAfterOmittedSplit.split_percent, 50);
  assert.equal(groupAfterExplicitClear.split_percent, null);
  ```
  Testar ainda grupo inexistente 404, rejeição com legado, quitação sem alterar valores/ids/estados e edição descritiva preservando datas já antecipadas.
- [x] Rodar novamente os testes da tarefa e typecheck, esperando aprovação; commit `feat: persist installment splits without losing receivables`.

### Tarefa 3: API, prévia e proteção de parcelas

**Files:** modificar casos de uso, composição, schemas/controladores listados no mapa; criar `src/adapters/http/schemas/split.ts`; estender `test/installmentPurchaseSplit.test.ts` e `test/transactions.test.ts`.

**Interfaces:** `makeInstallmentUseCases` passa a consumir também `people: PersonRepository` (ajustar composição e fixtures). Produzir `preview(input: { total_cents: number; count: number; split_percent: number }): InstallmentSplitPreview`; expor `POST /api/installment-groups/preview` antes das rotas de id. Schemas usam `zSplitPersonId`, `zSplitPercent`, `bothSplitFieldsOrNeither` comuns. PUT de grupo mantém o corpo completo atual e o par opcional; resposta continua 204. Prévia retorna 200, não grava dados e não depende de pessoa/categoria/cartão.

- [x] Escrever testes supertest: criação compartilhada retorna 201 e primeira parcela com split efetivo; marcar/desmarcar segunda parcela retorna 204 e pendência passa 60000 → 50000 → 60000. Substituir o teste atual que espera 400 ao combinar parcelamento/split. Fixar também:
  ```ts
  assert.equal(preview.body.total_receivable_cents, 50); // POST total=100, count=3, percent=50
  assert.deepEqual(preview.body.receivable_amounts_cents, [17, 17, 16]);
  assert.equal(afterPreviewTransactionCount, beforePreviewTransactionCount);
  assert.equal(groupAfterPutWithoutSplit.split_percent, 50);
  assert.equal(financialEditAfterReceived.status, 409);
  assert.equal(directSharedParcelEdit.status, 409);
  assert.equal(directSharedParcelDelete.status, 409);
  ```
  Adicionar par incompleto/nulo misto 400; porcentagens 0/100/decimal 400; pessoa inexistente 400; grupo inexistente 404; contagem maior que centavos 400; divisão com legado 409. Testar remoção de split individual legado recebido: 409 até desmarcar. Testar compra sem split e split avulso continuam editáveis conforme comportamento anterior.
- [x] Rodar `node --import tsx --test test/installmentPurchaseSplit.test.ts test/transactions.test.ts test/installments.test.ts`; esperar falhas dos novos contratos.
- [x] Implementar validações e orchestration; remover rejeição da combinação em criação. Validar existência de pessoa também no ramo parcelado. Prévia usa serviço puro, incluindo erros 400 para inputs inválidos. Proteger edição/exclusão de parcela compartilhada no caso de uso e na operação de repositório; não detectar apenas `tx.split_person_id`, pois legados também têm esse campo. Resolver configuração pelo grupo. Adaptar `setSplitReceived` para split efetivo e preservar `split_received` em edição descritiva de legado; não resetar/limpar recebido legado sem desmarcar antes.
- [x] Acrescentar regressões HTTP: quitação com datas iguais mantém valores a receber e estados; zero a receber não aparece; excluir grupo remove filhos/recebíveis. Comparar respostas financeiras de dashboard/BI antes e depois da configuração, recebimento e reversão, no mesmo calendário: devem ser idênticas. Comparar orçamento com duas compras equivalentes, uma compartilhada e outra sem split.
- [x] Rodar testes da tarefa, `test/dashboard.test.ts`, `test/bi.test.ts`, `npm run typecheck`; esperar aprovação. Commit `feat: expose shared installment purchase API and preview`.

### Tarefa 4: Registro e edição da compra

**Files:** criar `public/js/installmentEntry.js` e `test/installmentEntry.test.ts`; modificar `public/{registrar,parcelas}.html`, `public/js/{registrar,parcelas}.js`, `test/{registrarRender,parcelasRender}.test.ts`.

**Interfaces:** produzir helpers sem DOM `toggleEntryOption(state: EntryOptions, option: 'installment' | 'recurring' | 'split'): EntryOptions` com `EntryOptions { installment: boolean; recurring: boolean; split: boolean }`; `createSplitPreviewLoader(request: (input) => Promise<InstallmentSplitPreview>, publish: (preview: InstallmentSplitPreview | null) => void): { load(input): Promise<void>; clear(): void }`. `registrar.js` mantém estado explícito e monta o payload a partir dele, não da visibilidade CSS. Helpers podem usar JSDoc sem alterar configuração TypeScript do projeto.

- [x] Escrever testes dos helpers e renderizadores:
  ```ts
  assert.deepEqual(toggleEntryOption({ installment: true, recurring: false, split: false }, 'split'), { installment: true, recurring: false, split: true });
  assert.deepEqual(toggleEntryOption({ installment: true, recurring: false, split: true }, 'recurring'), { installment: false, recurring: true, split: false });
  assert.match(sharedRowHtml, /2\/6/);
  assert.match(sharedRowHtml, /50% Ana/);
  assert.match(sharedRowHtml, /parcelas\.html\?group=7/);
  assert.match(sharedGroupHtml, /50% Ana/);
  ```
  Promises controladas: resolver requisição B antes de A publica apenas B; limpar durante uma requisição impede publicação; erro da requisição corrente limpa prévia sem bloquear formulário. Testar nomes/descrições escapados e acesso à edição do grupo sem botão de edição individual compartilhada.
- [x] Rodar `node --import tsx --test test/installmentEntry.test.ts test/registrarRender.test.ts test/parcelasRender.test.ts`; esperar falha nos helpers e novos links.
- [x] Implementar estado e helpers, mantendo toggle de split avulso, reset e edição avulsa. Debounce de 200 ms no formulário, limpar prévia ao mudar entrada, ignorar respostas antigas e reutilizar POST de prévia; cálculo financeiro permanece no backend. Mostrar parcelas iguais ou faixa com total se diferirem. Não enviar split no ramo recorrente; campos desligados ficam limpos. Label do percentual indica a parte da pessoa.
- [x] Atualizar `parcelas.html`/`parcelas.js` com pessoa, percentual e opção de remover divisão; pré-popular categoria/cartão além dos campos existentes. Carregar pessoas antes de abrir edição, oferecer ativas e a atual inativa. Resolver `?group=ID` depois de carregar grupos/seletores; id desconhecido mostra erro. Cadastro de pessoa reutiliza fluxo existente. Ao salvar, enviar par explícito ou ambos nulos; conflito 409 preserva formulário. Explicar que adicionar divisão afeta todas as parcelas e que exclusão remove valores a receber. Quitação continua independente.
- [x] Rodar testes da tarefa; verificar manualmente criação com as duas opções, reset, recorrência, prévia desigual, pessoa inativa, deep link e erro 409. Confirmar que clicar Excluir na linha compartilhada usa exclusão da compra inteira com confirmação, nunca DELETE da transação isolada. Commit `feat: register and edit shared installment purchases`.

### Tarefa 5: Valores a receber e reversão

**Files:** modificar `public/js/{receivables,dashboard}.js` e `test/receivables.test.ts`.

**Interfaces:** manter `pendingReceivables(rows)` e `totalPendingCents(rows)`; produzir `classifyReceivables(rows, currentMonth): { due: Receivable[]; future: Receivable[]; received: Receivable[] }`. `renderReceivables(rows, currentMonth)` aceita mês explícito para testes. Dashboard passa mês local real recalculado em cada carregamento, via helper `localCurrentMonth(date: Date): string` exportado em `receivables.js`; não usar mês do seletor nem UTC.

- [x] Escrever testes com mês `2026-09`: parcela pendente de agosto e setembro em `due`; outubro em `future`; recebido em seção própria; ordenar por mês/número. Fixar:
  ```ts
  assert.equal(totalPendingCents([{ amount_cents: 10000, received: 0 }, { amount_cents: 10000, received: 1 }]), 10000);
  assert.match(receivedOnlyHtml, /Recebidos/);
  assert.match(receivedOnlyHtml, /data-unreceive="2"/);
  assert.match(pendingHtml, /A receber até este mês/);
  assert.match(pendingHtml, /Previsto para os próximos meses/);
  assert.match(pendingHtml, /2\/6/);
  assert.equal(renderReceivables([], '2026-09'), '');
  assert.equal(localCurrentMonth(new Date(2026, 8, 30, 23, 59)), '2026-09');
  assert.equal(localCurrentMonth(new Date(2026, 9, 1, 0, 0)), '2026-10');
  ```
  Adicionar dezembro/janeiro e testes de escape. Atualizar testes antigos que exigiam esconder recebidos: eles agora ficam somente na seção recolhível, fora dos totais pendentes.
- [x] Rodar `node --import tsx --test test/receivables.test.ts`; esperar falha no novo comportamento.
- [x] Implementar classificação e render com `<details>` para recebidos; manter recebidos fora das pendências/totais. Associar os botões `data-unreceive` ao DELETE de recebimento e os existentes ao POST, recarregando dados após sucesso; erro mantém estado legível. Não bloquear recebimento antecipado. Preservar carregamento independente do dashboard e evitar relatório de atraso sem data de vencimento.
- [x] Rodar testes da tarefa e verificar manualmente recebimento futuro, reversão após reload e painel com somente recebidos. Commit `feat: show installment receivables and allow undoing receipt`.

### Tarefa 6: Verificação integrada e entrega

**Files:** testes de integração da Tarefa 3, documentos da feature e CSS gerado somente se novas classes exigirem rebuild.

**Interfaces:** consumir todos os contratos anteriores; entregar a feature validada e um relato com evidências e limitações reais.

- [x] Completar teste ponta a ponta HTTP de criação 120000/6/50%, listagem, recebido, edição descritiva preservando id, rejeição financeira, reversão, edição financeira permitida e exclusão. Todas as etapas verificam os totais previstos pela spec e ausência de alterações parciais nos erros.
- [x] Executar `npm test`, `npm run typecheck` e `npm run lint`; esperar saída zero. Comparar falhas com baseline da execução, distinguindo problemas preexistentes sem descartá-los como irrelevantes. Não afirmar aprovação sem saída observada.
- [x] Se o HTML adicionar classes ainda ausentes no CSS, executar `npm run build:css` e revisar o diff do artefato. Testar navegador quando disponível com DB temporário, sem usar backup/extrato/banco pessoal; registrar limitação caso não haja navegador disponível.
- [x] Revisar o diff da feature contra os dez critérios de aceite da spec; corrigir lacunas antes de entrega. Verificar ausência de alterações nos cálculos de gasto/orçamento/poupança e de configuração duplicada nos filhos. Não incluir alterações locais alheias em commits.
- [x] Atualizar status/checklists deste plano com resultados reais. Commit das mudanças finais da feature: `test: verify shared installment purchase lifecycle`. Entregar arquivos alterados, validação e limitações, seguindo o fluxo de integração escolhido pelo usuário.

## Autorrevisão do plano

- Cobertura: objetivo/modelo/cálculo na Tarefa 1; compatibilidade/persistência na 2; API/políticas/quitacão/exclusão/regressões na 3; registro/gestão na 4; recebíveis/reversão na 5; validação integrada na 6.
- Os cinco riscos de Review Focus possuem testes nas tarefas indicadas. Campos e tipos efetivos coincidem entre repositórios, API e interface.
- Decisão adicional de implementação: endpoint de prévia mantém o serviço puro compartilhado com consultas sem importar módulos CommonJS TypeScript no navegador. Nenhum pacote ou subsistema de pagamento é necessário.
- Execução escolhida pelo usuário: nesta sessão. Implementação concluída e revisão independente final realizada.


## Resultado da execução

Implementado na branch `feat/installment-purchase-split`.

- Suíte completa: **324 testes aprovados, zero falhas**, com Node 23 e SQLite compatível.
- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado com um aviso preexistente de parâmetro não utilizado em `public/js/review.js`.
- `npm run build:css`: aprovado; CSS gerado sem diff.
- Chromium com banco temporário: criação com parcelamento e divisão simultâneos, prévia, recebimento, reversão após reload, quitação e edição descritiva com pessoa inativa/recebimento marcado aprovados; ids, datas, recebimentos e quantidade de pessoas preservados.
- Revisão independente encontrou duplicação da pessoa inativa no formulário. Reproduzida em teste e navegador, corrigida e validada novamente. Nenhum item de revisão pendente.

### Decisões durante a execução

1. Branch no diretório atual para preservar dependências e mudanças locais. Custo se incorreto: separar hunks do trabalho anterior; separação revisada no commit, inclusive no port compartilhado.
2. Node 23 instalado para validar SQLite ABI 131. Custo: usar Node 22/24 exige recompilar a dependência nativa; nenhuma configuração do projeto foi alterada.
3. Progresso em ledger manual porque o parser de briefs espera headings em inglês. Custo: rastreamento manual das tarefas.
4. Campo efetivo opcional `shared_installment` distingue divisão da compra de split individual legado. Custo se incorreto: direcionamento errado da edição; testes de render e navegador cobrem o fluxo.
5. Consulta preparada por parcela resolve a configuração efetiva preservando filtros e paginação. Custo: consulta local adicional por parcela listada.
6. Commit consolidado para reduzir aprovações de escrita em `.git`. Custo: granularidade maior; testes e plano mantêm o histórico das etapas.
7. Alterações preexistentes de limites/settings/budget fora da revisão e do commit da feature. Custo: suíte do workspace também valida interações com mudanças locais ainda não commitadas.
8. Navegador e suíte executados pelo autor, revisão independente de código. Custo: revisor não repetiu as execuções; resultados observados e registrados acima.

Integração em `main` ou publicação em PR aguarda escolha do usuário.

# Gastando v0.3 — Fatia 3: Decidir — Design

- Data: 2026-08-08
- Autor: Thiago Bergami Guedes
- Deriva de: [`docs/spec-v0.3.md`](../../spec-v0.3.md) §8, §9, §11 e §13
- Antecede: o plano task-by-task, documento separado
- Escopo: **desenho da Fatia 3.** É a fatia que fecha o loop.

Este documento faz três coisas: registra o que a auditoria do código encontrou
que **invalida premissas da spec** (§A), desenha a Fatia 3 (§B), e lista as
decisões que ainda dependem de você (§C).

Fatias 1 e 2 estão no código e verdes (193 testes). Este desenho foi escrito
contra o código como ele está hoje, não contra o que a spec supunha.

---

## A. O que a auditoria mudou

Quatro premissas da spec §8 não sobreviveram ao contato com o código.

### A.1 "Maior Impacto" **não** está implementado

A spec §8 lista, na pauta de perguntas:

| Pergunta | Fonte |
|---|---|
| O que mais mudou este mês? | "Maior Impacto" (**já implementado**) |

Não está. Existia na v0.2 — `public/js/bi.js:36` fazia
`Maior impacto: ${top.name}` — e a Fatia 1 removeu a linha junto com o gráfico
de gasto-por-grupo (commit `7146600`). O que sobrou é o helper puro
`topSeries` em `public/js/charts.js`, **com teste passando e nenhum chamador**:
código morto.

A Fatia 3 reconstrói a pergunta. O helper é reaproveitado, não reescrito — mas
sobre uma base diferente (§B.3): "o que mais mudou" é a maior **variação** entre
dois meses, não a maior série absoluta, que é o que `topSeries` sozinho responde.

### A.2 `savings-trend` é projeção, não poupança realizada

A spec §8 pede *"Quanto eu de fato guardei? — poupança realizada vs. meta, por
mês"*, e chama isso de "o buraco apontado em `docs/suggestions.md`". O endpoint
`GET /api/bi/savings-trend` existe, mas não responde essa pergunta:

```js
const income = num('monthly_income');   // o valor de HOJE
const projected = months.map((m) => income - fixed - reports.spendAllMonth(m));
```

Ele aplica a renda e os custos fixos **atuais** retroativamente a todos os meses
do intervalo. Mudar a renda reescreve o histórico inteiro em silêncio. É
projeção com os números de hoje, não o que aconteceu.

O buraco continua aberto, e fechá-lo exige modelo de dados novo (§B.1) — que a
spec §10 não previu.

### A.3 O padrão da Análise olha para o futuro

```js
document.getElementById('from').value = currentMonth();
document.getElementById('to').value = addMonths(currentMonth(), 6);
```

O intervalo padrão é **os próximos seis meses**. Das cinco perguntas do §8,
todas são retrospectivas ("mais ou menos que antes?", "o que mais mudou?",
"quanto eu de fato guardei?"). O padrão atual serve a um gráfico só — a previsão
de parcelas — e mostra meses que ainda não aconteceram para todos os outros.

A pauta nova (§B.3) inverte o padrão: **os últimos seis meses**.

### A.4 `settings` não tem dimensão de mês

`category_limits` tem `month` e uma regra de resolução (`limits.resolve`). O
modelo de poupança não:

```sql
CREATE TABLE settings ( key TEXT PRIMARY KEY, value TEXT NOT NULL );
```

Renda, custos fixos e meta são três chaves globais. Não há como saber qual era a
renda em março. Sem isso, "poupança realizada por mês" é impossível de calcular
honestamente — e o passo 3 do roteiro (§9), que diz *"nas revisões seguintes é
apenas confirmação"*, descreve exatamente um valor que muda de mês para mês.

**Esta é a única mudança de modelo de dados da Fatia 3.** §B.1.

---

## B. Fatia 3 — Decidir

**Entregável:** o loop fecha. Existe um ritual mensal com começo, meio e fim, e
a Análise vira o lugar onde ele começa.

### B.0 O que é novo e o que é composição

A fatia parece grande e é menor do que parece: três dos cinco passos do roteiro
já existem como telas prontas, e a Fatia 2 entregou o painel do passo 2.

| §9 | Passo | O que já existe | O que falta |
|---|---|---|---|
| 1 | O mês que passou | `analise.html` + 5 endpoints BI | a pauta (§B.3) e apontar para o mês fechado |
| 2 | O que já está comprometido | **`buildCommitments` / `renderCommitments`** (Fatia 2) | nada — reuso direto |
| 3 | Seu modelo | seção "Modelo de poupança" em `settings.html` | gravar **por mês** (§B.1) |
| 4 | Ajustar orçamentos | `/api/limits/suggestions` (`last_month_cents`, `avg3_cents`) + UI de limites | ordenar estouradas primeiro |
| 5 | Simular | `simulate.html` + `/api/simulate` | nada — reuso direto |
| — | Fim | — | resumo do que foi decidido |

O backend ganha **um modelo novo, dois endpoints de série e um de modelo mensal**.
Todo o resto é composição.

### B.1 Modelo de dados — `monthly_model`

Espelha o padrão que `category_limits` já usa: uma linha por mês, com regra de
resolução para os meses sem linha.

```sql
-- migrations/008_monthly_model.sql
-- v0.3 §9 passo 3 — o modelo de poupança passa a ter história.
-- `settings` continua sendo o modelo CORRENTE: é ele que alimenta o herói do
-- Acompanhar e o sinal `configured` do §6. Esta tabela é o histórico, escrito
-- na revisão mensal. Nada na Fatia 1 muda.
CREATE TABLE monthly_model (
  month              TEXT PRIMARY KEY,
  income_cents       INTEGER NOT NULL,
  fixed_costs_cents  INTEGER NOT NULL,
  savings_goal_cents INTEGER NOT NULL
);

-- Quem já configurou o modelo ganha o mês corrente semeado, para que a primeira
-- revisão tenha de onde partir em vez de começar em zero.
INSERT INTO monthly_model (month, income_cents, fixed_costs_cents, savings_goal_cents)
SELECT strftime('%Y-%m', 'now'),
       COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'monthly_income'), 0),
       COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'fixed_costs'), 0),
       COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'savings_goal'), 0)
 WHERE EXISTS (SELECT 1 FROM settings WHERE key = 'monthly_income');
```

**Regra de resolução**, igual em espírito a `limits.resolve`:

```
resolveModel(month):
  1. a linha de monthly_model com o maior `month` <= month, se houver
  2. senão, os valores atuais de `settings`
  3. senão, zeros
```

O passo 3 da revisão grava nos **dois** lugares: `monthly_model[mês que começa]`
e `settings`. Assim o histórico cresce e o herói do Acompanhar continua
mostrando o modelo vigente, sem nenhuma flag nova — a spec §10 continua valendo
("a ausência de `monthly_income` é o sinal que distingue o estado inicial do
completo").

### B.2 API

| Endpoint | O quê |
|---|---|
| `GET /api/bi/committed-vs-discretionary?from=&to=` | **novo** — série comprometido vs. discricionário |
| `GET /api/bi/savings-realized?from=&to=` | **novo** — poupança realizada vs. meta, por mês |
| `GET /api/monthly-model?month=` | **novo** — o modelo resolvido para um mês |
| `PUT /api/monthly-model` | **novo** — grava o modelo de um mês (passo 3) |
| `GET /api/bi/savings-trend` | mantido, sem mudança — projeção com os números de hoje |

> A spec §11 previa apenas mudanças em `/api/bi/*`. `monthly-model` é uma
> extensão — consequência direta de §A.4. Ver §C.5.

**Comprometido vs. discricionário.** A spec §8 define a fonte como derivada de
`essential` + `installment_group_id` + recorrência. Uma consulta nova no
`ReportRepository`:

```ts
// src/domain/ports — ReportRepository ganha:
committedSpendMonth(month: string): number;
```

```sql
SELECT COALESCE(SUM(t.amount_cents), 0) AS s
  FROM transactions t
  JOIN categories c ON c.id = t.category_id
 WHERE strftime('%Y-%m', t.date) = ?
   AND (c.essential = 1
        OR t.installment_group_id IS NOT NULL
        OR t.recurring_template_id IS NOT NULL)
```

Discricionário = `spendAllMonth(m) − committedSpendMonth(m)`. Um `OR` numa
consulta só, sem risco de contar duas vezes a transação que é essencial **e**
parcelada.

**Poupança realizada.**

```
realizada(m) = resolveModel(m).income − resolveModel(m).fixed − spendAllMonth(m)
meta(m)      = resolveModel(m).goal
```

A diferença para `savings-trend` é inteira `resolveModel(m)` no lugar de
`settings.get()`: cada mês usa o modelo que valia naquele mês.

### B.3 Análise — a pauta de perguntas

`analise.html` deixa de ser uma galeria. Cada card tem por título **a pergunta em
português**, e o gráfico é a resposta.

```
Análise
Como seus gastos se comportam ao longo do tempo.

[ De: fev/2026   Até: ago/2026 ]         ← padrão: os últimos 6 meses (§A.3)

┌─ Para onde meu dinheiro foi? ───────────────────────┐
│  barras por categoria, no mês final do intervalo    │
└─────────────────────────────────────────────────────┘
┌─ Estou gastando mais ou menos que antes? ───────────┐
│  linha do total por mês                             │
└─────────────────────────────────────────────────────┘
┌─ O que mais mudou este mês? ────────────────────────┐
│  "Restaurantes & Delivery subiu R$ 180,00           │
│   em relação a julho" + barras da variação          │
└─────────────────────────────────────────────────────┘
┌─ Quanto do meu gasto já é compromisso assumido? ────┐
│  duas linhas: comprometido e discricionário         │
└─────────────────────────────────────────────────────┘
┌─ Quanto eu de fato guardei? ────────────────────────┐
│  poupança realizada vs. meta, por mês               │
└─────────────────────────────────────────────────────┘
```

**"O que mais mudou" é variação, não total.** `topSeries` responde "qual série é
a maior", que não é a pergunta. A função nova recebe as séries de `trends` e
compara os dois últimos meses do intervalo, devolvendo a categoria de maior
variação absoluta e o delta com sinal — para que "caiu R$ 200" seja uma resposta
tão válida quanto "subiu R$ 200".

**Nomes de série saem do backend em inglês** — `'Limit'`, `'Spent'`,
`'Projected savings'`, `'Goal'`, `'Committed installments'` — e aparecem na
legenda dos gráficos. As séries novas nascem em pt-BR (`'Comprometido'`,
`'Discricionário'`, `'Poupança realizada'`, `'Meta'`) e as antigas são
traduzidas junto, fechando a constraint de pt-BR do §5.

**O que acontece com os três gráficos que não são perguntas do §8:**

| Gráfico hoje | Destino | Por quê |
|---|---|---|
| Previsão de parcelas | **sai da Análise** | o painel Compromissos futuros (Fatia 2) e o passo 2 respondem melhor, e no lugar certo |
| Orçamento vs Real | **sai da Análise** | os medidores do Acompanhar e o passo 4 respondem, com ação junto |
| Gasto por cartão | **vira a 6ª pergunta** — *"Em qual cartão eu mais gasto?"* | nada mais no app responde isso |

Nenhum endpoint é removido: `installment-forecast` e `budget-vs-actual` seguem
servidos e testados, apenas sem card próprio. Ver §C.2.

### B.4 Decidir — o fluxo em passos

Página nova, `decidir.html`. O item `Decidir` da navegação deixa de apontar para
`settings.html` e passa a apontar para ela — o rótulo não muda, e o botão
"Começar a revisão" do Acompanhar continua funcionando (§B.1 da Fatia 2 previu
exatamente isso).

**Um passo por vez, com trilha visível:**

```
Revisão de agosto
① O mês que passou  ② Compromissos  ③ Seu modelo  ④ Orçamentos  ⑤ Simular
────────────────────────────────────────────────────────────────────────
                        [ conteúdo do passo ]

              [ Voltar ]                    [ Continuar ]
```

- **Nada é obrigatório.** Cada passo tem "Continuar" e a trilha é clicável: dá
  para pular direto ao 4 ou sair da tela a qualquer momento. É a mitigação do
  risco §15 ("a revisão virar cerimônia que ninguém completa"): o valor está na
  **ordem sugerida**, não na obrigatoriedade.
- **Sem persistência de progresso.** Sair e voltar recomeça no passo 1. O que
  persiste é o que cada passo grava (modelo, limites) — que são gravações
  normais da API, não estado de wizard. Isso evita ressuscitar o `setup.html`
  que a Fatia 1 matou.

**Quais meses.** Uma função pura decide, a partir de hoje:

```
reviewMonths('2026-08-08') → { closed: '2026-07', opening: '2026-08' }
```

O passo 1 lê o mês **fechado**; os passos 2, 3 e 4 escrevem no mês que
**começa**. Um seletor no cabeçalho permite deslocar os dois juntos, para quem
faz a revisão atrasada. Ver §C.3.

**Passo a passo:**

1. **O mês que passou** — a pauta do §B.3, com o intervalo terminando em
   `closed`. Leitura, não ação. Reusa os mesmos módulos de render da Análise.
2. **O que já está comprometido** — `renderCommitments(buildCommitments(...))`
   da Fatia 2, com `?month=opening`. Zero código novo.
3. **Seu modelo** — renda, custos fixos, meta. Grava `monthly_model[opening]` e
   `settings`. **É aqui que o app sai do estado inicial do §6:** na primeira vez,
   é a primeira vez que a projeção e o "Posso gastar este mês" passam a existir.
4. **Ajustar orçamentos** — categorias que **estouraram no mês fechado aparecem
   primeiro**, cada uma com o gasto do mês, o limite atual e dois botões de
   sugestão (`usar mês anterior`, `usar média de 3 meses`) vindos de
   `/api/limits/suggestions?month=opening`, que já existe. Grava em
   `PUT /api/limits` com `month = opening`, preservando o histórico por-mês.
5. **Simular (opcional)** — o formulário de `simulate.html`, embutido. "E se eu
   comprar X em N vezes?" contra os limites recém-definidos no passo 4 — que é o
   que torna este passo a última pergunta natural da revisão, e não uma feature
   órfã.

**Fim** — resumo do que mudou nesta sessão (modelo gravado, quais limites
mudaram e de quanto para quanto) e um botão para o Acompanhar, agora no estado
completo.

### B.5 Módulos e fronteiras

O mesmo padrão das fatias anteriores: funções puras mais uma casca fina de
wiring.

**Front-end**

| Arquivo | Função | Contrato |
|---|---|---|
| `public/js/pauta.js` *(novo)* | `questionCard(question, id, note)` | HTML de um card com a pergunta como título |
| | `monthlyTotals(trends)` | `{ months, totals_cents[] }` — soma as séries por mês |
| | `biggestChange(trends)` | `{ name, delta_cents } \| null` — maior variação entre os dois últimos meses |
| | `changeSentence(change, monthName)` | `'Restaurantes & Delivery subiu R$ 180,00 em relação a julho'` |
| `public/js/review.js` *(novo)* | `reviewMonths(today)` | `{ closed, opening }` |
| | `overspentFirst(rows)` | estouradas primeiro, depois o resto por gasto decrescente |
| | `summaryLines(decisions)` | linhas do resumo final |
| `public/js/analise.js` | reescrito para a pauta, importando `pauta.js` | |
| `public/js/decidir.js` *(novo)* | wiring dos passos | |
| `public/js/chrome.js` | `Decidir` → `/decidir.html` | |

**Back-end**

| Arquivo | Mudança |
|---|---|
| `migrations/008_monthly_model.sql` | novo |
| `src/domain/entities/index.ts` | `MonthlyModel` |
| `src/domain/ports/index.ts` | `MonthlyModelRepository`; `ReportRepository.committedSpendMonth` |
| `src/infra/repositories/monthlyModel.ts` | novo |
| `src/infra/repositories/reports.ts` | `committedSpendMonth` |
| `src/application/use-cases/model.ts` | novo — `resolve(month)`, `set(month, input)` |
| `src/application/use-cases/bi.ts` | `committedVsDiscretionary`, `savingsRealized`; séries antigas em pt-BR |
| `src/adapters/http/controllers/bi.ts` | duas rotas |
| `src/adapters/http/controllers/monthlyModel.ts` | novo |
| `src/infra/composition.ts` | fiação |

A arquitetura hexagonal não muda: nada novo atravessa camada.

### B.6 Testes e verificação

- **Unidade, `node:test`**, sobre as funções puras: `reviewMonths` (incluindo a
  virada de ano — janeiro fecha dezembro do ano anterior), `monthlyTotals`,
  `biggestChange` (subida, queda, empate, série única, intervalo de um mês só),
  `overspentFirst`, `summaryLines`, `questionCard`.
- **`resolveModel`**: os três degraus da cadeia — linha do mês, linha anterior
  mais recente, `settings`, zeros.
- **Migração 008** no padrão de `migrations.test.ts`: banco novo ganha a tabela;
  banco com `settings` preenchido ganha a linha semeada; banco sem `settings`
  não ganha linha nenhuma.
- **Endpoints novos** com `supertest`, incluindo `from > to` → 400, no padrão
  dos testes de BI que já existem.
- **`committedSpendMonth`** com uma transação que é essencial **e** parcelada,
  provando que não conta duas vezes.
- **Regressão do §A.2**: mudar `settings.monthly_income` **não** pode alterar
  `savings-realized` de um mês que já tem linha em `monthly_model`. Esse teste é
  a razão de ser da fatia inteira do lado dos dados.
- `npm test`, `npm run typecheck`, `npm run lint` limpos.
- **Verificação no app**: rodar a revisão de ponta a ponta num banco limpo,
  confirmando que ao fim o Acompanhar mudou do herói inicial para o completo —
  a transição do §6 que nenhuma outra tela dispara.

### B.7 Fora de escopo

- Import de CSV, mobile, multiusuário, nuvem — §14 da spec, inegociável.
- Remover a tabela `groups` (§10: fica para depois de v0.3 estável).
- Notificação/lembrete de "está na hora da revisão". O ritual é puxado, não
  empurrado.
- Persistir progresso da revisão entre sessões (§B.4).

---

## C. O que ainda depende de você

Seis pontos. Os três primeiros mudam o que eu construo; os três últimos são
confirmação.

### C.1 ⚠ `essential` entra na definição de "comprometido"?

A spec §8 diz que a série é derivada de `essential` + `installment_group_id` +
recorrência, e §B.2 implementa isso. A consequência: **Mercado e Transporte
contam como compromisso assumido**, porque são `essential = 1`.

Defensável — mercado é inevitável. Mas "compromisso assumido" também se lê como
"o que eu já assinei embaixo", e nessa leitura só parcelas e recorrências
entram, e o número fica bem menor.

Minha recomendação: **seguir a spec** (essencial conta). É a leitura que faz a
taxonomia de grupos reaparecer como insight, que é o efeito colateral que o §8
comemora.

### C.2 ⚠ Os três gráficos que não são perguntas

§B.3 propõe: previsão de parcelas e orçamento-vs-real **saem** da Análise
(respondidos melhor pelo painel de compromissos e pelo passo 4), e gasto por
cartão **vira a 6ª pergunta**. Endpoints ficam.

A alternativa é manter os três num bloco "Outras leituras" — mas isso reconstrói
a galeria que o §8 rejeita explicitamente.

### C.3 ⚠ Qual mês a revisão revisa

`reviewMonths(hoje)` propõe `closed = mês anterior`, `opening = mês corrente`.
Rodar a revisão em 31/ago revisa julho e orça agosto — quando a intenção
provavelmente seria revisar agosto e orçar setembro. O seletor de mês no
cabeçalho cobre o caso, mas o padrão precisa de uma escolha.

Alternativa: `closed`/`opening` avançam quando faltam menos de N dias para o fim
do mês. Mais esperto, menos previsível.

### C.4 Custos fixos podem estar sendo contados duas vezes

Isto **já acontece hoje**, não é da Fatia 3 — mas a poupança realizada herda o
problema e o torna visível.

`realizada = renda − custos_fixos − gasto_do_mês`. Se o aluguel está em
`fixed_costs` **e** lançado como transação em "Moradia & Contas", ele é
subtraído duas vezes. O seed genérico da Fatia 1 tem "Moradia & Contas" como
categoria, o que convida exatamente esse lançamento.

Não resolvo isso na Fatia 3 sem decisão sua: ou `fixed_costs` deixa de existir e
vira "as categorias marcadas como essenciais", ou o passo 3 avisa explicitamente
que custos fixos **não** devem ser lançados como transações.

### C.5 A spec §11 precisa de um adendo

`GET/PUT /api/monthly-model` não está previsto na tabela de API da spec. É
consequência direta de §A.4. Se aprovado, vale acrescentar a linha na
`docs/spec-v0.3.md` para a spec continuar sendo a fonte da verdade.

### C.6 Existem frames de Decidir e Análise no Figma?

A enumeração de páginas do arquivo `CBcJpLlGqbQ6WVCNUWLjyk` devolve só
`Components`, mas os frames da Fatia 2 (`4:3`, `11:48`) continuam resolvendo —
então a listagem está incompleta e não dá para concluir nada. A numeração das
páginas citadas no design da Fatia 2 (`01 · Registrar`, `02 · Acompanhar`,
`05 · Mobile`) pula 03 e 04, o que sugere que Decidir e Análise nunca foram
desenhados.

Este documento especifica as duas telas em texto. Se os frames existirem, me
passe os node-ids e eu valido o desenho contra eles antes do plano — foi o que
a Fatia 2 fez, e foi onde apareceram as três correções do §A daquele documento.

---

## Decisões registradas

1. `monthly_model` é tabela nova por mês, espelhando `category_limits`;
   `settings` continua sendo o modelo corrente e o sinal `configured` do §6.
2. A revisão não persiste progresso — só o que cada passo grava pela API.
3. Nenhum passo é obrigatório; a trilha é clicável e a saída é livre.
4. `Decidir` passa a apontar para `decidir.html`; o rótulo da nav não muda.
5. Previsão de parcelas e orçamento-vs-real saem da Análise sem que seus
   endpoints sejam removidos.
6. "O que mais mudou" é variação entre meses, não maior série absoluta.
7. Séries de BI passam a sair em pt-BR, inclusive as antigas.

## Riscos

| Risco | Mitigação |
|---|---|
| A revisão virar cerimônia que ninguém completa (spec §15) | Todo passo é opcional, a trilha é clicável e sair não perde o que já foi gravado |
| `monthly_model` divergir de `settings` e o herói mostrar um número e a Análise outro | O passo 3 grava nos dois numa ação só; teste de regressão cobre a divergência |
| Backfill da 008 semear o mês errado em quem instalou há muito tempo | Semeia só o mês corrente e só para quem já tem `monthly_income`; o resto resolve pela cadeia de fallback |
| Custos fixos contados duas vezes (§C.4) | Decisão pendente; o número de poupança realizada fica suspeito enquanto não for tomada |
| A Análise ficar sem audiência mesmo repensada | O passo 1 da revisão a torna destino com motivo, não só com link |

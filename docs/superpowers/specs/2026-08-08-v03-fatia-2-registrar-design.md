# Gastando v0.3 — Fatia 2: Registrar — Design

- Data: 2026-08-08
- Autor: Thiago Bergami Guedes
- Deriva de: [`docs/spec-v0.3.md`](../../spec-v0.3.md) §5, §7, §8 e §13
- Designs: Figma `CBcJpLlGqbQ6WVCNUWLjyk` — páginas `Components`, `01 · Registrar`, `02 · Acompanhar`, `05 · Mobile`
- Escopo: **desenho da Fatia 2.** O plano task-by-task é documento separado.

Este documento faz duas coisas: registra as correções ao plano já escrito da Fatia 1
(§A) e desenha a Fatia 2 (§B). A Fatia 3 será desenhada depois que 1 e 2 estiverem
no código — plano detalhado escrito hoje contra um código que ainda vai mudar muito
envelhece mal.

---

## A. Correções ao plano da Fatia 1

`docs/superpowers/plans/2026-08-07-v03-fatia-1-fundacao.md` foi escrito contra este
mesmo Figma e continua válido: as 10 tasks, as migrações `006`/`007` e a Definition
of Done ficam como estão. A validação contra os frames encontrou três ajustes.

### A.1 Subtítulo do cabeçalho de página

O Figma tem, sob o título `Acompanhar`, uma linha de contexto que o plano não cobre:

| Estado | Frame | Texto |
|---|---|---|
| Completo | 10:15 | `Agosto de 2026 · faltam 25 dias para fechar o mês` |
| Inicial | 12:53 | `Agosto de 2026 · 14 lançamentos até agora` |

A Task 6 já reescreve `public/js/dashboard.js` e mexe no `index.html`, mas não gera
essa linha. Entra lá, como função pura ao lado de `monthLabel` — dias restantes
calculados a partir do mês exibido, não de `Date.now()` direto, para ser testável.

### A.2 Divergência intencional nos medidores do herói inicial

No frame `Hero — Para onde foi` (12:54) os seis medidores exibem
`R$ 620,00 / R$ 850,00` e todos se chamam "Mercado" — são duplicatas não renomeadas,
não uma decisão de design. A spec §6 define esse herói como a **composição** dos
gastos do mês, e o plano renderiza `R$ 620,00 · 72%`. O plano está certo; falta só a
nota explicando a divergência, como a Task 6 já faz para os números do herói completo.

### A.3 O toggle de tema sai do cabeçalho

`Nav/Top` (3:11) tem `Gastando` à esquerda e, à direita, `Registrar · Acompanhar ·
Decidir` mais `icon/settings`. **Não há botão de tema.** A spec §3 lista "tema" entre
as responsabilidades de Configurações. Logo o `◐` de `chrome.js` deixa de ser controle
de cabeçalho e vira uma opção em Configurações.

A Fatia 1 não toca na navegação, então essa mudança pertence à Fatia 2 (§B.1). Fica
registrada aqui para não se perder entre as fatias.

---

## B. Fatia 2 — Registrar

**Entregável:** o loop de captura fica rápido e a navegação para de ser uma lista plana.

### B.0 A fatia é quase toda front-end

Vale dizer antes de tudo, porque muda a percepção de tamanho: **nada de novo é
preciso no backend.**

| O que a fatia precisa | O que já existe |
|---|---|
| Criar categoria no fluxo | `POST /api/categories` (ganha `essential` na Fatia 1) |
| Criar cartão no fluxo | `POST /api/cards` |
| Parcelas em aberto, com progresso | `GET /api/installment-groups?month=` → `InstallmentProgress[]` |
| Recorrências ativas | `GET /api/recurring` → `RecurringTemplate[]` |

A spec §11 confirma: nenhum endpoint novo está previsto. A única mudança em `src/`
são dois redirects de rota (§B.2). Todo o resto vive em `public/`.

### B.1 Navegação

`public/js/chrome.js` passa a exportar três itens, com rótulos em verbo:

```
Gastando          Registrar · Acompanhar · Decidir   ⚙
```

- **Desktop** — conforme `Nav/Top` (3:11): marca à esquerda, links e engrenagem
  alinhados à direita.
- **Mobile** — `Nav/MobileTop` (21:2) no topo (marca + engrenagem) e `Nav/Bottom`
  (21:7) embaixo, três abas com ícone e rótulo.
- **Tema** — o botão `◐` sai do cabeçalho (§A.3) e vira opção em Configurações.
- **`Decidir` aponta para `settings.html`** enquanto a Fatia 3 não existe. É a tela
  onde hoje se define renda, custos fixos, meta e limites — exatamente o conteúdo dos
  passos 3 e 4 do roteiro da revisão. Na Fatia 3 ela é absorvida pelo fluxo em passos
  sem que o rótulo mude e sem quebrar o "Começar a revisão" do Acompanhar.
- **Saem da navegação e continuam existindo:** `parcelas.html`, `recurring.html`,
  `simulate.html`. São alcançadas pelo painel de compromissos (§B.4) e, na Fatia 3,
  pela revisão.

### B.2 Rotas e renomeação

O vocabulário do §5 chega às URLs:

| Hoje | v0.3 |
|---|---|
| `transactions.html` | `registrar.html` |
| `bi.html` | `analise.html` |
| `index.html` (`/`) | inalterado — é o Acompanhar |
| `parcelas.html` · `recurring.html` · `simulate.html` · `settings.html` · `category.html` | inalterados |

Favoritos existentes não podem quebrar: `src/app.ts` ganha dois redirects
`301` para os nomes antigos, **antes** do `express.static`.

### B.3 Registrar — a linha de entrada rápida

A tela mais crítica do redesign. Frame `Registrar — Desktop` (4:3).

**Cabeçalho:** título `Registrar`, subtítulo
`Lance os gastos da semana. Enter salva e mantém o foco no próximo.`

**Card `Lançamento rápido`** (5:10) — cinco campos na ordem do Figma, todos
`Field/Text` (nenhum `select`):

```
data · descrição · categoria · cartão · valor        [Adicionar]
────────────────────────────────────────────────────────────────
+ dividir em N vezes        + repete todo mês
```

**Comportamento** (spec §7):

- **Teclado-first.** `Tab` percorre na ordem natural; `Enter` salva.
- **Data e cartão persistem** entre lançamentos — o caso comum é lançar vários gastos
  do mesmo cartão.
- **O foco volta para *descrição***, não para data. A spec diz "o primeiro campo";
  como data e cartão persistem, descrição é o primeiro campo que de fato se digita
  de novo. O formulário não fecha.
- **A linha salva aparece imediatamente no topo da lista.** Erros aparecem inline,
  sem modal.

**Categoria e cartão por digitação.** `<input list>` + `<datalist>`: o autocomplete é
o nativo do browser, então `Tab` e `Enter` funcionam sem código de gerenciamento de
foco, e não há widget custom com ARIA e navegação por setas para manter. Um nome não
reconhecido mostra uma dica sob o campo — `↵ cria a categoria Farmácia` — e é criado
no submit, antes da transação.

Isso importa mais do que parece: com o seed genérico da Fatia 1 **não existe nenhum
cartão no dia 1**. Se a linha rápida não souber criar cartão, o primeiro lançamento
do app é impossível sem passar por Configurações — exatamente o que a spec §6 proíbe.

**Campos avançados**, colapsados sob a divisória:

- `dividir em N vezes` → cria um `installment_group` e expande, como hoje.
- `repete todo mês` → cria um template recorrente, como hoje.

**Lista de transações** (6:32) — colunas `DATA · DESCRIÇÃO · CATEGORIA · CARTÃO ·
VALOR`, sem o chip de grupo (já removido na Fatia 1, Task 8).

### B.4 Compromissos futuros

Painel no Acompanhar, frame `Compromissos futuros` (11:48). Responde "quanto dos
próximos meses já está comprometido antes de eu gastar qualquer coisa".

```
Compromissos futuros
O que já está reservado antes de você gastar qualquer coisa.

Notebook         parcela 3 de 10 · até jun/2027        R$ 416,00 /mês
Netflix          repete todo mês                        R$ 44,90 /mês
Seguro celular   repete todo mês                        R$ 89,90 /mês

Já comprometido por mês                                    R$ 550,80
```

**Montado no cliente**, das duas chamadas que já existem. Tudo o que a linha de
parcela precisa está em `InstallmentProgress`: `paid_count`/`total_count` dão o
"3 de 10", `monthly_cents` dá o valor, e o mês final é `first_month + total_count - 1`
— uma função pura, não um campo novo no payload.

**O painel é só leitura**, como desenhado. A gestão do que já existe (editar uma
parcela em curso, pausar uma recorrência) continua em `parcelas.html` e
`recurring.html`, que saem da navegação mas seguem existindo: cada linha do painel é
um link para a tela correspondente. Cumpre a spec §7 ("acessível a partir do painel")
sem reescrever UI que funciona dentro da fatia mais crítica do redesign.

### B.5 Vocabulário

As renomeações do §5 que faltam depois da Fatia 1:

| Hoje | v0.3 |
|---|---|
| `Dashboard` | `Acompanhar` |
| `Transações` | `Registrar` |
| `BI` | `Análise` |
| `Parcelas` · `Recorrentes` (itens de nav) | somem da nav |

`Teto saudável` → `Posso gastar este mês` e a remoção de `Grupo` da UI já acontecem
na Fatia 1.

### B.6 Módulos e fronteiras

Dois módulos novos em `public/js/`, ambos desenhados como **funções puras mais uma
casca fina de wiring** — que é o padrão que o projeto já usa e o que torna o
front-end testável sem DOM.

**`quickentry.js`**

| Função | Contrato |
|---|---|
| `renderEntryRow(cats, cards, sticky)` | HTML da linha; `sticky = { date, card }` |
| `resolveRef(name, items)` | `{ id }` se casa por nome (case-insensitive), `{ create: name }` se não, `null` se vazio |
| `entryHint(name, items, kind)` | `''` ou `↵ cria a categoria X` |

**`commitments.js`**

| Função | Contrato |
|---|---|
| `lastMonth(firstMonth, count)` | `'2026-06' , 10 → '2027-03'` |
| `buildCommitments(installments, recurring)` | `{ rows: Row[], total_cents }`, parcelas antes de recorrências |
| `renderCommitments(model)` | HTML do painel |

`chrome.js` perde `enforceOnboarding` (Fatia 1) e o toggle de tema, e ganha os três
itens mais os dois layouts de mobile.

### B.7 Testes e verificação

- Testes de unidade em `node:test` sobre as funções puras acima, no padrão existente
  (`await import('../public/js/x.js')` para os módulos ES do front-end).
- `renderNav` testado nos três itens e no estado ativo de cada rota.
- Os redirects dos nomes antigos (`transactions.html` → `registrar.html`,
  `bi.html` → `analise.html`) testados com supertest.
- `npm test`, `npm run typecheck` e `npm run lint` limpos.
- **Medição obrigatória** (risco spec §15): lançar **20 transações cronometrado** num
  banco limpo antes de considerar a fatia pronta. Sem import de CSV e sem mobile, não
  há plano B para a captura — se a linha rápida não for rápida, o redesign não
  entrega o que promete. O número medido vai no commit final.

### B.8 Fora de escopo desta fatia

Fluxo em passos do Decidir; Análise repensada com a pauta de perguntas; série de
poupança realizada; série comprometido vs. discricionário; migração do Simular para
dentro da revisão. Tudo isso é Fatia 3.

---

## Decisões registradas

1. `Decidir` já aparece na nav da Fatia 2, apontando para `settings.html`; a nav não
   muda de forma duas vezes.
2. O painel de compromissos é só leitura; `parcelas.html` e `recurring.html`
   sobrevivem fora da nav como telas de manutenção.
3. Categoria e cartão usam `<datalist>` nativo, com criação no submit — não um
   combobox próprio.
4. Arquivos e rotas acompanham o vocabulário: `registrar.html` e `analise.html`, com
   redirect dos nomes antigos.
5. O toggle de tema sai do cabeçalho e vira opção em Configurações.
6. Nenhum endpoint novo: a fatia é front-end mais dois redirects.

## Riscos

| Risco | Mitigação |
|---|---|
| A linha rápida não ser rápida o bastante — sem import nem mobile, não há plano B | Cronometrar 20 lançamentos antes de fechar a fatia (§B.7) |
| `<datalist>` ter comportamento desigual entre browsers | O app é local e abre no browser padrão do usuário; a criação acontece no submit, então mesmo sem dropdown o fluxo de digitar-e-salvar funciona |
| Criação silenciosa de categoria por erro de digitação ("Mercdo") | A dica sob o campo é explícita antes do submit, e a categoria criada aparece na lista imediatamente |
| Renomear arquivos quebrar links internos esquecidos | Redirects `301` cobrem o que escapar; `grep` por `transactions.html`/`bi.html` na Definition of Done |

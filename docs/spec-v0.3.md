# Gastando v0.3 — Spec de Redesign

**De um sistema financeiro com sete abas para um loop de controle financeiro simples.**

- Data: 2026-08-06
- Autor: Thiago Bergami Guedes
- Origem: sessão de grilling (skill `grilling`) — árvore de decisão fechada, 25 decisões travadas
- Substitui parcialmente: [`spec.md`](./spec.md) (v0.1) — as seções de navegação, vocabulário,
  onboarding e taxonomia. O restante de `spec.md` (modelo monetário, expansão de parcelas,
  arquitetura hexagonal, Docker) permanece válido.
- Escopo: **spec de produto.** O plano de implementação task-by-task é um documento separado,
  a ser escrito depois da aprovação desta spec.

---

## 1. Diagnóstico

O app funciona. O problema não é de features faltando — é de **ausência de espinha dorsal**.

Conforme features foram adicionadas, cada uma virou uma aba. A navegação hoje tem **sete itens
irmãos, sem hierarquia**:

```
Dashboard · Transações · Parcelas · Recorrentes · Configurações · BI · Simular
```

Três deles (*Parcelas*, *Recorrentes*, *Simular*) são indistinguíveis para quem chega de fora:
todos parecem "algo sobre valores futuros". Um usuário novo não tem como saber que *Recorrentes*
é entrada de dados e *Simular* é uma calculadora hipotética.

### Evidência observada

Usuários reais testando o app:

- **Não sabiam qual era o próximo passo** nem o que dava para fazer.
- **Pularam o setup** e foram direto para o app.
- **Travaram em "definir categorias"** — conceitos como categoria e grupo não estavam claros.

### Causa-raiz encontrada no código

O template "sugerido" do onboarding é **a vida pessoal do autor**. `migrations/002_seed.sql`
semeia `Pet (Border Collie)`, `Educação & Cursos — PUC-Rio`, `Hobbies criativos — Show da Música,
Caçula`, os cartões `Nubank / Mercado Pago / Itaú`, renda mensal de R$ 14.350 e custos fixos de
R$ 3.770.

`onboarding.applyTemplate` oferece exatamente duas opções: `suggested` (isso) ou `blank` (nada).

**O usuário estava escolhendo entre as categorias de outra pessoa e uma tela vazia.** Não é bug
de UX — é o produto ainda não ter sido despersonalizado, o que é fatal para o objetivo de
distribuir binários para qualquer um baixar.

---

## 2. Princípios

1. **O app é um loop, não um menu.** Cada tela é um verbo do ciclo, não uma feature.
2. **Nada é pedido antes de haver recompensa.** Configuração emerge no contexto onde faz sentido.
3. **Um conceito só existe na UI se o usuário precisa dele para agir.** O resto é derivado.
4. **A captura em lote é o único caminho de entrada** — sem import, sem mobile. Ela precisa ser
   rápida a ponto de não desestimular o uso.
5. **A identidade visual não é o problema.** Serene Ledger fica; a estrutura por baixo muda.

---

## 3. O loop

O modelo mental é o GTD aplicado a dinheiro: um ciclo fechado, com um ritual de revisão que o
fecha.

| Verbo | Frequência | O que é |
|---|---|---|
| **Registrar** | semanal (lote) | Lançar os gastos. A tela mais usada do app. |
| **Acompanhar** | a cada abertura | "Como estou indo este mês?" |
| **Decidir** | mensal | A **revisão mensal** — o *weekly review* do GTD. Fecha o loop. |

`Decidir` é o que diferencia este app de um registro passivo de gastos. Sem revisão, GTD é uma
caixa de entrada infinita; sem revisão, um app de gastos é um extrato mais bonito.

### Navegação

Três itens, rótulos em verbo, compatíveis com barra inferior em telas pequenas:

```
Registrar · Acompanhar · Decidir          [⚙ configurações no header]
```

`Configurações` sai da navegação e vira ícone no header. Ela deixa de ser um destino do fluxo e
passa a ser manutenção (cartões, categorias, backup, exportação CSV, tema).

---

## 4. Mapa de telas

| Hoje | v0.3 | Natureza da mudança |
|---|---|---|
| `transactions.html` | **Registrar** | Vira a tela principal de entrada, com linha rápida |
| `recurring.html` | checkbox *"repete todo mês"* no registro | Deixa de ser tela |
| `parcelas.html` (criar) | campo *"dividir em N vezes"* no registro | Deixa de ser tela |
| `parcelas.html` (lista) | painel *"compromissos futuros"* | Move para Acompanhar e para Decidir |
| `index.html` (dashboard) | **Acompanhar** | Zero-state repensado (§6) |
| `category.html` | permanece | Alcançada por clique em Acompanhar |
| `bi.html` | **Análise** | Sobrevive como destino, com pauta nova (§8) |
| `simulate.html` | passo opcional da revisão | Deixa de ser item de nav |
| limites + modelo de poupança | passos da revisão | Movem de Configurações para Decidir |
| `settings.html` | **Configurações** (ícone) | Sai da nav |
| `setup.html` (wizard) | **removida** | O app abre usável (§6) |

**Nenhuma capacidade é perdida.** Cinco telas deixam de ser lugares e viram campos, painéis ou
passos de um fluxo.

---

## 5. Vocabulário do produto

Conceitos que o usuário precisa entender são poucos e nomeados em linguagem direta. Conceitos de
contabilidade viram derivados invisíveis.

| Termo hoje | v0.3 | Motivo |
|---|---|---|
| **Grupo** (`Essenciais / semi-fixos`, `Estilo de vida`, `Fundos`, `Folga`) | **removido da UI** — vira o atributo `essential` da categoria | Taxonomia de dois níveis que o usuário precisa entender antes do primeiro lançamento. É conceito de contador, não de pessoa. |
| **Teto saudável** | **"Posso gastar este mês"** | Número calculado que competia com "Limite" sem que nada explicasse a diferença. O novo nome é literalmente a pergunta que a pessoa tem. |
| **BI** | **Análise** | Jargão corporativo em app doméstico. |
| **Recorrentes** (substantivo) | comportamento: *"repete todo mês"* | Deixa de ser uma coisa que existe e vira uma propriedade do lançamento. |
| **Limite** | mantido | Claro o bastante, e agora sem "teto" competindo. |
| **Parcelas** | mantido | Termo que todo brasileiro domina. Manter é o certo. |
| **Dashboard** | **Acompanhar** | Verbo em vez de substantivo importado. |

### Glossário resultante

O usuário de v0.3 precisa entender **quatro** conceitos: *transação*, *categoria*, *limite*,
*parcela*. Tudo o mais é derivado ou nomeado como ação.

---

## 6. O primeiro minuto (zero-config)

**O wizard de onboarding é removido.** O app abre direto no Registrar, usável, sem pedir nada.

### Consequência aceita

O herói atual do dashboard é a projeção de poupança, que depende de `monthly_income`,
`fixed_costs` e `savings_goal` — exatamente os valores que o wizard coletava. Sem wizard, no dia 1
esses valores não existem.

**Resolução:** o Acompanhar tem dois estados.

| Estado | Condição | Herói |
|---|---|---|
| **Inicial** | modelo de poupança não configurado | **"Para onde seu dinheiro foi"** — composição dos gastos do mês. Funciona a partir da 1ª transação. |
| **Completo** | renda e custos fixos configurados | Projeção de poupança + "Posso gastar este mês", como hoje |

A transição entre os dois acontece na revisão mensal (§9, passo 3) — que é onde renda e meta
pertencem conceitualmente. Não há convite intrusivo, não há banner de "complete seu perfil": o
usuário chega lá pelo fluxo.

### Categorias no dia 1

O seed pessoal sai do repositório. `002_seed.sql` passa a semear um conjunto genérico brasileiro
enxuto. Categorias novas são criadas **dentro do fluxo de registro** — nunca é preciso ir a
Configurações para lançar um gasto.

> **⚠ Proposta para aprovação — lista de categorias padrão**
>
> | Categoria | `essential` |
> |---|---|
> | Mercado | sim |
> | Transporte | sim |
> | Moradia & Contas | sim |
> | Saúde | sim |
> | Assinaturas | sim |
> | Restaurantes & Delivery | não |
> | Lazer | não |
> | Outros | não |
>
> Oito categorias, nomes que qualquer brasileiro reconhece sem explicação, sem `examples`
> preenchidos (os exemplos atuais são estabelecimentos pessoais). Sem limites semeados — limites
> nascem na primeira revisão mensal. Sem cartões semeados — o primeiro cartão é criado no
> primeiro lançamento. Sem valores de renda/custos/meta.

---

## 7. Registrar

A captura em lote é o **único** caminho de entrada de dados em v0.3 (sem import de CSV, sem
mobile). Isso eleva esta tela de "importante" a **crítica**: se ela não for rápida, não haverá
dado, e nada mais no redesign importa.

### Linha de entrada rápida

Formulário persistente no topo da lista, otimizado para 20 lançamentos seguidos:

- **Teclado-first.** Tab percorre os campos na ordem natural; `Enter` salva.
- **O foco volta** para o primeiro campo após salvar — o formulário não fecha.
- **Data e cartão persistem** entre lançamentos (o caso comum é lançar vários gastos do mesmo
  cartão).
- **Categoria por digitação**, com autocomplete. Digitar um nome inexistente oferece
  *"criar categoria X"* ali mesmo.
- **Feedback sem interrupção:** a linha salva aparece imediatamente no topo da lista; erros
  aparecem inline, sem modal.

### Campos avançados (colapsados)

- `dividir em N vezes` → cria um `installment_group` e expande, como hoje.
- `repete todo mês` → cria um template recorrente, como hoje.

Ambos deixam de ter tela própria. A gestão do que já existe (editar uma parcela em curso, pausar
uma recorrência) fica acessível a partir do painel de compromissos em Acompanhar.

---

## 8. Acompanhar e Análise

### Acompanhar — "este mês"

- Herói conforme o estado (§6).
- Medidores por categoria: gasto vs. limite, com o carry-over de estouro já implementado
  (`computeCarryIn`). Categorias sem limite aparecem com valor gasto, sem medidor — não como erro.
- **Painel de compromissos futuros**: parcelas em aberto e recorrências ativas — quanto dos
  próximos meses já está comprometido antes de gastar qualquer coisa. (Herda a tela `parcelas.html`.)
- Clique em categoria → `category.html` com a tendência daquela categoria.
- Link claro para **Análise** ("ver ao longo do tempo").

### Análise — "ao longo do tempo"

Sobrevive como destino próprio, alcançável por dois caminhos: por curiosidade a partir do
Acompanhar, e como passo 1 obrigatório da revisão mensal.

Deixa de ser uma galeria de cinco gráficos e passa a ter uma **pauta de perguntas nomeadas**:

| Pergunta | Fonte |
|---|---|
| Para onde meu dinheiro foi? | composição por categoria no mês |
| Estou gastando mais ou menos que antes? | tendência total ao longo dos meses |
| O que mais mudou este mês? | "Maior Impacto" (já implementado) |
| Quanto do meu gasto já é compromisso assumido? | comprometido (parcelas + recorrentes) vs. discricionário |
| Quanto eu de fato guardei? | poupança realizada vs. meta, por mês |

Cada gráfico responde uma pergunta escrita em português, e o título é a pergunta.

**Duas dessas não existem hoje:**

- *Comprometido vs. discricionário* é o que substitui o atual gráfico de gasto-por-grupo. Note o
  efeito colateral bom: a taxonomia que confundia o usuário some da UI e reaparece como insight
  útil, derivada de `essential` + `installment_group_id` + recorrência.
- *Poupança realizada* é o buraco apontado em `docs/suggestions.md`: a poupança é o número-herói
  do app e não tem histórico em lugar nenhum.

---

## 9. Decidir — a revisão mensal

O ritual que fecha o loop. Tem começo, meio e fim — não é uma tela de configurações com outro
nome.

> **⚠ Proposta para aprovação — roteiro**
>
> **Passo 1 — O mês que passou.** Abre na Análise, com a pauta do §8 apontada para o mês que
> fechou. Leitura, não ação.
>
> **Passo 2 — O que já está comprometido.** Parcelas e recorrências que vão cair no mês que
> começa. Mostra quanto do mês já está gasto antes de qualquer decisão.
>
> **Passo 3 — Seu modelo.** Renda, custos fixos, meta de poupança. **Este é o passo onde o app
> sai do estado inicial** (§6) — a primeira vez que o usuário chega aqui é a primeira vez que a
> projeção de poupança e o "Posso gastar este mês" passam a existir. Nas revisões seguintes é
> apenas confirmação.
>
> **Passo 4 — Ajustar orçamentos.** Categorias que estouraram aparecem primeiro. Cada uma com
> sugestão baseada em histórico ("usar a média dos últimos 3 meses"), aproveitando o que
> `docs/suggestions.md` já propôs. Limites são gravados no mês novo, preservando o histórico
> por-mês existente.
>
> **Passo 5 — Simular (opcional).** "E se eu comprar X em N vezes?" Herda `simulate.html`. Deixa
> de ser uma feature órfã e vira a última pergunta natural da revisão.
>
> **Fim.** Resumo do que foi decidido, e volta para o Acompanhar já no estado completo.

O usuário pode sair a qualquer momento; nada é obrigatório. O que importa é que exista uma ordem
sugerida — é ela que responde "qual é o próximo passo", a pergunta que os usuários observados não
souberam responder.

---

## 10. Modelo de dados

### Migração `006` — aditiva, sem perda

```sql
ALTER TABLE categories ADD COLUMN essential INTEGER NOT NULL DEFAULT 0;

UPDATE categories
   SET essential = 1
 WHERE group_id IN (SELECT id FROM groups WHERE name LIKE 'Essenciais%');
```

- A tabela `groups` **não é apagada**. Ela para de ser usada na UI e na API, mas continua no banco
  — a mudança é reversível e nada é perdido.
- A remoção de `groups` fica para uma migração futura, depois de v0.3 estar estável.

**Limitação conhecida:** o backfill casa pelo nome do grupo semeado (`Essenciais / semi-fixos`).
Usuários que renomearam grupos terão `essential = 0` em categorias que deveriam ser essenciais, e
precisarão corrigir em Configurações. Dado o número atual de instalações (poucas), o custo é
aceitável e a alternativa — heurística por `sort_order` — é mais frágil.

### Seed `002_seed.sql`

O runner de migrações (`src/infra/db.ts`) registra migrações **por nome, sem checksum**. Bancos
existentes já têm `002_seed.sql` marcado como aplicado e nunca o re-executam. Portanto **editar
`002_seed.sql` diretamente é seguro** e afeta apenas instalações novas — não é preciso criar uma
migração de "limpeza" nem escrever código de desfazimento.

O conteúdo pessoal (categorias, cartões, renda, custos fixos, meta, limites de junho/2026) sai do
arquivo e é substituído pelas 8 categorias do §6. O `card.md` continua no repositório como
documento histórico, mas deixa de ser fonte de seed.

### `settings`

`onboarding_complete` deixa de existir. A ausência de `monthly_income` passa a ser o sinal que
distingue o estado inicial do completo — nenhuma flag nova é necessária.

---

## 11. API

| Endpoint | v0.3 |
|---|---|
| `GET/POST/PUT/DELETE /api/groups` | **descontinuado** — removido dos controllers e da UI; tabela permanece |
| `POST /api/onboarding/*` | **removido** (`status`, `complete`, `applyTemplate`) |
| `/api/categories` | ganha `essential` no payload de leitura e escrita |
| `/api/dashboard` | agregação por grupo é substituída por agregação por `essential` |
| `/api/bi/*` | ganha série de poupança realizada por mês, e série comprometido vs. discricionário |
| `/api/transactions` | inalterado (já aceita campos de parcela) |
| `GET/PUT /api/monthly-model` | **novo** — modelo de poupança por mês (renda, custos fixos, meta), com resolução carry-forward. Consequência do §9 passo 3: sem dimensão de mês não há "poupança realizada" honesta |
| demais | inalterados |

Nenhuma mudança na arquitetura hexagonal: as alterações ficam contidas em
`domain/entities`, `application/use-cases/{categories,dashboard,bi}` e nos controllers
correspondentes.

---

## 12. Design system

**Serene Ledger permanece como identidade.** A paleta warm-paper (sage/gold/terracotta), a
tipografia (Playfair Display + Inter + JetBrains Mono) e os tokens CSS já refatorados para
variáveis — incluindo o tema escuro derivado — ficam intactos.

**Os componentes são redesenhados.** É neles que a desconexão aparece:

- Medidores de categoria (hoje pensados para viver agrupados sob cabeçalhos de grupo, que somem)
- Cards do Acompanhar, agora com dois estados de herói
- A linha de entrada rápida — componente novo, e o mais importante do app
- Gráficos da Análise, agora com título-pergunta em vez de rótulo técnico
- O fluxo em passos do Decidir — padrão novo, não existe no app hoje

O que **não** se faz: trocar paleta ou tipografia. A estética atual é precisamente o que impede o
app de parecer "mais um sistema financeiro comum" — trocá-la empurraria o produto na direção do
problema.

Quando o MCP do Figma estiver conectado, o pedido a ele é **componentes dentro destes tokens** —
não um redesign do app.

---

## 13. Fases de entrega

Três fatias, cada uma utilizável sozinha. **A ordem importa:** a Fatia 1 é a que conserta o que os
usuários sofreram, e é a menos glamourosa — se ficar para o fim, não sai.

### Fatia 1 — Fundação

Migração `006`; `essential` substituindo grupos na UI, API e agregações; seed genérico; remoção do
wizard e dos endpoints de onboarding; estado inicial do Acompanhar.

*Entregável:* o app abre usável e despersonalizado. Já resolve o travamento observado.

### Fatia 2 — Registrar

Navegação de 3 itens; linha de entrada rápida; parcelas e recorrentes viram campos; painel de
compromissos futuros no Acompanhar; renomeações de vocabulário do §5.

*Entregável:* o loop de captura fica rápido e a navegação para de ser uma lista plana.

### Fatia 3 — Decidir

Fluxo da revisão mensal; Análise repensada com a pauta de perguntas; série de poupança realizada;
série comprometido vs. discricionário; migração do Simular para dentro da revisão.

*Entregável:* o loop fecha.

---

## 14. Fora de escopo

Decidido explicitamente, para não reabrir:

- **Import de CSV / fatura.** Continua sendo o maior alívio possível para o atrito de entrada, e
  continua fora — a captura em lote manual é o caminho de v0.3.
- **Mobile / Flutter.** É tecnicamente viável rodar 100% local em Flutter (`sqflite`/`drift`), mas
  o custo real é reescrever `budget.ts`, `installments.ts`, `dates.ts`, `money.ts` e a suíte de
  testes em Dart, aposentando o backend Express. Volta à mesa quando o registro-na-hora virar
  requisito de verdade — e a navegação de 3 itens já é projetada para caber numa barra inferior.
- **Rearquitetura do backend.** A separação hexagonal fica.
- **Troca de identidade visual.**
- **Multiusuário, nuvem, sincronização.** Local-first permanece inegociável.

---

## 15. Riscos e questões abertas

| Risco | Mitigação |
|---|---|
| A linha de entrada rápida não ser rápida o bastante — e sem import nem mobile, não há plano B para a captura | Medir com um caso real: lançar 20 transações cronometrado, antes de considerar a Fatia 2 pronta |
| Backfill de `essential` errar em bancos com grupos renomeados | Documentado no §10; correção manual em Configurações; `groups` preservada permite refazer |
| A revisão mensal virar cerimônia que ninguém completa | Todo passo é opcional e o usuário pode sair a qualquer momento; o valor está na ordem sugerida, não na obrigatoriedade |
| Análise continuar sem audiência mesmo repensada | O passo 1 da revisão a torna um destino com motivo, não só com link |

**Aberto:** os dois blocos marcados `⚠ Proposta para aprovação` — a lista de categorias padrão
(§6) e o roteiro da revisão mensal (§9).

---

## 16. Registro de decisões

Fechadas na sessão de grilling, para referência de quem for implementar:

1. O loop é `Registrar · Acompanhar · Decidir`, com rótulos em verbo.
2. `Decidir` é a revisão mensal, não uma calculadora — é o que fecha o ciclo.
3. O app é útil sem orçamento configurado; o wizard morre.
4. Padrão público: ~8 categorias BR genéricas, criação inline no fluxo de registro.
5. Grupos colapsam em `essential`, invisível ao usuário; `src/` pode mudar.
6. Registro em lote com linha rápida teclado-first; **sem** import de CSV.
7. Parcelas e recorrentes deixam de ser telas e viram campos.
8. Análise (ex-BI) sobrevive como destino, com pauta de perguntas; alcançada pelo Acompanhar
   **e** como passo 1 da revisão. Nunca como 4º item de navegação.
9. Serene Ledger: tokens ficam, componentes mudam.
10. Migração `006` aditiva, `groups` preservada, zero perda de dado.
11. Entrega em três fatias, Fundação primeiro.
12. Flutter adiado; a navegação de 3 itens já é mobile-compatível.

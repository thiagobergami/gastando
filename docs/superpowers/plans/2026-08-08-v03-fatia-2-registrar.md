# Gastando v0.3 — Fatia 2: Registrar — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a captura em lote rápida e trocar a lista plana de sete abas pelo loop de três verbos — `Registrar · Acompanhar · Decidir`.

**Architecture:** A fatia é quase toda front-end. Dois módulos novos em `public/js/` (`quickentry.js`, `commitments.js`), ambos no padrão do projeto: funções puras que devolvem HTML mais uma casca fina de wiring no fim do arquivo, guardada por `if (typeof document !== 'undefined' && ...)`. Isso é o que torna o front-end testável em `node:test` sem DOM. No backend, a única mudança são dois redirects `301` em `src/app.ts`, antes do `express.static`. Nenhum endpoint novo.

**Tech Stack:** JavaScript ES modules servidos estaticamente (sem build de front-end), Tailwind (classes utilitárias + camada `@layer components` em `public/css/tailwind.src.css`), Express 5 + TypeScript no backend, `node:test` + `supertest` para testes.

## Global Constraints

- **Todo texto de UI em pt-BR.** Sem exceções nesta fatia.
- **Serene Ledger fica.** Nenhuma troca de paleta, de tipografia ou de token. Usar as classes existentes: `paper-card`, `field`, `label-caps`, `btn-primary`, `btn-ghost`, `bottom-nav`, `meter`, `pill`, `tag`, e as cores `text-ink`, `text-ink-mut`, `text-sage`, `text-clay`, `border-line`, `bg-card`.
- **Dinheiro é sempre inteiro em centavos.** Nunca `float`. Conversão só na borda da UI, via `format.js`.
- **Nenhuma capacidade é perdida.** Filtros, busca, paginação, exportação CSV, edição e exclusão continuam existindo em Registrar; `parcelas.html`, `recurring.html` e `simulate.html` continuam existindo fora da navegação.
- **Nenhum endpoint novo.** A fatia consome `/api/categories`, `/api/cards`, `/api/transactions`, `/api/installment-groups`, `/api/recurring`, que já existem.
- **`npm test`, `npm run typecheck` e `npm run lint` limpos ao fim de cada task.** `lint` é `biome check .` e cobre `public/` também.
- **Commits em inglês, no imperativo**, seguindo o histórico do repo (`feat(ui): ...`, `refactor(ui): ...`).

## Divergências deliberadas em relação ao Figma

Registradas aqui uma vez para não serem re-litigadas em cada task:

1. **A lista de Registrar mantém a coluna de ações.** O frame `Registrar — Desktop` (4:3) mostra cinco colunas e nenhum botão. Editar e excluir existem hoje; removê-los seria perda de capacidade, que a spec §4 do design proíbe. A coluna fica, discreta, à direita.
2. **A barra de filtros continua.** O frame não mostra mês, filtros, busca nem Exportar CSV. São capacidades existentes e a spec não pede a remoção. Ficam abaixo do card de lançamento rápido.
3. **`até jun/2027` no frame `Compromissos futuros` (11:48) é ilustrativo.** Com `first_month = '2026-06'` e `total_count = 10`, o último mês é `2027-03` — que é o exemplo trabalhado no próprio design (§B.6). A aritmética vale mais que o rótulo desenhado.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `public/js/chrome.js` | *(modificado)* Navegação: três itens, cabeçalho desktop, cabeçalho mobile, barra inferior. Perde o toggle de tema. |
| `public/registrar.html` | *(renomeado de `transactions.html`)* Registrar. |
| `public/js/registrar.js` | *(renomeado de `transactions.js`)* Wiring de Registrar: lista, filtros, paginação, submit da linha rápida. |
| `public/js/quickentry.js` | *(novo)* Funções puras da linha de entrada rápida: render, resolução de referência por nome, dica de criação. |
| `public/analise.html` | *(renomeado de `bi.html`)* Análise. |
| `public/js/analise.js` | *(renomeado de `bi.js`)* Wiring de Análise. |
| `public/js/commitments.js` | *(novo)* Funções puras do painel de compromissos: último mês de um parcelamento, modelo, render. |
| `public/js/dashboard.js` | *(modificado)* Carrega e monta o painel de compromissos. |
| `public/index.html` | *(modificado)* Ganha o contêiner `#commitments`. |
| `public/js/format.js` | *(modificado)* Ganha `parseReais`, `shortDate`, `monthShort`. |
| `public/js/settings.js` | *(modificado)* Ganha `applyTheme` e o wiring do seletor de tema. |
| `public/settings.html` | *(modificado)* Ganha a seção `Aparência`. |
| `src/app.ts` | *(modificado)* Dois redirects `301`. |

---

## Task 1: Renomear as páginas e adicionar os redirects

Primeiro porque tudo depois referencia os nomes novos. A navegação ainda tem sete itens ao fim desta task — só os `href` mudam.

**Files:**
- Rename: `public/transactions.html` → `public/registrar.html`
- Rename: `public/js/transactions.js` → `public/js/registrar.js`
- Rename: `public/bi.html` → `public/analise.html`
- Rename: `public/js/bi.js` → `public/js/analise.js`
- Rename: `test/transactionsRender.test.ts` → `test/registrarRender.test.ts`
- Modify: `src/app.ts:33` (redirects antes do `express.static`)
- Modify: `public/js/chrome.js:3,7` (hrefs e rotas)
- Modify: `test/escaping.test.ts:42`, `test/chrome.test.ts:8,17`
- Test: `test/app.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: as rotas `/registrar.html` e `/analise.html` servidas estaticamente; `/transactions.html` e `/bi.html` respondendo `301` com `Location` para elas. `public/js/registrar.js` continua exportando `renderRows(rows, refs)` com a mesma assinatura de hoje.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao fim de `test/app.test.ts`:

```js
test('v0.3 redirects the old page names to the verbs', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);

  const t = await request(app).get('/transactions.html').expect(301);
  assert.equal(t.headers.location, '/registrar.html');

  const b = await request(app).get('/bi.html').expect(301);
  assert.equal(b.headers.location, '/analise.html');

  await request(app).get('/registrar.html').expect(200);
  await request(app).get('/analise.html').expect(200);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- --test-name-pattern="redirects the old page names"`
Expected: FAIL — `/transactions.html` responde 200 (o arquivo estático ainda existe), não 301.

- [ ] **Step 3: Renomear os quatro arquivos preservando o histórico**

```bash
git mv public/transactions.html public/registrar.html
git mv public/js/transactions.js public/js/registrar.js
git mv public/bi.html public/analise.html
git mv public/js/bi.js public/js/analise.js
git mv test/transactionsRender.test.ts test/registrarRender.test.ts
```

- [ ] **Step 4: Apontar cada página para o seu script**

Em `public/registrar.html`, a última linha de `<body>`:

```html
  <script type="module" src="/js/registrar.js"></script>
```

Em `public/analise.html`, idem:

```html
  <script type="module" src="/js/analise.js"></script>
```

E os títulos das duas páginas, no `<head>`, adotam o vocabulário do §5:

```html
  <title>Gastando — Registrar</title>
```

```html
  <title>Gastando — Análise</title>
```

- [ ] **Step 5: Atualizar as rotas passadas a `mountChrome`**

Em `public/js/registrar.js`, dentro do bloco de wiring no fim do arquivo:

```js
  mountChrome('/registrar.html');
```

Em `public/js/analise.js`:

```js
  mountChrome('/analise.html');
```

- [ ] **Step 6: Atualizar os `href` da navegação**

Em `public/js/chrome.js`, as linhas 3 e 7 de `NAV_ITEMS`:

```js
  { href: '/registrar.html', label: 'Transações', route: '/registrar.html' },
```

```js
  { href: '/analise.html', label: 'BI', route: '/analise.html' },
```

Os rótulos ainda são os antigos — a Task 2 cuida deles.

- [ ] **Step 7: Atualizar os imports dos testes**

Em `test/registrarRender.test.ts`, as três ocorrências (linhas 26, 42, 50):

```js
  const { renderRows } = await import('../public/js/registrar.js');
```

Em `test/escaping.test.ts:42`:

```js
  const { renderRows } = await import('../public/js/registrar.js');
```

Em `test/chrome.test.ts`, linhas 8 e 17:

```js
  const html = renderNav('/registrar.html');
```

```js
  assert.match(html, /href="\/registrar.html"[^>]*class="[^"]*active/);
```

- [ ] **Step 8: Adicionar os redirects**

Em `src/app.ts`, entre o último `app.use('/api/...')` e o `express.static` — a ordem importa, porque depois do `static` o arquivo já teria sido servido:

```ts
  // Os nomes antigos continuam funcionando: favoritos e links salvos não quebram
  // quando o vocabulário do §5 chega às URLs.
  app.get('/transactions.html', (_req, res) => res.redirect(301, '/registrar.html'));
  app.get('/bi.html', (_req, res) => res.redirect(301, '/analise.html'));

  app.use(express.static(path.join(__dirname, '..', 'public')));
```

- [ ] **Step 9: Rodar o teste**

Run: `npm test -- --test-name-pattern="redirects the old page names"`
Expected: PASS

- [ ] **Step 10: Rodar a suíte inteira e o grep da Definition of Done**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tudo verde.

Run: `grep -rn "transactions\.html\|bi\.html" public/ src/ test/`
Expected: só as duas linhas dos redirects em `src/app.ts` e a linha do teste de redirect em `test/app.test.ts`.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor(ui): rename the pages to registrar and analise with 301s"
```

---

## Task 2: A navegação vira três verbos

**Files:**
- Modify: `public/js/chrome.js` (todo o arquivo)
- Test: `test/chrome.test.ts`

**Interfaces:**
- Consumes: as rotas `/registrar.html` e `/analise.html` da Task 1.
- Produces: `NAV_ITEMS` com três entradas, cada uma `{ href, label, route, icon }`; `renderNav(active)` devolvendo cabeçalho desktop + cabeçalho mobile + `bottom-nav`; `mountChrome(active)` inalterado na assinatura. **O toggle de tema continua no cabeçalho ao fim desta task** — tirá-lo aqui deixaria uma task inteira sem como trocar de tema. Sai na Task 3, junto com a opção que o substitui.

- [ ] **Step 1: Escrever o teste que falha**

Substituir o teste `renderNav` em `test/chrome.test.ts` (mantendo o teste `chrome no longer ships an onboarding guard` como está):

```js
test('renderNav ships the three verbs of the loop', async () => {
  const { renderNav, NAV_ITEMS } = await import('../public/js/chrome.js');
  assert.equal(NAV_ITEMS.length, 3);
  assert.deepEqual(
    NAV_ITEMS.map((i) => i.label),
    ['Registrar', 'Acompanhar', 'Decidir'],
  );

  const html = renderNav('/registrar.html');
  for (const item of NAV_ITEMS) assert.ok(html.includes(item.label), `missing ${item.label}`);
  assert.match(html, /Gastando/);
  assert.match(html, /<header/);
  assert.match(html, /bottom-nav/);
  // a engrenagem leva a Configurações, que saiu da navegação
  assert.match(html, /href="\/settings.html"[^>]*aria-label="Configurações"/);
  // o toggle de tema ainda está aqui — só sai na Task 3
  assert.match(html, /id="theme-toggle"/);
});

test('renderNav marks the active route on every entry', async () => {
  const { renderNav, NAV_ITEMS } = await import('../public/js/chrome.js');
  for (const item of NAV_ITEMS) {
    const html = renderNav(item.route);
    const escaped = item.route.replace(/\//g, '\\/');
    assert.match(
      html,
      new RegExp(`href="${escaped}"[^>]*class="[^"]*active`),
      `route ${item.route} not marked active`,
    );
  }
});

test('renderNav drops the screens that stopped being destinations', async () => {
  const { renderNav } = await import('../public/js/chrome.js');
  const html = renderNav('/');
  for (const gone of ['Parcelas', 'Recorrentes', 'Simular', 'Dashboard', 'Transações', '>BI<']) {
    assert.ok(!html.includes(gone), `nav still shows ${gone}`);
  }
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- --test-name-pattern="renderNav"`
Expected: FAIL — `NAV_ITEMS.length` é 7, não 3.

- [ ] **Step 3: Reescrever `chrome.js`**

Substituir o topo do arquivo (de `export const NAV_ITEMS` até o fim de `renderNav`) por:

```js
// Ícones da barra inferior (Figma `Nav/Bottom`, 21:7): traço fino, `currentColor`,
// para herdarem o sage do estado ativo sem CSS extra.
const ICONS = {
  plus: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  chart:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M5 20V10M12 20V4M19 20v-6"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13l5 5L20 7"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/></svg>',
};

// O loop da v0.3 (§3). `Decidir` aponta para `settings.html` enquanto a Fatia 3
// não existe: é lá que hoje se define renda, custos fixos e limites — os passos
// 3 e 4 do roteiro da revisão. A nav não muda de forma duas vezes.
export const NAV_ITEMS = [
  { href: '/registrar.html', label: 'Registrar', route: '/registrar.html', icon: ICONS.plus },
  { href: '/', label: 'Acompanhar', route: '/', icon: ICONS.chart },
  { href: '/settings.html', label: 'Decidir', route: '/settings.html', icon: ICONS.check },
];

const gearLink = (extra) =>
  `<a href="/settings.html" aria-label="Configurações" class="${extra} text-ink-mut hover:text-sage">${ICONS.gear}</a>`;

// Ponte de uma task: o toggle sai do cabeçalho na Task 3, quando Configurações
// ganha a opção que o substitui. Removê-lo antes disso deixaria o app sem
// nenhuma forma de trocar de tema.
const themeToggle = `<button id="theme-toggle" type="button" aria-label="Alternar tema"
          class="text-ink-mut hover:text-sage text-lg leading-none">◐</button>`;

export function renderNav(active) {
  const topLinks = NAV_ITEMS.map(
    (i) =>
      `<a href="${i.href}" class="px-1 ${i.route === active ? 'text-sage active font-semibold' : 'text-ink-mut'}">${i.label}</a>`,
  ).join('');
  const bottomLinks = NAV_ITEMS.map(
    (i) =>
      `<a href="${i.href}" class="${i.route === active ? 'active' : ''}">${i.icon}<span>${i.label}</span></a>`,
  ).join('');
  return `
    <header class="hidden md:flex items-center max-w-5xl mx-auto px-6 py-5">
      <a href="/" class="font-display text-2xl text-ink">Gastando</a>
      <nav class="ml-auto flex items-center gap-6 text-sm">${topLinks}</nav>
      <span class="ml-6">${themeToggle}</span>
      ${gearLink('ml-4')}
      <div id="nav-actions"></div>
    </header>
    <header class="flex md:hidden items-center px-5 py-4 border-b border-line">
      <a href="/" class="font-display text-xl text-ink">Gastando</a>
      ${gearLink('ml-auto')}
    </header>
    <nav class="bottom-nav">${bottomLinks}</nav>`;
}
```

`mountChrome` fica exatamente como está — o toggle de tema sai na Task 3.

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- --test-name-pattern="renderNav"`
Expected: PASS nos três.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test && npm run typecheck && npm run lint`
Expected: verde. Se algum teste ainda esperar sete itens ou o rótulo `Dashboard`, corrigir a expectativa — o comportamento novo é o certo.

- [ ] **Step 6: Commit**

```bash
git add public/js/chrome.js test/chrome.test.ts
git commit -m "feat(ui): the nav becomes Registrar, Acompanhar and Decidir"
```

---

## Task 3: O tema sai do cabeçalho e vira opção em Configurações

O frame `Nav/Top` (3:11) não tem botão de tema, e a spec §3 lista "tema" entre as responsabilidades de Configurações. As duas metades andam juntas: tirar o toggle sem pôr a opção seria perda de capacidade.

**Files:**
- Modify: `public/js/chrome.js` (`mountChrome`)
- Modify: `public/settings.html` (nova seção)
- Modify: `public/js/settings.js` (`applyTheme` + wiring)
- Test: `test/theme.test.ts`

**Interfaces:**
- Consumes: `renderNav` da Task 2.
- Produces: `applyTheme(next, doc, storage)` exportada de `public/js/settings.js` — recebe documento e storage por parâmetro justamente para ser testável sem DOM; devolve o tema aplicado.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao fim de `test/theme.test.ts`:

```js
test('applyTheme writes the attribute and persists the choice', async () => {
  const { applyTheme } = await import('../public/js/settings.js');
  const attrs = {};
  const doc = { documentElement: { setAttribute: (k, v) => (attrs[k] = v) } };
  const saved = {};
  const storage = { setItem: (k, v) => (saved[k] = v) };

  assert.equal(applyTheme('dark', doc, storage), 'dark');
  assert.equal(attrs['data-theme'], 'dark');
  assert.equal(saved.theme, 'dark');
});

test('applyTheme survives a storage that throws (private mode)', async () => {
  const { applyTheme } = await import('../public/js/settings.js');
  const attrs = {};
  const doc = { documentElement: { setAttribute: (k, v) => (attrs[k] = v) } };
  const storage = {
    setItem() {
      throw new Error('denied');
    },
  };

  assert.equal(applyTheme('light', doc, storage), 'light');
  assert.equal(attrs['data-theme'], 'light');
});

test('chrome no longer owns the theme toggle', async () => {
  const { renderNav } = await import('../public/js/chrome.js');
  assert.doesNotMatch(renderNav('/'), /theme-toggle/);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- --test-name-pattern="applyTheme|theme toggle"`
Expected: FAIL — `applyTheme` é `undefined`.

- [ ] **Step 3: Tirar o toggle de `chrome.js`**

Três remoções no mesmo arquivo. Apagar a constante `themeToggle` inteira (a ponte da Task 2, com o comentário acima dela), e apagar a linha que a interpola no cabeçalho desktop, devolvendo a engrenagem à margem original:

```js
      <nav class="ml-auto flex items-center gap-6 text-sm">${topLinks}</nav>
      ${gearLink('ml-6')}
      <div id="nav-actions"></div>
```

E substituir `mountChrome` inteira por:

```js
export function mountChrome(active) {
  const el = document.getElementById('nav');
  if (el) el.innerHTML = renderNav(active);
}
```

- [ ] **Step 4: Adicionar a seção em `settings.html`**

Antes do `</main>`, depois da seção `Cartões`:

```html
    <section class="paper-card">
      <h2 class="font-display text-xl mb-4">Aparência</h2>
      <label class="field max-w-xs"><span>Tema</span>
        <select id="theme">
          <option value="light">Claro</option>
          <option value="dark">Escuro</option>
        </select>
      </label>
    </section>
```

- [ ] **Step 5: Implementar `applyTheme` e o wiring**

Em `public/js/settings.js`, logo depois dos imports e antes de `const $ = ...`:

```js
// Documento e storage entram por parâmetro: uma função que alcança `document`
// por dentro não teria como ser testada sem DOM.
export function applyTheme(next, doc, storage) {
  doc.documentElement.setAttribute('data-theme', next);
  try {
    storage.setItem('theme', next);
  } catch {
    /* modo privado — ignorar */
  }
  return next;
}
```

E dentro do bloco de wiring no fim do arquivo, junto dos outros `addEventListener`:

```js
  const themeSel = $('theme');
  if (themeSel) {
    themeSel.value =
      document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    themeSel.addEventListener('change', () => {
      const next = applyTheme(themeSel.value, document, localStorage);
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
    });
  }
```

O evento `themechange` continua sendo disparado porque `analise.js` redesenha os gráficos ao ouvi-lo.

- [ ] **Step 6: Rodar os testes**

Run: `npm test -- --test-name-pattern="applyTheme|theme toggle"`
Expected: PASS nos três.

O teste da Task 2 que afirmava `id="theme-toggle"` agora falha — é o comportamento novo que está certo. Apagar essa asserção de `test/chrome.test.ts`:

```js
  // o toggle de tema ainda está aqui — só sai na Task 3
  assert.match(html, /id="theme-toggle"/);
```

- [ ] **Step 7: Rodar a suíte inteira**

Run: `npm test && npm run typecheck && npm run lint`
Expected: verde.

- [ ] **Step 8: Commit**

```bash
git add public/js/chrome.js public/js/settings.js public/settings.html test/theme.test.ts
git commit -m "feat(ui): the theme choice moves from the header into Configurações"
```

---

## Task 4: Helpers de formato para a linha rápida e o painel

Três funções puras que as Tasks 5 a 8 consomem. Pequenas, mas com armadilhas próprias — `parseReais` é a que aceita o que a pessoa realmente digita.

**Files:**
- Modify: `public/js/format.js`
- Test: `test/format.test.ts` (criar)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `parseReais(input) → number` — centavos inteiros; `NaN` quando não dá para ler.
  - `shortDate(iso) → string` — `'2026-08-06' → '06/08'`.
  - `monthShort(ym) → string` — `'2027-03' → 'mar/2027'`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/format.test.ts`:

```js
const { test } = require('node:test');
const assert = require('node:assert');

test('parseReais accepts what a Brazilian actually types', async () => {
  const { parseReais } = await import('../public/js/format.js');
  assert.equal(parseReais('248,90'), 24890);
  assert.equal(parseReais('248.90'), 24890);
  assert.equal(parseReais('R$ 248,90'), 24890);
  assert.equal(parseReais('1.248,90'), 124890);
  assert.equal(parseReais('  1.248,90  '), 124890);
  assert.equal(parseReais('50'), 5000);
  assert.equal(parseReais(248.9), 24890);
});

test('parseReais rejects what is not a number', async () => {
  const { parseReais } = await import('../public/js/format.js');
  assert.ok(Number.isNaN(parseReais('')));
  assert.ok(Number.isNaN(parseReais('abc')));
  assert.ok(Number.isNaN(parseReais(null)));
  assert.ok(Number.isNaN(parseReais(undefined)));
});

test('parseReais rounds to the nearest cent', async () => {
  const { parseReais } = await import('../public/js/format.js');
  assert.equal(parseReais('0,015'), 2);
  assert.equal(parseReais('10,999'), 1100);
});

test('shortDate shows day and month', async () => {
  const { shortDate } = await import('../public/js/format.js');
  assert.equal(shortDate('2026-08-06'), '06/08');
  assert.equal(shortDate('2026-12-31'), '31/12');
  assert.equal(shortDate(''), '');
});

test('monthShort names the month in pt-BR', async () => {
  const { monthShort } = await import('../public/js/format.js');
  assert.equal(monthShort('2027-03'), 'mar/2027');
  assert.equal(monthShort('2026-06'), 'jun/2026');
  assert.equal(monthShort('2026-01'), 'jan/2026');
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- --test-name-pattern="parseReais|shortDate|monthShort"`
Expected: FAIL — `parseReais is not a function`.

- [ ] **Step 3: Implementar em `format.js`**

Acrescentar ao fim de `public/js/format.js`:

```js
// A linha rápida usa `type="text"`, não `type="number"`: o campo mostra
// `R$ 248,90` em mono, como no Figma, e a pessoa digita com vírgula. Aceitar só
// `Number()` transformaria o caso comum brasileiro em NaN.
export function parseReais(input) {
  if (input === null || input === undefined) return Number.NaN;
  if (typeof input === 'number') return Math.round(input * 100);
  const cleaned = String(input)
    .replace(/[R$\s ]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '') // separador de milhar
    .replace(',', '.');
  if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) return Number.NaN;
  return Math.round(Number(cleaned) * 100);
}

const MONTHS_SHORT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

// `'2026-08-06' → '06/08'`, como as linhas da lista no Figma (6:32).
export function shortDate(iso) {
  const [, m, d] = String(iso ?? '').split('-');
  return m && d ? `${d}/${m}` : '';
}

// `'2027-03' → 'mar/2027'`, para o "até <mês>" dos compromissos.
export function monthShort(ym) {
  const [y, m] = String(ym ?? '').split('-');
  const name = MONTHS_SHORT[Number(m) - 1];
  return name ? `${name}/${y}` : '';
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- --test-name-pattern="parseReais|shortDate|monthShort"`
Expected: PASS nos cinco.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test && npm run typecheck && npm run lint`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add public/js/format.js test/format.test.ts
git commit -m "feat(ui): add parseReais, shortDate and monthShort to format"
```

---

## Task 5: `quickentry.js` — as funções puras da linha rápida

Sem DOM, sem `fetch`. Só o HTML da linha e as duas decisões que ela toma: este nome já existe, ou vai ser criado?

**Files:**
- Create: `public/js/quickentry.js`
- Test: `test/quickentry.test.ts` (criar)

**Interfaces:**
- Consumes: `esc` de `format.js`.
- Produces:
  - `resolveRef(name, items) → { id } | { create } | null` — `items` é `[{ id, name, active }]`. `null` quando o campo está vazio; `{ id }` quando casa por nome, ignorando caixa e espaços em volta; `{ create: <nome digitado> }` quando não casa.
  - `entryHint(name, items, kind) → string` — `''` ou `↵ cria a categoria X` / `↵ cria o cartão X`. `kind` é `'category'` ou `'card'`.
  - `renderEntryRow(cats, cards, sticky) → string` — HTML da linha; `sticky = { date, card }`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/quickentry.test.ts`:

```js
const { test } = require('node:test');
const assert = require('node:assert');

const cats = [
  { id: 1, name: 'Mercado', active: 1 },
  { id: 2, name: 'Restaurantes & Delivery', active: 1 },
  { id: 3, name: 'Antiga', active: 0 },
];
const cards = [
  { id: 5, name: 'Nubank', active: 1 },
  { id: 6, name: 'Itaú', active: 1 },
];

test('resolveRef matches an existing name regardless of case and padding', async () => {
  const { resolveRef } = await import('../public/js/quickentry.js');
  assert.deepEqual(resolveRef('Mercado', cats), { id: 1 });
  assert.deepEqual(resolveRef('mercado', cats), { id: 1 });
  assert.deepEqual(resolveRef('  MERCADO  ', cats), { id: 1 });
  assert.deepEqual(resolveRef('Nubank', cards), { id: 5 });
});

test('resolveRef asks for creation when the name is new', async () => {
  const { resolveRef } = await import('../public/js/quickentry.js');
  assert.deepEqual(resolveRef('Farmácia', cats), { create: 'Farmácia' });
  assert.deepEqual(resolveRef('  Farmácia  ', cats), { create: 'Farmácia' });
});

test('resolveRef returns null for an empty field', async () => {
  const { resolveRef } = await import('../public/js/quickentry.js');
  assert.equal(resolveRef('', cats), null);
  assert.equal(resolveRef('   ', cats), null);
  assert.equal(resolveRef(undefined, cats), null);
});

test('entryHint announces the creation before the submit', async () => {
  const { entryHint } = await import('../public/js/quickentry.js');
  assert.equal(entryHint('Farmácia', cats, 'category'), '↵ cria a categoria Farmácia');
  assert.equal(entryHint('Inter', cards, 'card'), '↵ cria o cartão Inter');
});

test('entryHint stays quiet when there is nothing to create', async () => {
  const { entryHint } = await import('../public/js/quickentry.js');
  assert.equal(entryHint('Mercado', cats, 'category'), '');
  assert.equal(entryHint('', cats, 'category'), '');
});

test('entryHint escapes the typed name', async () => {
  const { entryHint } = await import('../public/js/quickentry.js');
  assert.match(entryHint('<script>', cats, 'category'), /&lt;script&gt;/);
  assert.doesNotMatch(entryHint('<script>', cats, 'category'), /<script>/);
});

test('renderEntryRow lays out the five fields in the Figma order', async () => {
  const { renderEntryRow } = await import('../public/js/quickentry.js');
  const html = renderEntryRow(cats, cards, { date: '2026-08-06', card: 'Nubank' });
  const order = ['q-date', 'q-desc', 'q-cat', 'q-card', 'q-amount'].map((id) =>
    html.indexOf(`id="${id}"`),
  );
  for (const i of order) assert.ok(i > -1, 'a field is missing');
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'fields are out of order');
});

test('renderEntryRow keeps date and card sticky between entries', async () => {
  const { renderEntryRow } = await import('../public/js/quickentry.js');
  const html = renderEntryRow(cats, cards, { date: '2026-08-06', card: 'Nubank' });
  assert.match(html, /id="q-date"[^>]*value="2026-08-06"/);
  assert.match(html, /id="q-card"[^>]*value="Nubank"/);
});

test('renderEntryRow offers only active names for autocomplete', async () => {
  const { renderEntryRow } = await import('../public/js/quickentry.js');
  const html = renderEntryRow(cats, cards, { date: '', card: '' });
  assert.match(html, /<datalist id="cat-list">/);
  assert.match(html, /<datalist id="card-list">/);
  assert.match(html, /value="Mercado"/);
  assert.match(html, /value="Itaú"/);
  assert.doesNotMatch(html, /value="Antiga"/); // inativa
});

test('renderEntryRow uses native datalist, not a custom combobox', async () => {
  const { renderEntryRow } = await import('../public/js/quickentry.js');
  const html = renderEntryRow(cats, cards, { date: '', card: '' });
  assert.match(html, /id="q-cat"[^>]*list="cat-list"/);
  assert.match(html, /id="q-card"[^>]*list="card-list"/);
  assert.doesNotMatch(html, /<select/);
});

test('renderEntryRow has a hint slot under each creatable field', async () => {
  const { renderEntryRow } = await import('../public/js/quickentry.js');
  const html = renderEntryRow(cats, cards, { date: '', card: '' });
  assert.match(html, /id="q-cat-hint"/);
  assert.match(html, /id="q-card-hint"/);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- --test-name-pattern="resolveRef|entryHint|renderEntryRow"`
Expected: FAIL — `Cannot find module '../public/js/quickentry.js'`.

- [ ] **Step 3: Implementar `quickentry.js`**

Criar `public/js/quickentry.js`:

```js
import { esc } from './format.js';

// Categoria e cartão são `<input list>` + `<datalist>`: o autocomplete é o nativo
// do browser, então Tab e Enter funcionam sem código de gerência de foco e não há
// widget próprio com ARIA e navegação por setas para manter (design §B.3).
const NOUN = {
  category: { article: 'a', word: 'categoria' },
  card: { article: 'o', word: 'cartão' },
};

export function resolveRef(name, items) {
  const typed = String(name ?? '').trim();
  if (!typed) return null;
  const hit = items.find((i) => i.name.toLowerCase() === typed.toLowerCase());
  return hit ? { id: hit.id } : { create: typed };
}

export function entryHint(name, items, kind) {
  const ref = resolveRef(name, items);
  if (!ref || ref.create === undefined) return '';
  const { article, word } = NOUN[kind];
  return `↵ cria ${article} ${word} ${esc(ref.create)}`;
}

const options = (items) =>
  items
    .filter((i) => i.active)
    .map((i) => `<option value="${esc(i.name)}"></option>`)
    .join('');

export function renderEntryRow(cats, cards, sticky) {
  const date = esc(sticky?.date ?? '');
  const card = esc(sticky?.card ?? '');
  return `
    <div class="flex flex-wrap items-end gap-3">
      <label class="field w-32"><span>Data</span>
        <input type="date" id="q-date" value="${date}" required /></label>
      <label class="field flex-1 min-w-[14rem]"><span>Descrição</span>
        <input type="text" id="q-desc" autocomplete="off" required /></label>
      <label class="field w-44"><span>Categoria</span>
        <input type="text" id="q-cat" list="cat-list" autocomplete="off" required /></label>
      <label class="field w-40"><span>Cartão</span>
        <input type="text" id="q-card" list="card-list" autocomplete="off" value="${card}" required /></label>
      <label class="field w-36"><span>Valor</span>
        <input type="text" id="q-amount" inputmode="decimal" class="font-mono" required /></label>
      <button type="submit" id="q-submit" class="btn-primary">Adicionar</button>
    </div>
    <div class="flex flex-wrap gap-6 text-xs text-clay mt-2 min-h-[1rem]">
      <span id="q-cat-hint"></span>
      <span id="q-card-hint"></span>
    </div>
    <datalist id="cat-list">${options(cats)}</datalist>
    <datalist id="card-list">${options(cards)}</datalist>`;
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- --test-name-pattern="resolveRef|entryHint|renderEntryRow"`
Expected: PASS nos onze.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test && npm run typecheck && npm run lint`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add public/js/quickentry.js test/quickentry.test.ts
git commit -m "feat(ui): add the quick entry row primitives"
```

---

## Task 6: Registrar passa a usar a linha rápida

A task mais crítica do redesign: sem import de CSV e sem mobile, é o único caminho de entrada de dados.

**Files:**
- Modify: `public/registrar.html` (cabeçalho, card de lançamento, tabela)
- Modify: `public/js/registrar.js` (praticamente todo o wiring; `renderRows` ganha `shortDate`)
- Test: `test/registrarRender.test.ts`

**Interfaces:**
- Consumes: `resolveRef`, `entryHint`, `renderEntryRow` da Task 5; `parseReais`, `shortDate` da Task 4.
- Produces: `renderRows(rows, refs)` inalterada na assinatura, agora formatando a data como `dd/MM`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao fim de `test/registrarRender.test.ts`:

```js
test('renderRows shows the date as day/month', async () => {
  const { renderRows } = await import('../public/js/registrar.js');
  const html = renderRows([
    {
      id: 1,
      date: '2026-08-06',
      description: 'Assaí Atacadista',
      category_id: 1,
      card_id: 5,
      amount_cents: 24890,
    },
  ]);
  assert.match(html, />06\/08</);
  assert.doesNotMatch(html, /2026-08-06/);
});

test('renderRows keeps edit and delete affordances', async () => {
  const { renderRows } = await import('../public/js/registrar.js');
  const html = renderRows([
    { id: 42, date: '2026-08-06', description: 'x', amount_cents: 100, installment_group_id: null },
  ]);
  assert.match(html, /data-edit="42"/);
  assert.match(html, /data-del="42"/);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- --test-name-pattern="date as day/month"`
Expected: FAIL — a célula ainda traz `2026-08-06`.

- [ ] **Step 3: Reescrever o cabeçalho e o card de lançamento em `registrar.html`**

Substituir tudo entre `<main ...>` e `<div class="paper-card overflow-x-auto">` por:

```html
  <main class="max-w-5xl mx-auto px-6 pt-2">
    <div class="mb-6">
      <h1 class="font-display text-3xl text-ink">Registrar</h1>
      <p class="text-ink-mut mt-1">Lance os gastos da semana. Enter salva e mantém o foco no próximo.</p>
    </div>

    <form id="form" class="paper-card mb-6">
      <div class="label-caps text-ink-mut mb-3">LANÇAMENTO RÁPIDO</div>
      <div id="entryRow"></div>
      <div class="border-t border-line mt-4 pt-3 flex flex-wrap gap-6 text-sm">
        <button type="button" id="toggleInstallment" class="text-ink-mut hover:text-sage">+ dividir em N vezes</button>
        <button type="button" id="toggleRecurring" class="text-ink-mut hover:text-sage">+ repete todo mês</button>
        <button type="button" id="cancelEdit" class="text-clay ml-auto" style="display:none">Cancelar edição</button>
      </div>
      <div id="installmentFields" class="flex flex-wrap gap-3 mt-3" style="display:none">
        <label class="field w-32"><span># parcelas</span><input type="number" id="count" min="2" /></label>
        <label class="field w-40"><span>Primeiro mês</span><input type="month" id="firstMonth" /></label>
      </div>
      <div id="recurringFields" class="flex flex-wrap gap-3 mt-3" style="display:none">
        <label class="field w-32"><span>Dia do mês</span><input type="number" id="dayOfMonth" min="1" max="31" /></label>
      </div>
    </form>

    <div class="flex flex-wrap items-center gap-3 mb-4">
      <input type="month" id="month" class="rounded border border-line bg-card px-3 py-2" />
      <select id="filterCategory" class="rounded border border-line bg-card px-3 py-2"><option value="">Todas as categorias</option></select>
      <select id="filterCard" class="rounded border border-line bg-card px-3 py-2"><option value="">Todos os cartões</option></select>
      <input id="search" type="search" placeholder="Buscar descrição" class="rounded border border-line bg-card px-3 py-2" />
      <a id="exportCsv" class="btn-ghost text-sm ml-auto">Exportar CSV</a>
    </div>
```

O `<div class="paper-card overflow-x-auto">` com a tabela e o pager fica exatamente como está. Remover também o `<button id="fab">` antes de `</body>` — a linha rápida está sempre visível no topo, então não há mais para onde rolar.

- [ ] **Step 4: Reescrever `registrar.js`**

Substituir o conteúdo inteiro de `public/js/registrar.js` por:

```js
import { api, getPage, showError } from './api.js';
import { mountChrome } from './chrome.js';
import { currentMonth, esc, formatBRL, parseReais, shortDate } from './format.js';
import { entryHint, renderEntryRow, resolveRef } from './quickentry.js';

const $ = (id) => document.getElementById(id);
let editingId = null;
let page = 1;
const lookups = { cats: new Map(), cards: new Map() };
// Data e cartão persistem entre lançamentos: o caso comum é lançar vários gastos
// do mesmo cartão, no mesmo dia (spec §7).
const sticky = { date: new Date().toISOString().slice(0, 10), card: '' };
const state = { cats: [], cards: [] };

export function renderRows(rows, refs = { cats: new Map(), cards: new Map() }) {
  return rows
    .map((r) => {
      const cardName = refs.cards.get(r.card_id) ?? '';
      return `
    <tr class="border-b border-line">
      <td class="py-3 font-mono text-sm text-ink-mut">${shortDate(r.date)}</td>
      <td class="py-3">${esc(r.description)}
        ${r.installment_no ? `<span class="tag tag-gold ml-2">${r.installment_no}/${r.installment_total}</span>` : ''}</td>
      <td class="py-3 text-sm">${esc(refs.cats.get(r.category_id)?.name ?? '')}</td>
      <td class="py-3 text-sm text-ink-mut">${esc(cardName)}</td>
      <td class="py-3 text-right font-mono">${formatBRL(r.amount_cents)}</td>
      <td class="py-3 text-right">
        <button data-edit="${r.id}" class="text-sage text-sm mr-2">Editar</button>
        <button data-del="${r.id}" data-group="${r.installment_group_id || ''}" class="text-clay text-sm">Excluir</button>
      </td>
    </tr>`;
    })
    .join('');
}

function mountEntryRow() {
  $('entryRow').innerHTML = renderEntryRow(state.cats, state.cards, sticky);
  $('q-cat').addEventListener('input', () => {
    $('q-cat-hint').textContent = entryHint($('q-cat').value, state.cats, 'category');
  });
  $('q-card').addEventListener('input', () => {
    $('q-card-hint').textContent = entryHint($('q-card').value, state.cards, 'card');
  });
}

async function loadSelectors() {
  const [cats, cards] = await Promise.all([api.get('/api/categories'), api.get('/api/cards')]);
  state.cats = cats;
  state.cards = cards;
  lookups.cats = new Map(cats.map((c) => [c.id, { name: c.name }]));
  lookups.cards = new Map(cards.map((c) => [c.id, c.name]));
  mountEntryRow();
  const opt = (c) => `<option value="${c.id}">${esc(c.name)}</option>`;
  const active = (list) => list.filter((c) => c.active).map(opt).join('');
  $('filterCategory').innerHTML = `<option value="">Todas as categorias</option>${active(cats)}`;
  $('filterCard').innerHTML = `<option value="">Todos os cartões</option>${active(cards)}`;
}

async function loadList() {
  try {
    const perPage = Number($('perPage').value);
    const offset = (page - 1) * perPage;
    const qs = new URLSearchParams({
      month: $('month').value,
      limit: String(perPage),
      offset: String(offset),
    });
    if ($('filterCategory').value) qs.set('category_id', $('filterCategory').value);
    if ($('filterCard').value) qs.set('card_id', $('filterCard').value);
    if ($('search').value.trim()) qs.set('q', $('search').value.trim());
    const csvQs = new URLSearchParams({ month: $('month').value });
    if ($('filterCategory').value) csvQs.set('category_id', $('filterCategory').value);
    if ($('filterCard').value) csvQs.set('card_id', $('filterCard').value);
    if ($('search').value.trim()) csvQs.set('q', $('search').value.trim());
    const exportLink = $('exportCsv');
    if (exportLink) exportLink.href = `/api/transactions/export.csv?${csvQs}`;
    const { items: rows, total } = await getPage(`/api/transactions?${qs}`);
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    if (page > totalPages) {
      page = totalPages;
      return loadList();
    }
    updatePager(total, perPage, totalPages);
    $('list').innerHTML = renderRows(rows, lookups);
    $('list')
      .querySelectorAll('button[data-edit]')
      .forEach((b) => {
        b.addEventListener('click', () =>
          startEdit(rows.find((r) => r.id === Number(b.dataset.edit))),
        );
      });
    $('list')
      .querySelectorAll('button[data-del]')
      .forEach((b) => {
        b.addEventListener('click', () =>
          onDelete(Number(b.dataset.del), Number(b.dataset.group) || null),
        );
      });
  } catch (e) {
    showError(e.message);
  }
}

function updatePager(total, perPage, totalPages) {
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  $('pageInfo').textContent = `${from}–${to} de ${total} · página ${page}/${totalPages}`;
  $('prevPage').disabled = page <= 1;
  $('nextPage').disabled = page >= totalPages;
}

function setAdvanced(which) {
  $('installmentFields').style.display = which === 'installment' ? 'flex' : 'none';
  $('recurringFields').style.display = which === 'recurring' ? 'flex' : 'none';
}

function advancedMode() {
  if ($('installmentFields').style.display === 'flex') return 'installment';
  if ($('recurringFields').style.display === 'flex') return 'recurring';
  return null;
}

function startEdit(r) {
  if (!r) return;
  editingId = r.id;
  setAdvanced(null);
  $('q-date').value = r.date;
  $('q-desc').value = r.description;
  $('q-cat').value = lookups.cats.get(r.category_id)?.name ?? '';
  $('q-card').value = lookups.cards.get(r.card_id) ?? '';
  $('q-amount').value = (r.amount_cents / 100).toFixed(2).replace('.', ',');
  $('q-submit').textContent = 'Salvar';
  $('cancelEdit').style.display = 'inline';
  $('q-desc').focus();
}

function resetForm() {
  editingId = null;
  setAdvanced(null);
  $('q-desc').value = '';
  $('q-cat').value = '';
  $('q-amount').value = '';
  $('q-cat-hint').textContent = '';
  $('q-card-hint').textContent = '';
  $('q-submit').textContent = 'Adicionar';
  $('cancelEdit').style.display = 'none';
}

async function onDelete(id, groupId) {
  try {
    if (groupId) {
      if (!confirm('Excluir todo o parcelamento (todas as parcelas)?')) return;
      await api.del(`/api/installment-groups/${groupId}`);
    } else {
      await api.del(`/api/transactions/${id}`);
    }
    if (editingId === id) resetForm();
    loadList();
  } catch (e) {
    showError(e.message);
  }
}

// Erro inline, sem modal (spec §7): a dica sob o campo vira a mensagem e o foco
// vai para lá.
function fieldError(hintId, inputId, msg) {
  $(hintId).textContent = msg;
  $(inputId).focus();
}

// Categoria e cartão que não existem são criados aqui, antes da transação — é o
// que torna o primeiro lançamento possível num banco sem nenhum cartão (§B.3).
async function ensureId(ref, endpoint) {
  if (ref.id !== undefined) return ref.id;
  const created = await api.post(endpoint, { name: ref.create });
  return created.id;
}

async function onSubmit(e) {
  e.preventDefault();
  $('q-cat-hint').textContent = '';
  $('q-card-hint').textContent = '';
  try {
    const catRef = resolveRef($('q-cat').value, state.cats);
    if (!catRef) return fieldError('q-cat-hint', 'q-cat', 'Informe uma categoria');
    const cardRef = resolveRef($('q-card').value, state.cards);
    if (!cardRef) return fieldError('q-card-hint', 'q-card', 'Informe um cartão');
    const amount = parseReais($('q-amount').value);
    if (!Number.isFinite(amount) || amount <= 0) {
      return fieldError('q-cat-hint', 'q-amount', 'Valor inválido');
    }

    const category_id = await ensureId(catRef, '/api/categories');
    const card_id = await ensureId(cardRef, '/api/cards');
    const base = { category_id, card_id, description: $('q-desc').value };
    const mode = advancedMode();

    if (editingId !== null) {
      await api.put(`/api/transactions/${editingId}`, {
        ...base,
        date: $('q-date').value,
        amount_cents: amount,
      });
    } else if (mode === 'installment') {
      await api.post('/api/transactions', {
        ...base,
        installment_total_cents: amount,
        installment_count: Number($('count').value),
        first_month: $('firstMonth').value || $('q-date').value.slice(0, 7),
      });
    } else if (mode === 'recurring') {
      await api.post('/api/recurring', {
        ...base,
        amount_cents: amount,
        day_of_month: Number($('dayOfMonth').value) || Number($('q-date').value.slice(8, 10)),
      });
    } else {
      await api.post('/api/transactions', {
        ...base,
        date: $('q-date').value,
        amount_cents: amount,
      });
    }

    // Data e cartão ficam; o resto limpa. O formulário não fecha e o foco volta
    // para a descrição — o primeiro campo que de fato se digita de novo (§B.3).
    sticky.date = $('q-date').value;
    sticky.card = $('q-card').value;
    const catCreated = catRef.create !== undefined;
    const cardCreated = cardRef.create !== undefined;
    resetForm();
    if (catCreated || cardCreated) await loadSelectors();
    $('q-desc').focus();
    await loadList();
  } catch (err) {
    showError(err.message);
  }
}

if (typeof document !== 'undefined' && document.getElementById('list')) {
  mountChrome('/registrar.html');
  $('month').value = currentMonth();
  $('toggleInstallment').addEventListener('click', () =>
    setAdvanced(advancedMode() === 'installment' ? null : 'installment'),
  );
  $('toggleRecurring').addEventListener('click', () =>
    setAdvanced(advancedMode() === 'recurring' ? null : 'recurring'),
  );
  $('month').addEventListener('change', () => {
    page = 1;
    loadList();
  });
  $('perPage').addEventListener('change', () => {
    page = 1;
    loadList();
  });
  ['filterCategory', 'filterCard'].forEach((id) => {
    $(id).addEventListener('change', () => {
      page = 1;
      loadList();
    });
  });
  $('search').addEventListener('input', () => {
    page = 1;
    loadList();
  });
  $('prevPage').addEventListener('click', () => {
    if (page > 1) {
      page--;
      loadList();
    }
  });
  $('nextPage').addEventListener('click', () => {
    page++;
    loadList();
  });
  $('form').addEventListener('submit', onSubmit);
  $('cancelEdit').addEventListener('click', resetForm);
  loadSelectors().then(loadList);
}
```

`Enter` salva sem código extra: os campos estão dentro de um `<form>` com um `<button type="submit">`, então o browser dispara o submit nativamente.

- [ ] **Step 5: Rodar os testes**

Run: `npm test -- --test-name-pattern="renderRows"`
Expected: PASS em todos, inclusive os dois novos.

- [ ] **Step 6: Rodar a suíte inteira**

Run: `npm test && npm run typecheck && npm run lint`
Expected: verde.

- [ ] **Step 7: Conferir no app de verdade**

Run: `npm start` e abrir `http://localhost:3000/registrar.html`.

Conferir, num banco recém-criado (apagar `gastando.db` antes, ou apontar `DB_PATH` para um arquivo novo):

1. Digitar descrição, uma categoria que existe, um cartão que **não** existe (o banco novo não tem nenhum), um valor com vírgula, e apertar `Enter`.
2. A dica `↵ cria o cartão <nome>` aparece sob o campo antes do submit.
3. Depois de salvar: a linha aparece na lista, data e cartão continuam preenchidos, descrição/categoria/valor limpos, foco na descrição.
4. `Tab` percorre data → descrição → categoria → cartão → valor → Adicionar.

- [ ] **Step 8: Commit**

```bash
git add public/registrar.html public/js/registrar.js test/registrarRender.test.ts
git commit -m "feat(ui): Registrar gets the keyboard-first quick entry row"
```

---

## Task 7: `commitments.js` — as funções puras do painel

**Files:**
- Create: `public/js/commitments.js`
- Test: `test/commitments.test.ts` (criar)

**Interfaces:**
- Consumes: `esc`, `formatBRL`, `monthShort` de `format.js`.
- Produces:
  - `lastMonth(firstMonth, count) → string` — `('2026-06', 10) → '2027-03'`.
  - `buildCommitments(installments, recurring) → { rows, total_cents }`, onde `rows` é `[{ kind, label, detail, monthly_cents, href }]`, parcelas antes de recorrências. `installments` é `InstallmentProgress[]` de `GET /api/installment-groups?month=`; `recurring` é `RecurringTemplate[]` de `GET /api/recurring`.
  - `renderCommitments(model) → string` — HTML do painel; `''` quando não há linha nenhuma.

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/commitments.test.ts`:

```js
const { test } = require('node:test');
const assert = require('node:assert');

const installments = [
  {
    id: 3,
    description: 'Notebook',
    total_count: 10,
    paid_count: 3,
    remaining_count: 7,
    first_month: '2026-06',
    monthly_cents: 41600,
  },
];
const recurring = [
  { id: 1, description: 'Netflix', amount_cents: 4490, day_of_month: 5, active: 1 },
  { id: 2, description: 'Seguro celular', amount_cents: 8990, day_of_month: 10, active: 1 },
  { id: 3, description: 'Cancelada', amount_cents: 9900, day_of_month: 1, active: 0 },
];

test('lastMonth is first_month plus total_count minus one', async () => {
  const { lastMonth } = await import('../public/js/commitments.js');
  assert.equal(lastMonth('2026-06', 10), '2027-03');
  assert.equal(lastMonth('2026-01', 1), '2026-01');
  assert.equal(lastMonth('2026-12', 2), '2027-01');
  assert.equal(lastMonth('2026-06', 0), '2026-06');
});

test('buildCommitments puts installments before recurring templates', async () => {
  const { buildCommitments } = await import('../public/js/commitments.js');
  const { rows } = buildCommitments(installments, recurring);
  assert.deepEqual(
    rows.map((r) => r.kind),
    ['installment', 'recurring', 'recurring'],
  );
  assert.deepEqual(
    rows.map((r) => r.label),
    ['Notebook', 'Netflix', 'Seguro celular'],
  );
});

test('buildCommitments describes each row the way the design reads it', async () => {
  const { buildCommitments } = await import('../public/js/commitments.js');
  const { rows } = buildCommitments(installments, recurring);
  assert.equal(rows[0].detail, 'parcela 3 de 10 · até mar/2027');
  assert.equal(rows[0].monthly_cents, 41600);
  assert.equal(rows[0].href, '/parcelas.html');
  assert.equal(rows[1].detail, 'repete todo mês');
  assert.equal(rows[1].href, '/recurring.html');
});

test('buildCommitments totals what is reserved every month', async () => {
  const { buildCommitments } = await import('../public/js/commitments.js');
  const { total_cents } = buildCommitments(installments, recurring);
  assert.equal(total_cents, 41600 + 4490 + 8990); // 55080
});

test('buildCommitments ignores inactive templates and finished installments', async () => {
  const { buildCommitments } = await import('../public/js/commitments.js');
  const done = [{ ...installments[0], paid_count: 10, remaining_count: 0 }];
  const { rows, total_cents } = buildCommitments(done, recurring);
  assert.deepEqual(
    rows.map((r) => r.label),
    ['Netflix', 'Seguro celular'],
  );
  assert.equal(total_cents, 4490 + 8990);
  assert.ok(!rows.some((r) => r.label === 'Cancelada'));
});

test('buildCommitments on an empty book is empty, not broken', async () => {
  const { buildCommitments } = await import('../public/js/commitments.js');
  assert.deepEqual(buildCommitments([], []), { rows: [], total_cents: 0 });
});

test('renderCommitments draws the panel with its total', async () => {
  const { buildCommitments, renderCommitments } = await import('../public/js/commitments.js');
  const html = renderCommitments(buildCommitments(installments, recurring));
  assert.match(html, /Compromissos futuros/);
  assert.match(html, /O que já está reservado antes de você gastar qualquer coisa\./);
  assert.match(html, /Notebook/);
  assert.match(html, /parcela 3 de 10 · até mar\/2027/);
  assert.match(html, /R\$ 416,00/);
  assert.match(html, /Já comprometido por mês/);
  assert.match(html, /R\$ 550,80/);
});

test('renderCommitments links each row to the screen that manages it', async () => {
  const { buildCommitments, renderCommitments } = await import('../public/js/commitments.js');
  const html = renderCommitments(buildCommitments(installments, recurring));
  assert.match(html, /href="\/parcelas.html"/);
  assert.match(html, /href="\/recurring.html"/);
});

test('renderCommitments stays silent when nothing is committed', async () => {
  const { renderCommitments } = await import('../public/js/commitments.js');
  assert.equal(renderCommitments({ rows: [], total_cents: 0 }), '');
});

test('renderCommitments escapes descriptions', async () => {
  const { buildCommitments, renderCommitments } = await import('../public/js/commitments.js');
  const html = renderCommitments(
    buildCommitments([], [{ id: 1, description: '<img src=x>', amount_cents: 100, active: 1 }]),
  );
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- --test-name-pattern="lastMonth|buildCommitments|renderCommitments"`
Expected: FAIL — `Cannot find module '../public/js/commitments.js'`.

- [ ] **Step 3: Implementar `commitments.js`**

Criar `public/js/commitments.js`:

```js
import { esc, formatBRL, monthShort } from './format.js';

// O último mês de um parcelamento é derivado, não um campo do payload: com
// `first_month` e `total_count` a conta é fechada (design §B.4).
export function lastMonth(firstMonth, count) {
  const [y, m] = String(firstMonth).split('-').map(Number);
  const total = y * 12 + (m - 1) + Math.max(0, count - 1);
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

// Montado no cliente, das duas chamadas que já existem. `GET /api/recurring`
// devolve também os templates desativados, então o filtro por `active` é aqui.
export function buildCommitments(installments, recurring) {
  const rows = [
    ...installments
      .filter((i) => i.remaining_count > 0)
      .map((i) => ({
        kind: 'installment',
        label: i.description,
        detail: `parcela ${i.paid_count} de ${i.total_count} · até ${monthShort(
          lastMonth(i.first_month, i.total_count),
        )}`,
        monthly_cents: i.monthly_cents,
        href: '/parcelas.html',
      })),
    ...recurring
      .filter((r) => r.active)
      .map((r) => ({
        kind: 'recurring',
        label: r.description,
        detail: 'repete todo mês',
        monthly_cents: r.amount_cents,
        href: '/recurring.html',
      })),
  ];
  return { rows, total_cents: rows.reduce((sum, r) => sum + r.monthly_cents, 0) };
}

// Só leitura: cada linha é um link para a tela que gerencia aquilo. `parcelas.html`
// e `recurring.html` saíram da navegação mas seguem existindo (design §B.4).
export function renderCommitments(model) {
  if (!model.rows.length) return '';
  const rows = model.rows
    .map(
      (r) => `
      <a href="${r.href}" class="flex items-baseline justify-between gap-4 py-3 border-b border-line hover:text-sage">
        <span>
          <span class="block">${esc(r.label)}</span>
          <span class="block text-sm text-ink-mut">${esc(r.detail)}</span>
        </span>
        <span class="font-mono whitespace-nowrap">${formatBRL(r.monthly_cents)} /mês</span>
      </a>`,
    )
    .join('');
  return `
    <section class="paper-card mt-8">
      <h2 class="font-display text-2xl text-ink">Compromissos futuros</h2>
      <p class="text-sm text-ink-mut mt-1 mb-2">O que já está reservado antes de você gastar qualquer coisa.</p>
      ${rows}
      <div class="flex items-baseline justify-between gap-4 pt-3">
        <span class="font-semibold">Já comprometido por mês</span>
        <span class="font-mono text-sage">${formatBRL(model.total_cents)}</span>
      </div>
    </section>`;
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- --test-name-pattern="lastMonth|buildCommitments|renderCommitments"`
Expected: PASS nos dez.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test && npm run typecheck && npm run lint`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add public/js/commitments.js test/commitments.test.ts
git commit -m "feat(ui): add the future commitments panel primitives"
```

---

## Task 8: O painel de compromissos entra no Acompanhar

**Files:**
- Modify: `public/index.html` (contêiner `#commitments`)
- Modify: `public/js/dashboard.js` (carga e montagem)
- Test: `test/dashboardRender.test.ts`

**Interfaces:**
- Consumes: `buildCommitments`, `renderCommitments` da Task 7.
- Produces: `loadCommitments(month)` interna a `dashboard.js` — nada exportado de novo.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao fim de `test/dashboardRender.test.ts`:

```js
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('Acompanhar reserves a slot for the commitments panel', () => {
  assert.match(read('public/index.html'), /id="commitments"/);
});

test('the dashboard mounts the panel instead of redrawing it', async () => {
  const src = read('public/js/dashboard.js');
  // desenhado por commitments.js, montado pelo dashboard: o render não é
  // reimplementado aqui
  assert.match(src, /from '\.\/commitments\.js'/);
  assert.match(src, /renderCommitments\(buildCommitments\(/);
  const mod = await import('../public/js/dashboard.js');
  assert.equal(mod.renderCommitments, undefined);
});

test('the commitments panel is the same in both hero states', async () => {
  const { buildCommitments, renderCommitments } = await import('../public/js/commitments.js');
  const model = buildCommitments(
    [],
    [{ id: 1, description: 'Netflix', amount_cents: 4490, active: 1 }],
  );
  // independe de `configured`: é o mesmo painel nos dois estados do §6
  assert.match(renderCommitments(model), /Compromissos futuros/);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- --test-name-pattern="commitments panel|mounts the panel"`
Expected: FAIL nos dois primeiros — `index.html` ainda não tem o contêiner e `dashboard.js` ainda não importa `commitments.js`.

- [ ] **Step 3: Adicionar o contêiner em `index.html`**

Depois de `<div id="body"></div>`:

```html
    <div id="commitments"></div>
```

- [ ] **Step 4: Importar e montar em `dashboard.js`**

No topo do arquivo, junto dos outros imports:

```js
import { buildCommitments, renderCommitments } from './commitments.js';
```

E, antes da função `load`, acrescentar:

```js
// Duas chamadas que já existem; o painel é montado no cliente (design §B.4). Um
// erro aqui não pode derrubar o Acompanhar inteiro — o painel some, o resto fica.
async function loadCommitments(month) {
  const el = document.getElementById('commitments');
  if (!el) return;
  try {
    const [installments, recurring] = await Promise.all([
      api.get(`/api/installment-groups?month=${month}`),
      api.get('/api/recurring'),
    ]);
    el.innerHTML = renderCommitments(buildCommitments(installments, recurring));
  } catch {
    el.innerHTML = '';
  }
}
```

E dentro do bloco de wiring no fim do arquivo, para que o painel acompanhe o mês escolhido:

```js
  monthEl.addEventListener('change', () => {
    load(monthEl.value);
    loadCommitments(monthEl.value);
  });
  load(monthEl.value);
  loadCommitments(monthEl.value);
```

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test && npm run typecheck && npm run lint`
Expected: verde.

- [ ] **Step 6: Conferir no app de verdade**

Run: `npm start` e abrir `http://localhost:3000/`.

1. Num banco sem parcelas nem recorrências, o painel não aparece (nem título vazio, nem card em branco).
2. Criar um parcelamento em Registrar (`+ dividir em N vezes`, 10 vezes) e uma recorrência (`+ repete todo mês`); recarregar o Acompanhar.
3. O painel aparece com a parcela primeiro, o `até <mês>` correto, e o total batendo com a soma das linhas.
4. Clicar numa linha de parcela leva a `parcelas.html`; numa de recorrência, a `recurring.html`.

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/js/dashboard.js test/dashboardRender.test.ts
git commit -m "feat(ui): Acompanhar shows what is already committed"
```

---

## Task 9: Fechamento da fatia — varredura de vocabulário e a medição obrigatória

A medição não é cerimônia: é a mitigação do risco número um da spec §15. Sem import de CSV e sem mobile, se a linha rápida não for rápida, o redesign não entrega o que promete.

**Files:**
- Modify: qualquer arquivo que a varredura apontar
- Test: a suíte inteira

**Interfaces:**
- Consumes: tudo das Tasks 1 a 8.
- Produces: nada de código novo — a fatia fechada.

- [ ] **Step 1: Varrer o vocabulário antigo**

Run:

```bash
grep -rn "Dashboard\|Transações\|>BI<\|Teto saudável\|Grupo\b" public/ --include=*.html --include=*.js
grep -rn "transactions\.html\|bi\.html" public/ src/ test/
```

Expected: nenhum rótulo de UI com o vocabulário antigo; as únicas ocorrências de `transactions.html`/`bi.html` são os redirects em `src/app.ts` e o teste deles. Corrigir o que aparecer — atenção aos `<title>` de `parcelas.html`, `recurring.html`, `simulate.html` e `category.html`, que a fatia não tocou.

- [ ] **Step 2: Conferir as páginas que saíram da navegação**

Run: `npm start` e abrir, uma a uma, `parcelas.html`, `recurring.html`, `simulate.html`, `category.html`, `settings.html`, `analise.html`.

Expected: todas carregam, todas mostram a navegação de três itens, nenhuma quebra por causa do toggle de tema removido.

- [ ] **Step 3: A medição obrigatória — 20 lançamentos cronometrados**

Num banco limpo:

```bash
rm -f /tmp/gastando-timing.db
DB_PATH=/tmp/gastando-timing.db npm start
```

Abrir `http://localhost:3000/registrar.html` e lançar **20 transações** seguidas, cronometrando do primeiro caractere digitado ao `Enter` da vigésima. Usar dados realistas: descrições curtas, umas cinco categorias diferentes, dois cartões, valores com centavos. Sem tocar no mouse.

Anotar: tempo total, tempo médio por lançamento, e qualquer ponto onde a mão precisou sair do teclado.

**Critério:** se algum lançamento exigiu o mouse, isso é um defeito da fatia — corrigir antes de fechar. O tempo medido não tem um limite fixado na spec, mas vai no commit final como linha de base para a Fatia 3.

- [ ] **Step 4: Rodar a verificação completa**

Run: `npm test && npm run typecheck && npm run lint && npm run build:css`
Expected: tudo verde. `build:css` importa porque as classes novas (`min-w-[14rem]`, `min-h-[1rem]`, `w-32`, `w-36`, `w-44`) precisam estar no `app.css` gerado.

- [ ] **Step 5: Commit final com o número medido**

```bash
git add -A
git commit -m "chore: close Fatia 2 — 20 entries in <TEMPO MEDIDO>

Linha de entrada rápida cronometrada num banco limpo: 20 lançamentos em
<TEMPO>, média de <MÉDIA> por lançamento, sem uso do mouse. Linha de base
para a Fatia 3 (spec §15)."
```

---

## Definition of Done

- [ ] A navegação tem três itens — `Registrar · Acompanhar · Decidir` — em desktop e mobile, com a engrenagem levando a Configurações.
- [ ] `registrar.html` e `analise.html` existem; `transactions.html` e `bi.html` respondem `301`.
- [ ] A linha rápida salva com `Enter`, mantém data e cartão, devolve o foco à descrição e não fecha.
- [ ] Categoria e cartão inexistentes são criados no submit, com dica visível antes.
- [ ] Um banco recém-criado permite o primeiro lançamento sem passar por Configurações.
- [ ] `+ dividir em N vezes` e `+ repete todo mês` funcionam sem tela própria.
- [ ] O painel de compromissos aparece no Acompanhar, só leitura, com links para `parcelas.html` e `recurring.html`.
- [ ] O tema é escolhido em Configurações; o `◐` sumiu do cabeçalho.
- [ ] Nenhuma capacidade perdida: filtros, busca, paginação, CSV, edição, exclusão.
- [ ] `npm test`, `npm run typecheck`, `npm run lint` limpos.
- [ ] Os 20 lançamentos foram cronometrados e o número está no commit final.

## Fora de escopo desta fatia

Fluxo em passos do Decidir; Análise repensada com a pauta de perguntas; série de poupança realizada; série comprometido vs. discricionário; migração do Simular para dentro da revisão. Tudo isso é Fatia 3.

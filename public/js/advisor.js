import { esc, formatBRL } from './format.js';

export function selectAdvice(d) {
  const t = d.totals;
  const over = d.categories
    .filter((c) => c.status === 'over')
    .map((c) => ({ c, overage: (c.effective_spent_cents ?? c.spent_cents) - c.limit_cents }))
    .sort((a, b) => b.overage - a.overage);
  if (over.length > 0) {
    const worst = over[0].c;
    return {
      id: 'over',
      text: `Você passou do limite em ${worst.name}. Considere remanejar ${formatBRL(over[0].overage)} de outra categoria.`,
    };
  }
  if (t.projected_savings_cents < t.savings_goal_cents) {
    const gap = t.savings_goal_cents - t.projected_savings_cents;
    return {
      id: 'below-goal',
      text: `Sua economia projetada está ${formatBRL(gap)} abaixo da meta. Reveja seus gastos discricionários para fechar o mês no azul.`,
    };
  }
  return {
    id: 'healthy',
    text: `Tudo dentro do teto — você está ${formatBRL(t.vs_goal_cents)} acima da meta. Continue assim.`,
  };
}

export function renderAdvisor(d) {
  const a = selectAdvice(d);
  return `
    <section class="paper-card mt-8 bg-sage-soft/10 border-sage-soft/40 flex flex-col md:flex-row md:items-center gap-4">
      <div class="flex-1">
        <div class="label-caps text-sage mb-1">Dica de Conselheiro</div>
        <p class="text-ink">${esc(a.text)}</p>
      </div>
      <a href="settings.html" class="btn-ghost whitespace-nowrap self-start md:self-auto">Revisar Orçamento</a>
    </section>`;
}

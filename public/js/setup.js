import { api, showError } from './api.js';
import { reaisToCents, currentMonth } from './format.js';
import { renderLimitRows, allocationStatus, allocationText, allocationPillClass } from './budget.js';

export const SETUP_STEPS = ['Start', 'Income', 'Fixed costs', 'Savings goal', 'Limits'];

export function progressPct(stepIndex, total) {
  return Math.round(((stepIndex + 1) / total) * 100);
}

export function isLastStep(stepIndex, total) {
  return stepIndex === total - 1;
}

export function continueLabel(stepIndex, total) {
  return isLastStep(stepIndex, total) ? 'Start tracking' : 'Continue';
}

export function renderStepIndicator(activeIndex) {
  const total = SETUP_STEPS.length;
  const pills = SETUP_STEPS.map((label, i) => {
    const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'todo';
    const current = i === activeIndex ? ' aria-current="step"' : '';
    return `<li class="step step-${state}"${current}><span class="step-no">${i + 1}</span>${label}</li>`;
  }).join('');
  return `
    <p class="label-caps text-ink-mut">Step ${activeIndex + 1} of ${total}</p>
    <ol class="step-indicator">${pills}</ol>
    <div class="meter"><div class="meter-fill" style="width:${progressPct(activeIndex, total)}%"></div></div>`;
}

// ---- DOM bootstrap (browser only) ----
const $ = id => document.getElementById(id);
const LIMITS_STEP = SETUP_STEPS.length - 1;

if (typeof document !== 'undefined' && document.getElementById('setup')) {
  const month = currentMonth();
  let step = 0;
  let template = 'suggested';
  let seededCats = [];
  let byCat = new Map();

  function readLimitCents() {
    return [...document.querySelectorAll('#limits input[data-cat]')]
      .map(inp => reaisToCents(inp.value || 0));
  }

  function updateAllocation() {
    const status = allocationStatus(
      readLimitCents(),
      reaisToCents($('monthly_income').value || 0),
      reaisToCents($('fixed_costs').value || 0),
      reaisToCents($('savings_goal').value || 0));
    const el = $('ceiling');
    el.textContent = allocationText(status);
    el.className = allocationPillClass(status);
  }

  function paintTemplate() {
    document.querySelectorAll('[data-template]').forEach(b => {
      b.className = (b.dataset.template === template ? 'btn-primary' : 'btn-ghost') + ' text-left';
    });
  }

  function renderLimitsStep() {
    if (template === 'blank') {
      $('limits').innerHTML = '';
      $('limitsEmpty').hidden = false;
    } else {
      $('limits').innerHTML = renderLimitRows(seededCats, byCat);
      $('limitsEmpty').hidden = true;
      $('limits').querySelectorAll('input[data-cat]').forEach(inp =>
        inp.addEventListener('input', updateAllocation));
    }
    updateAllocation();
  }

  function render() {
    $('indicator').innerHTML = renderStepIndicator(step);
    document.querySelectorAll('[data-step]').forEach(el => {
      el.hidden = Number(el.dataset.step) !== step;
    });
    $('back').disabled = step === 0;
    $('continue').textContent = continueLabel(step, SETUP_STEPS.length);
    if (step === LIMITS_STEP) renderLimitsStep();
  }

  async function finish() {
    try {
      await api.put('/api/settings', {
        monthly_income: reaisToCents($('monthly_income').value),
        fixed_costs: reaisToCents($('fixed_costs').value),
        savings_goal: reaisToCents($('savings_goal').value),
      });
      await api.post('/api/onboarding/template', { template });
      if (template !== 'blank') {
        const puts = seededCats.map(c => {
          const inp = $('limits').querySelector(`input[data-cat="${c.id}"]`);
          return api.put('/api/limits', {
            category_id: c.id, month, limit_cents: reaisToCents(inp.value || 0),
          });
        });
        await Promise.all(puts);
      }
      await api.post('/api/onboarding/complete');
      location.replace('/');
    } catch (e) { showError(e.message); }
  }

  async function load() {
    try {
      const [s, categories, limits] = await Promise.all([
        api.get('/api/settings'),
        api.get('/api/categories'),
        api.get(`/api/limits?month=${month}`),
      ]);
      seededCats = categories.filter(c => c.active);
      byCat = new Map(limits.map(l => [l.category_id, l.limit_cents]));
      $('monthly_income').value = s.monthly_income / 100;
      $('fixed_costs').value = s.fixed_costs / 100;
      $('savings_goal').value = s.savings_goal / 100;
      $('limitsMonth').textContent = month;
      paintTemplate();
      render();
    } catch (e) { showError(e.message); }
  }

  document.querySelectorAll('[data-template]').forEach(btn =>
    btn.addEventListener('click', () => { template = btn.dataset.template; paintTemplate(); }));
  ['monthly_income', 'fixed_costs', 'savings_goal'].forEach(id =>
    $(id).addEventListener('input', updateAllocation));
  $('back').addEventListener('click', () => { if (step > 0) { step--; render(); } });
  $('continue').addEventListener('click', () => {
    if (isLastStep(step, SETUP_STEPS.length)) finish();
    else { step++; render(); }
  });

  load();
}

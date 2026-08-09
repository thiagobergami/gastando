export const PALETTE = ['#4c6455', '#d4af37', '#c27d60', '#5c7c84', '#8fa998', '#735c00'];

export function themeColor(varName) {
  if (typeof getComputedStyle === 'undefined') return 'rgb(0 0 0)';
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return `rgb(${v})`;
}

export function datasetsFor(series, onlyNonZero) {
  return series
    .filter((s) => !onlyNonZero || s.spent_cents.some((v) => v > 0))
    .map((s, i) => ({
      label: s.name,
      data: s.spent_cents.map((c) => c / 100),
      borderColor: PALETTE[i % PALETTE.length],
      backgroundColor: PALETTE[i % PALETTE.length],
      fill: false,
      tension: 0.3,
    }));
}

const charts = {};
export function lineChart(canvasId, labels, series, onlyNonZero) {
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: { labels, datasets: datasetsFor(series, onlyNonZero) },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { family: 'Inter' } } } },
      scales: {
        x: {
          ticks: { color: themeColor('--ink-mut'), font: { family: 'JetBrains Mono' } },
          grid: { color: themeColor('--line') },
        },
        y: {
          ticks: { color: themeColor('--ink-mut'), font: { family: 'JetBrains Mono' } },
          grid: { color: themeColor('--line') },
        },
      },
    },
  });
}

export function barChart(canvasId, labels, data, { horizontal = false } = {}) {
  if (charts[canvasId]) charts[canvasId].destroy();
  const grid = themeColor('--line');
  const tick = themeColor('--ink-mut');
  charts[canvasId] = new Chart(document.getElementById(canvasId), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          data: data.map((c) => c / 100),
          backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
          borderRadius: 6,
        },
      ],
    },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tick, font: { family: 'JetBrains Mono' } }, grid: { color: grid } },
        y: { ticks: { color: tick, font: { family: 'JetBrains Mono' } }, grid: { color: grid } },
      },
    },
  });
}

// Colunas de poupança realizada com a meta como linha tracejada, como o frame
// 15:3. A meta entra como série (não como anotação) porque ela varia de mês para
// mês desde que `monthly_model` existe.
export function savingsChart(canvasId, months, realized, goal) {
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(document.getElementById(canvasId), {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Poupança realizada',
          data: realized.map((c) => c / 100),
          backgroundColor: realized.map((c, i) => (c >= goal[i] ? PALETTE[0] : PALETTE[4])),
          borderRadius: 6,
          order: 2,
        },
        {
          label: 'Meta',
          type: 'line',
          data: goal.map((c) => c / 100),
          borderColor: PALETTE[2],
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { family: 'Inter' } } } },
      scales: {
        x: {
          ticks: { color: themeColor('--ink-mut'), font: { family: 'JetBrains Mono' } },
          grid: { display: false },
        },
        y: {
          ticks: { color: themeColor('--ink-mut'), font: { family: 'JetBrains Mono' } },
          grid: { color: themeColor('--line') },
        },
      },
    },
  });
}

export const PALETTE = ['#4c6455', '#d4af37', '#c27d60', '#5c7c84', '#8fa998', '#735c00'];

export function themeColor(varName) {
  if (typeof getComputedStyle === 'undefined') return 'rgb(0 0 0)';
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return `rgb(${v})`;
}

export function aggregateSeries(series) {
  return series.map((s) => ({
    name: s.name,
    total: s.spent_cents.reduce((a, b) => a + b, 0),
  }));
}

export function topSeries(series) {
  const agg = aggregateSeries(series);
  if (agg.length === 0) return null;
  return agg.reduce((best, cur) => (cur.total > best.total ? cur : best), agg[0]);
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

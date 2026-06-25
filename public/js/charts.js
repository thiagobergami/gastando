export const PALETTE = ['#4c6455', '#d4af37', '#c27d60', '#5c7c84', '#8fa998', '#735c00'];

export function datasetsFor(series, onlyNonZero) {
  return series
    .filter(s => !onlyNonZero || s.spent_cents.some(v => v > 0))
    .map((s, i) => ({
      label: s.name,
      data: s.spent_cents.map(c => c / 100),
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
        x: { ticks: { font: { family: 'JetBrains Mono' } }, grid: { color: '#e4e2dd' } },
        y: { ticks: { font: { family: 'JetBrains Mono' } }, grid: { color: '#e4e2dd' } },
      },
    },
  });
}

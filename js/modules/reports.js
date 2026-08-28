import { supabase } from '../supabaseClient.js';
import { currentProject } from '../state.js';
import { cssVar } from '../ui.js';

export async function renderReportsPage(container) {
  if (!currentProject) {
    container.innerHTML = `<div class="empty-state"><h3>Nenhum projeto selecionado</h3><p>Crie ou selecione um projeto para ver relatórios.</p></div>`;
    return;
  }
  container.innerHTML = `<div class="flex" style="justify-content:center; padding:60px;"><span class="spinner"></span></div>`;

  const [{ data: cases }, { data: defects }, { data: runs }] = await Promise.all([
    supabase.from('test_cases').select('priority, type, automation_status').eq('project_id', currentProject.id),
    supabase.from('defects').select('severity, status, created_at').eq('project_id', currentProject.id),
    supabase.from('test_runs').select('id, title, created_at, test_run_cases(status)').eq('project_id', currentProject.id).order('created_at'),
  ]);

  container.innerHTML = `
    <div class="grid grid-2" style="margin-bottom:20px;">
      <div class="card">
        <h3 style="font-size:14px; margin-bottom:16px;">Casos de teste por prioridade</h3>
        <canvas id="priority-chart" height="200"></canvas>
      </div>
      <div class="card">
        <h3 style="font-size:14px; margin-bottom:16px;">Casos de teste por tipo</h3>
        <canvas id="type-chart" height="200"></canvas>
      </div>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <h3 style="font-size:14px; margin-bottom:16px;">Defeitos por severidade</h3>
        <canvas id="severity-chart" height="200"></canvas>
      </div>
      <div class="card">
        <h3 style="font-size:14px; margin-bottom:16px;">Taxa de aprovação por execução</h3>
        <canvas id="runs-chart" height="200"></canvas>
      </div>
    </div>
  `;

  const priorityColors = [cssVar('--st-skipped'), cssVar('--accent-2'), cssVar('--st-blocked'), cssVar('--st-failed')];
  drawBarChart('priority-chart', groupBy(cases || [], 'priority'), priorityColors);
  drawBarChart('type-chart', groupBy(cases || [], 'type'), palette(9));
  drawBarChart('severity-chart', groupBy(defects || [], 'severity'), priorityColors);
  drawRunsLine('runs-chart', runs || []);
}

function groupBy(arr, key) {
  const counts = {};
  arr.forEach((item) => {
    const k = item[key] || 'other';
    counts[k] = (counts[k] || 0) + 1;
  });
  return counts;
}

function palette(n) {
  const base = [
    cssVar('--accent-2'), cssVar('--st-preexisting'), cssVar('--st-passed'), cssVar('--st-failed'),
    cssVar('--st-blocked'), cssVar('--accent'), cssVar('--st-skipped'), cssVar('--text-muted'), cssVar('--border'),
  ];
  return base.slice(0, n);
}

function drawBarChart(canvasId, dataObj, colors) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || !window.Chart) return;
  const labels = Object.keys(dataObj);
  if (labels.length === 0) {
    ctx.parentElement.insertAdjacentHTML('beforeend', '<p class="text-muted" style="font-size:13px;">Sem dados suficientes ainda.</p>');
    return;
  }
  const tickColor = cssVar('--text-secondary');
  const gridColor = cssVar('--border-soft');
  new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: Object.values(dataObj), backgroundColor: colors, borderRadius: 6, maxBarThickness: 40 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tickColor }, grid: { display: false } },
        y: { ticks: { color: tickColor, precision: 0 }, grid: { color: gridColor } },
      },
    },
  });
}

function drawRunsLine(canvasId, runs) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || !window.Chart) return;
  if (runs.length === 0) {
    ctx.parentElement.insertAdjacentHTML('beforeend', '<p class="text-muted" style="font-size:13px;">Nenhuma execução registrada ainda.</p>');
    return;
  }
  const rates = runs.map((r) => {
    const rcs = r.test_run_cases || [];
    const executed = rcs.filter((rc) => rc.status !== 'untested');
    const passed = rcs.filter((rc) => rc.status === 'passed');
    return executed.length ? Math.round((passed.length / executed.length) * 100) : 0;
  });

  const lineColor = cssVar('--accent-2');
  const tickColor = cssVar('--text-secondary');
  const gridColor = cssVar('--border-soft');

  new window.Chart(ctx, {
    type: 'line',
    data: {
      labels: runs.map((r) => r.title),
      datasets: [{
        data: rates,
        borderColor: lineColor,
        backgroundColor: lineColor.startsWith('#') ? lineColor + '20' : lineColor,
        fill: true,
        tension: 0.3,
        pointBackgroundColor: lineColor,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tickColor, maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: { min: 0, max: 100, ticks: { color: tickColor, callback: (v) => v + '%' }, grid: { color: gridColor } },
      },
    },
  });
}

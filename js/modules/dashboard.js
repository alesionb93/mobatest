import { supabase } from '../supabaseClient.js';
import { currentProject } from '../state.js';
import { escapeHtml, badge, timeAgo, cssVar, formatDuration } from '../ui.js';

let activeDashTab = 'overview';
let dateFrom = null; // yyyy-mm-dd ou null (sem filtro)
let dateTo = null;
let activePreset = 'all'; // 'all' | '7' | '30' | '90' | null (datas customizadas)
let chartInstances = [];
let calendarViewDate = new Date(); // qual mês o calendário está mostrando
let pendingFrom = null; // seleção em andamento, só vira filtro de verdade ao clicar "Aplicar"
let pendingTo = null;

function formatDateBR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_LABELS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function buildCalendarCells(year, month) {
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    cells.push({ iso: isoDate(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1, d), day: d, otherMonth: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: isoDate(year, month, d), day: d, otherMonth: false });
  }
  while (cells.length % 7 !== 0) {
    const d = cells.length - (startWeekday + daysInMonth) + 1;
    cells.push({ iso: isoDate(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1, d), day: d, otherMonth: true });
  }
  return cells;
}

function renderCalendarPopover() {
  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  const cells = buildCalendarCells(year, month);

  return `
    <div class="date-cal-header">
      <button type="button" class="icon-btn" id="cal-prev-month"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
      <span>${MONTH_LABELS[month]} de ${year}</span>
      <button type="button" class="icon-btn" id="cal-next-month"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button>
    </div>
    <div class="date-cal-weekdays">${WEEKDAY_LABELS.map((w) => `<span>${w}</span>`).join('')}</div>
    <div class="date-cal-grid">
      ${cells.map((c) => {
        const isStart = c.iso === pendingFrom;
        const isEnd = c.iso === pendingTo;
        const inRangeCell = pendingFrom && pendingTo && c.iso > pendingFrom && c.iso < pendingTo;
        return `<button type="button" class="date-cal-day ${c.otherMonth ? 'is-other-month' : ''} ${isStart || isEnd ? 'is-selected' : ''} ${inRangeCell ? 'is-in-range' : ''}" data-cal-day="${c.iso}">${c.day}</button>`;
      }).join('')}
    </div>
    <div class="date-cal-footer">
      <span class="text-muted" style="font-size:12px;">${pendingFrom ? formatDateBR(pendingFrom) : '—'} – ${pendingTo ? formatDateBR(pendingTo) : '—'}</span>
      <div class="flex gap-8">
        <button type="button" class="btn btn-sm" id="cal-clear">Limpar</button>
        <button type="button" class="btn btn-sm btn-primary" id="cal-apply">Aplicar</button>
      </div>
    </div>
  `;
}

function wireDateRangePicker(container, data) {
  const btn = container.querySelector('#date-range-btn');
  const popover = container.querySelector('#date-range-popover');

  function openPopover() {
    pendingFrom = dateFrom;
    pendingTo = dateTo;
    calendarViewDate = dateFrom ? new Date(dateFrom + 'T00:00:00') : new Date();
    popover.innerHTML = renderCalendarPopover();
    popover.classList.remove('hidden');
    wirePopoverEvents();
  }

  function wirePopoverEvents() {
    popover.querySelector('#cal-prev-month').addEventListener('click', (e) => {
      e.stopPropagation();
      calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
      popover.innerHTML = renderCalendarPopover();
      wirePopoverEvents();
    });
    popover.querySelector('#cal-next-month').addEventListener('click', (e) => {
      e.stopPropagation();
      calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
      popover.innerHTML = renderCalendarPopover();
      wirePopoverEvents();
    });
    popover.querySelectorAll('[data-cal-day]').forEach((cell) => {
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        const clicked = cell.dataset.calDay;
        if (!pendingFrom || (pendingFrom && pendingTo)) {
          pendingFrom = clicked;
          pendingTo = null;
        } else if (clicked < pendingFrom) {
          pendingFrom = clicked;
        } else {
          pendingTo = clicked;
        }
        popover.innerHTML = renderCalendarPopover();
        wirePopoverEvents();
      });
    });
    popover.querySelector('#cal-clear').addEventListener('click', (e) => {
      e.stopPropagation();
      dateFrom = null; dateTo = null; activePreset = 'all';
      popover.classList.add('hidden');
      drawDashboard(container, data);
    });
    popover.querySelector('#cal-apply').addEventListener('click', (e) => {
      e.stopPropagation();
      dateFrom = pendingFrom;
      dateTo = pendingTo || pendingFrom;
      activePreset = null;
      popover.classList.add('hidden');
      drawDashboard(container, data);
    });
    popover.addEventListener('click', (e) => e.stopPropagation());
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (popover.classList.contains('hidden')) openPopover();
    else popover.classList.add('hidden');
  });

  document.addEventListener('click', () => popover.classList.add('hidden'));
}

function destroyCharts() {
  chartInstances.forEach((c) => c.destroy());
  chartInstances = [];
}

function inRange(iso) {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  if (dateFrom && d < dateFrom) return false;
  if (dateTo && d > dateTo) return false;
  return true;
}

// ------------------------------------------------------------
// TOOLTIP DE INDICADOR
// ------------------------------------------------------------
function infoIcon(name, objective, rule) {
  return `
    <span class="metric-info-wrap">
      <button type="button" class="metric-info-btn" data-info-btn title="Sobre este indicador">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
      </button>
      <div class="metric-info-popover hidden">
        <div class="metric-info-title">${escapeHtml(name)}</div>
        <div class="metric-info-row"><strong>Objetivo:</strong> ${escapeHtml(objective)}</div>
        <div class="metric-info-row"><strong>Cálculo:</strong> ${escapeHtml(rule)}</div>
      </div>
    </span>
  `;
}

function wireInfoIcons(container) {
  container.querySelectorAll('[data-info-btn]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pop = btn.nextElementSibling;
      const wasHidden = pop.classList.contains('hidden');
      container.querySelectorAll('.metric-info-popover').forEach((p) => p.classList.add('hidden'));
      if (wasHidden) pop.classList.remove('hidden');
    });
  });
  document.addEventListener('click', () => {
    container.querySelectorAll('.metric-info-popover').forEach((p) => p.classList.add('hidden'));
  });
}

function statCard({ label, value, delta, color, info }) {
  return `
    <div class="stat-card">
      <div class="label">${escapeHtml(label)}${info}</div>
      <div class="value" ${color ? `style="color:${color}"` : ''}>${value}</div>
      ${delta ? `<div class="delta">${delta}</div>` : ''}
    </div>
  `;
}

// Variante de formatDuration que também mostra dias — útil pra métricas
// que costumam levar mais que algumas horas (resolução de bug, duração
// de execução), diferente dos cronômetros de execução de caso (curtos).
function formatDurationLong(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) return '—';
  const s = Math.max(0, Math.round(totalSeconds));
  const days = Math.floor(s / 86400);
  if (days >= 1) {
    const remH = Math.floor((s % 86400) / 3600);
    return remH ? `${days}d ${remH}h` : `${days}d`;
  }
  return formatDuration(s);
}

// ------------------------------------------------------------
// ENTRADA
// ------------------------------------------------------------
export async function renderDashboardPage(container) {
  if (!currentProject) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Nenhum projeto selecionado</h3>
        <p>Crie seu primeiro projeto para começar a acompanhar a qualidade do seu produto.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `<div class="flex" style="justify-content:center; padding:60px;"><span class="spinner"></span></div>`;

  const data = await loadDashboardData();
  drawDashboard(container, data);
}

async function loadDashboardData() {
  const [{ data: cases }, { data: suites }, { data: runs }, { data: defects }, { data: reasons }, { data: contacts }, { data: profiles }, { data: cancellationReasons }] = await Promise.all([
    supabase.from('test_cases').select('id, suite_id, automation_status').eq('project_id', currentProject.id),
    supabase.from('test_suites').select('id, title').eq('project_id', currentProject.id),
    supabase.from('test_runs').select('id, title, status, environment, created_at, completed_at, cancellation_reason_id').eq('project_id', currentProject.id).order('created_at', { ascending: false }),
    supabase.from('defects').select('*').eq('project_id', currentProject.id),
    supabase.from('failure_reasons').select('id, label'),
    supabase.from('contacts').select('id, name, kind'),
    supabase.from('profiles').select('id, full_name'),
    supabase.from('cancellation_reasons').select('id, label'),
  ]);

  const runIds = (runs || []).map((r) => r.id);
  const { data: runCases } = runIds.length
    ? await supabase.from('test_run_cases').select('id, status, executed_by, executed_at, test_run_id').in('test_run_id', runIds)
    : { data: [] };

  return {
    cases: cases || [], suites: suites || [], runs: runs || [], defects: defects || [],
    reasons: reasons || [], contacts: contacts || [], profiles: profiles || [], runCases: runCases || [],
    cancellationReasons: cancellationReasons || [],
  };
}

// ------------------------------------------------------------
// LAYOUT + ABAS + FILTRO DE DATA
// ------------------------------------------------------------
function drawDashboard(container, data) {
  destroyCharts();

  container.innerHTML = `
    <div class="dash-filter-bar">
      <div class="tabs" style="margin:0;">
        <div class="tab ${activeDashTab === 'overview' ? 'active' : ''}" data-dash-tab="overview">Visão geral</div>
        <div class="tab ${activeDashTab === 'defects' ? 'active' : ''}" data-dash-tab="defects">Defeitos</div>
        <div class="tab ${activeDashTab === 'runs' ? 'active' : ''}" data-dash-tab="runs">Execuções</div>
      </div>
      <div class="flex gap-8" style="align-items:center; flex-wrap:wrap; position:relative;">
        <button class="btn btn-sm dash-preset-btn ${activePreset === 'all' ? 'is-active' : ''}" data-preset="all">Tudo</button>
        <button class="btn btn-sm dash-preset-btn ${activePreset === '7' ? 'is-active' : ''}" data-preset="7">7 dias</button>
        <button class="btn btn-sm dash-preset-btn ${activePreset === '30' ? 'is-active' : ''}" data-preset="30">30 dias</button>
        <button class="btn btn-sm dash-preset-btn ${activePreset === '90' ? 'is-active' : ''}" data-preset="90">90 dias</button>
        <button class="btn btn-sm" id="date-range-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${dateFrom && dateTo ? `${formatDateBR(dateFrom)} – ${formatDateBR(dateTo)}` : 'Selecionar período'}
        </button>
        <div id="date-range-popover" class="date-range-popover hidden"></div>
      </div>
    </div>
    <div id="dash-tab-content"></div>
  `;

  container.querySelectorAll('[data-dash-tab]').forEach((el) => {
    el.addEventListener('click', () => { activeDashTab = el.dataset.dashTab; drawDashboard(container, data); });
  });

  container.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.preset;
      activePreset = p;
      if (p === 'all') { dateFrom = null; dateTo = null; }
      else {
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - parseInt(p, 10));
        dateTo = to.toISOString().slice(0, 10);
        dateFrom = from.toISOString().slice(0, 10);
      }
      drawDashboard(container, data);
    });
  });

  wireDateRangePicker(container, data);

  const tabContent = document.getElementById('dash-tab-content');
  if (activeDashTab === 'overview') drawOverviewTab(tabContent, data);
  else if (activeDashTab === 'defects') drawDefectsTab(tabContent, data);
  else drawRunsTab(tabContent, data);

  wireInfoIcons(container);
}

// ------------------------------------------------------------
// ABA: VISÃO GERAL
// ------------------------------------------------------------
function drawOverviewTab(container, data) {
  const { cases, runs, runCases } = data;

  const executedInRange = runCases.filter((rc) => rc.status !== 'untested' && inRange(rc.executed_at));
  const passedInRange = executedInRange.filter((rc) => rc.status === 'passed').length;
  const passRate = executedInRange.length ? Math.round((passedInRange / executedInRange.length) * 100) : null;

  const activeRuns = runs.filter((r) => r.status === 'active');
  const activeRunCases = runCases.filter((rc) => activeRuns.some((r) => r.id === rc.test_run_id));
  const activeExecuted = activeRunCases.filter((rc) => rc.status !== 'untested').length;
  const progressPct = activeRunCases.length ? Math.round((activeExecuted / activeRunCases.length) * 100) : 0;

  const automatedCases = cases.filter((c) => c.automation_status === 'automated').length;
  const automationPct = cases.length ? Math.round((automatedCases / cases.length) * 100) : 0;

  const statusCounts = { passed: 0, failed: 0, blocked: 0, skipped: 0, pre_existing: 0, untested: 0 };
  runCases.filter((rc) => inRange(rc.executed_at) || (rc.status === 'untested' && activeRuns.some((r) => r.id === rc.test_run_id))).forEach((rc) => {
    statusCounts[rc.status] = (statusCounts[rc.status] || 0) + 1;
  });

  container.innerHTML = `
    <div class="grid grid-4" style="margin-bottom:24px;">
      ${statCard({
        label: 'Taxa de aprovação', value: passRate === null ? '—' : passRate + '%',
        delta: `${executedInRange.length} execução(ões) de caso no período`,
        color: passRate === null ? null : passRate >= 80 ? 'var(--st-passed)' : passRate >= 50 ? 'var(--st-blocked)' : 'var(--st-failed)',
        info: infoIcon('Taxa de aprovação', 'Mostrar a saúde geral dos testes executados no período.', '(Casos com status "Passou" ÷ Total de casos executados no período) × 100. Ignora casos não testados.'),
      })}
      ${statCard({
        label: 'Execuções ativas agora', value: activeRuns.length,
        delta: `${runs.length} execução(ões) no total`,
        info: infoIcon('Execuções ativas agora', 'Saber quantas execuções estão em andamento neste momento.', 'Contagem de execuções com status "Ativo". Não é afetado pelo filtro de data — é sempre o estado atual.'),
      })}
      ${statCard({
        label: 'Progresso de execução', value: progressPct + '%',
        delta: `${activeExecuted} de ${activeRunCases.length} casos executados`,
        info: infoIcon('Progresso de execução', 'Acompanhar o quanto já foi testado nas execuções em andamento.', '(Casos já executados ÷ Total de casos) × 100, somando todas as execuções ativas. Não é afetado pelo filtro de data.'),
      })}
      ${statCard({
        label: 'Cobertura de automação', value: automationPct + '%',
        delta: `${automatedCases} automatizado(s) de ${cases.length} caso(s)`,
        info: infoIcon('Cobertura de automação', 'Entender quanto do repositório de testes já está automatizado, pra priorizar investimento.', '(Casos com automação "Automatizado" ÷ Total de casos do repositório) × 100. Reflete o estado atual do repositório, não é afetado pelo filtro de data.'),
      })}
    </div>

    <div class="grid grid-2" style="align-items:start;">
      <div class="card">
        <h3 style="font-size:14px; margin-bottom:14px;">Progresso por execução ativa</h3>
        ${activeRuns.length === 0 ? '<p class="text-muted" style="font-size:13px;">Nenhuma execução ativa no momento.</p>' : `
          <div style="display:flex; flex-direction:column; gap:14px;">
            ${activeRuns.map((r) => {
              const rcs = runCases.filter((rc) => rc.test_run_id === r.id);
              const done = rcs.filter((rc) => rc.status !== 'untested').length;
              const pct = rcs.length ? Math.round((done / rcs.length) * 100) : 0;
              return `
                <div>
                  <div class="flex" style="justify-content:space-between; margin-bottom:5px; font-size:12.5px;">
                    <span style="font-weight:600;">${escapeHtml(r.title)}</span>
                    <span class="text-muted">${done}/${rcs.length} · ${pct}%</span>
                  </div>
                  <div class="progress-bar" style="height:8px;"><div style="width:${pct}%; background:var(--accent-2); height:100%; border-radius:4px;"></div></div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
      <div class="card">
        <h3 style="font-size:14px; margin-bottom:14px;">Distribuição de resultados</h3>
        <div style="height:240px;"><canvas id="results-chart"></canvas></div>
      </div>
    </div>
  `;

  const ctx = document.getElementById('results-chart');
  chartInstances.push(new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Passou', 'Falhou', 'Bloqueado', 'Pulado', 'Pré-existente', 'Não testado'],
      datasets: [{
        data: [statusCounts.passed, statusCounts.failed, statusCounts.blocked, statusCounts.skipped, statusCounts.pre_existing, statusCounts.untested],
        backgroundColor: [cssVar('--st-passed'), cssVar('--st-failed'), cssVar('--st-blocked'), cssVar('--st-skipped'), cssVar('--st-preexisting'), cssVar('--st-untested-bg')],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: cssVar('--text-secondary'), font: { size: 11 }, boxWidth: 10, padding: 10 } } },
      cutout: '68%',
    },
  }));
}

// ------------------------------------------------------------
// ABA: DEFEITOS
// ------------------------------------------------------------
function drawDefectsTab(container, data) {
  const { defects, cases, suites, reasons, contacts, runCases, runs } = data;
  const defectsInRange = defects.filter((d) => inRange(d.created_at));

  // Densidade por suíte: defeitos ÷ casos daquela suíte
  const caseSuiteMap = {};
  cases.forEach((c) => { if (c.suite_id) caseSuiteMap[c.id] = c.suite_id; });
  const casesPerSuite = {};
  cases.forEach((c) => { if (c.suite_id) casesPerSuite[c.suite_id] = (casesPerSuite[c.suite_id] || 0) + 1; });
  const defectsPerSuite = {};
  defectsInRange.forEach((d) => {
    const suiteId = caseSuiteMap[d.test_case_id];
    if (suiteId) defectsPerSuite[suiteId] = (defectsPerSuite[suiteId] || 0) + 1;
  });
  const densityRows = suites
    .filter((s) => defectsPerSuite[s.id])
    .map((s) => ({ title: s.title, density: defectsPerSuite[s.id] / (casesPerSuite[s.id] || 1), count: defectsPerSuite[s.id] }))
    .sort((a, b) => b.density - a.density)
    .slice(0, 8);

  // Tempo médio de resolução
  const resolvedInRange = defectsInRange.filter((d) => d.resolved_at && inRange(d.resolved_at));
  const avgResolutionMs = resolvedInRange.length
    ? resolvedInRange.reduce((sum, d) => sum + (new Date(d.resolved_at) - new Date(d.created_at)), 0) / resolvedInRange.length
    : null;

  // Motivo de falhas
  const reasonMap = {}; reasons.forEach((r) => { reasonMap[r.id] = r.label; });
  const byReason = {};
  defectsInRange.forEach((d) => {
    const label = d.failure_reason_id ? (reasonMap[d.failure_reason_id] || 'Motivo removido') : 'Sem motivo definido';
    byReason[label] = (byReason[label] || 0) + 1;
  });

  // Dev / PO responsável
  const contactMap = {}; contacts.forEach((c) => { contactMap[c.id] = c.name; });
  const byDev = {};
  defectsInRange.forEach((d) => {
    const label = d.dev_contact_id ? (contactMap[d.dev_contact_id] || 'Contato removido') : 'Sem dev atribuído';
    byDev[label] = (byDev[label] || 0) + 1;
  });
  const byPo = {};
  defectsInRange.forEach((d) => {
    const label = d.po_contact_id ? (contactMap[d.po_contact_id] || 'Contato removido') : 'Sem PO atribuído';
    byPo[label] = (byPo[label] || 0) + 1;
  });

  // Defeitos escapados para produção
  const runCaseToRunId = {}; runCases.forEach((rc) => { runCaseToRunId[rc.id] = rc.test_run_id; });
  const runEnv = {}; runs.forEach((r) => { runEnv[r.id] = r.environment; });
  const prodDefects = defectsInRange.filter((d) => {
    if (!d.test_run_case_id) return false;
    const runId = runCaseToRunId[d.test_run_case_id];
    return runId && runEnv[runId] === 'Produção';
  });

  container.innerHTML = `
    <div class="grid grid-3" style="margin-bottom:24px;">
      ${statCard({
        label: 'Tempo médio de resolução', value: avgResolutionMs === null ? '—' : formatDurationLong(Math.round(avgResolutionMs / 1000)),
        delta: `${resolvedInRange.length} defeito(s) resolvido(s) no período`,
        info: infoIcon('Tempo médio de resolução', 'Medir a velocidade de reação do time a bugs encontrados.', 'Média de (data em que virou Resolvido/Fechado − data de criação), considerando só defeitos resolvidos dentro do período filtrado.'),
      })}
      ${statCard({
        label: 'Defeitos escapados para produção', value: prodDefects.length,
        color: prodDefects.length > 0 ? 'var(--st-failed)' : 'var(--st-passed)',
        delta: `de ${defectsInRange.length} defeito(s) no período`,
        info: infoIcon('Defeitos escapados para produção', 'Identificar bugs que só foram pegos depois de já estarem no ar, não durante o teste em homologação.', 'Contagem de defeitos vinculados a um caso de execução cuja execução tinha o Ambiente marcado como "Produção", criados dentro do período filtrado.'),
      })}
      ${statCard({
        label: 'Defeitos no período', value: defectsInRange.length,
        delta: `${defects.length} no total (sem filtro)`,
        info: infoIcon('Defeitos no período', 'Referência rápida do volume de defeitos abertos no período selecionado.', 'Contagem de defeitos cuja data de criação está dentro do período filtrado.'),
      })}
    </div>

    <div class="grid grid-2" style="align-items:start; margin-bottom:24px;">
      <div class="card">
        <h3 style="font-size:14px; margin-bottom:4px; display:flex; align-items:center;">Densidade de defeitos por suíte
          ${infoIcon('Densidade de defeitos por suíte', 'Apontar rapidamente quais áreas do produto concentram mais problemas, mesmo que tenham poucos casos de teste.', 'Para cada suíte: (Nº de defeitos ligados a casos dessa suíte) ÷ (Nº de casos de teste da suíte). Mostra as 8 suítes com maior densidade.')}
        </h3>
        ${densityRows.length === 0 ? '<p class="text-muted" style="font-size:13px;">Sem dados suficientes no período.</p>' : `<div style="height:240px;"><canvas id="density-chart"></canvas></div>`}
      </div>
      <div class="card">
        <h3 style="font-size:14px; margin-bottom:4px; display:flex; align-items:center;">Motivo de falhas
          ${infoIcon('Motivo de falhas', 'Entender as causas mais comuns dos bugs — código, regra de negócio, documentação, etc.', 'Contagem de defeitos por Motivo da falha selecionado, dentro do período filtrado.')}
        </h3>
        ${Object.keys(byReason).length === 0 ? '<p class="text-muted" style="font-size:13px;">Sem dados no período.</p>' : `<div style="height:240px;"><canvas id="reason-chart"></canvas></div>`}
      </div>
    </div>

    <div class="grid grid-2" style="align-items:start;">
      <div class="card">
        <h3 style="font-size:14px; margin-bottom:4px; display:flex; align-items:center;">Desenvolvedor responsável
          ${infoIcon('Desenvolvedor responsável por bugs', 'Ver a distribuição de bugs por dev responsável, pra apoiar conversas de carga de trabalho — não é ranking de culpa.', 'Contagem de defeitos por Dev responsável selecionado no defeito, dentro do período filtrado.')}
        </h3>
        <div class="dash-metric-list">
          ${Object.entries(byDev).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => `
            <div class="dash-metric-list-row"><span class="name">${escapeHtml(name)}</span><span class="count">${count}</span></div>
          `).join('') || '<p class="text-muted" style="font-size:13px;">Sem dados no período.</p>'}
        </div>
      </div>
      <div class="card">
        <h3 style="font-size:14px; margin-bottom:4px; display:flex; align-items:center;">PO responsável
          ${infoIcon('PO responsável por bugs', 'Ver quantos bugs se originam de critérios de aceite mal definidos ou faltantes, por PO.', 'Contagem de defeitos por PO responsável selecionado no defeito, dentro do período filtrado.')}
        </h3>
        <div class="dash-metric-list">
          ${Object.entries(byPo).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => `
            <div class="dash-metric-list-row"><span class="name">${escapeHtml(name)}</span><span class="count">${count}</span></div>
          `).join('') || '<p class="text-muted" style="font-size:13px;">Sem dados no período.</p>'}
        </div>
      </div>
    </div>
  `;

  if (densityRows.length > 0) {
    const ctx = document.getElementById('density-chart');
    chartInstances.push(new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: densityRows.map((r) => r.title),
        datasets: [{ data: densityRows.map((r) => Math.round(r.density * 100) / 100), backgroundColor: cssVar('--st-failed'), borderRadius: 4 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: cssVar('--text-secondary') }, grid: { color: cssVar('--border-soft') } },
          y: { ticks: { color: cssVar('--text-secondary') }, grid: { display: false } },
        },
      },
    }));
  }

  if (Object.keys(byReason).length > 0) {
    const ctx = document.getElementById('reason-chart');
    const labels = Object.keys(byReason);
    chartInstances.push(new window.Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: Object.values(byReason), backgroundColor: [cssVar('--chart-1'), cssVar('--chart-2'), cssVar('--chart-3'), cssVar('--chart-4'), cssVar('--chart-5'), cssVar('--text-muted')], borderWidth: 0 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: cssVar('--text-secondary'), font: { size: 11 }, boxWidth: 10 } } },
        cutout: '60%',
      },
    }));
  }
}

// ------------------------------------------------------------
// ABA: EXECUÇÕES
// ------------------------------------------------------------
function drawRunsTab(container, data) {
  const { runs, runCases, profiles, cancellationReasons } = data;

  const completedInRange = runs.filter((r) => r.status === 'completed' && r.completed_at && inRange(r.completed_at));
  const avgRunMs = completedInRange.length
    ? completedInRange.reduce((sum, r) => sum + (new Date(r.completed_at) - new Date(r.created_at)), 0) / completedInRange.length
    : null;

  const successfulRuns = completedInRange.filter((r) => {
    const rcs = runCases.filter((rc) => rc.test_run_id === r.id);
    return rcs.length > 0 && !rcs.some((rc) => rc.status === 'failed');
  });
  const successRate = completedInRange.length ? Math.round((successfulRuns.length / completedInRange.length) * 100) : null;

  const profileMap = {}; profiles.forEach((p) => { profileMap[p.id] = p.full_name; });
  const byPerson = {};
  runCases.filter((rc) => rc.status !== 'untested' && inRange(rc.executed_at)).forEach((rc) => {
    const name = profileMap[rc.executed_by] || 'Desconhecido';
    byPerson[name] = (byPerson[name] || 0) + 1;
  });

  const cancelledInRange = runs.filter((r) => r.status === 'cancelled' && r.completed_at && inRange(r.completed_at));
  const cancelReasonMap = {}; cancellationReasons.forEach((r) => { cancelReasonMap[r.id] = r.label; });
  const byCancelReason = {};
  cancelledInRange.forEach((r) => {
    const label = r.cancellation_reason_id ? (cancelReasonMap[r.cancellation_reason_id] || 'Motivo removido') : 'Sem motivo registrado';
    byCancelReason[label] = (byCancelReason[label] || 0) + 1;
  });

  container.innerHTML = `
    <div class="grid grid-3" style="margin-bottom:24px;">
      ${statCard({
        label: 'Tempo médio das execuções', value: avgRunMs === null ? '—' : formatDurationLong(Math.round(avgRunMs / 1000)),
        delta: `${completedInRange.length} execução(ões) concluída(s) no período`,
        info: infoIcon('Tempo médio das execuções', 'Entender quanto tempo, em média, uma rodada de testes leva do início à conclusão.', 'Média de (data de conclusão − data de criação), considerando só execuções com status "Concluído" cuja conclusão caiu dentro do período filtrado.'),
      })}
      ${statCard({
        label: 'Taxa de sucesso nas execuções', value: successRate === null ? '—' : successRate + '%',
        color: successRate === null ? null : successRate >= 80 ? 'var(--st-passed)' : successRate >= 50 ? 'var(--st-blocked)' : 'var(--st-failed)',
        delta: `${successfulRuns.length} de ${completedInRange.length} sem nenhuma falha`,
        info: infoIcon('Taxa de sucesso nas execuções', 'Ver quantas rodadas de teste terminaram totalmente limpas, sem nenhum caso falho — diferente da taxa de aprovação, que olha caso a caso.', '(Execuções concluídas sem nenhum caso "Falhou" ÷ Total de execuções concluídas no período) × 100.'),
      })}
      ${statCard({
        label: 'Execuções canceladas', value: cancelledInRange.length,
        color: cancelledInRange.length > 0 ? 'var(--st-blocked)' : null,
        delta: `de ${completedInRange.length + cancelledInRange.length} execução(ões) finalizada(s) no período`,
        info: infoIcon('Execuções canceladas', 'Acompanhar quantas execuções foram interrompidas antes de terminar, e por quê — ajuda a identificar problemas recorrentes de ambiente, planejamento ou escopo.', 'Contagem de execuções com status "Cancelado" cuja data de cancelamento caiu dentro do período filtrado.'),
      })}
    </div>

    <div class="grid grid-2" style="align-items:start;">
      <div class="card">
        <h3 style="font-size:14px; margin-bottom:4px; display:flex; align-items:center;">Testes por pessoa
          ${infoIcon('Testes por pessoa', 'Ver como a execução de testes está distribuída entre a equipe, útil pra balancear carga.', 'Contagem de casos executados (qualquer status, exceto "Não testado") agrupados por quem executou, com data de execução dentro do período filtrado.')}
        </h3>
        <div class="dash-metric-list" style="margin-top:10px;">
          ${Object.entries(byPerson).sort((a, b) => b[1] - a[1]).map(([name, count]) => `
            <div class="dash-metric-list-row"><span class="name">${escapeHtml(name)}</span><span class="count">${count}</span></div>
          `).join('') || '<p class="text-muted" style="font-size:13px;">Sem dados no período.</p>'}
        </div>
      </div>
      <div class="card">
        <h3 style="font-size:14px; margin-bottom:4px; display:flex; align-items:center;">Motivos de cancelamento
          ${infoIcon('Motivos de cancelamento', 'Entender as causas mais comuns por trás das execuções canceladas.', 'Contagem de execuções canceladas por Motivo do cancelamento selecionado, dentro do período filtrado.')}
        </h3>
        <div class="dash-metric-list" style="margin-top:10px;">
          ${Object.entries(byCancelReason).sort((a, b) => b[1] - a[1]).map(([name, count]) => `
            <div class="dash-metric-list-row"><span class="name">${escapeHtml(name)}</span><span class="count">${count}</span></div>
          `).join('') || '<p class="text-muted" style="font-size:13px;">Nenhuma execução cancelada no período.</p>'}
        </div>
      </div>
    </div>
  `;
}

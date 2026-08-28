import { supabase } from '../supabaseClient.js';
import { currentUser } from '../auth.js';
import { currentProject } from '../state.js';
import { createRichEditor } from '../richEditor.js';
import { BUG_CARD_TEMPLATE, SEVERITY_DEFS } from '../bugTemplate.js';
import { fetchFailureReasons, fetchContacts, failureReasonOptionsHtml, contactOptionsHtml } from '../defectFields.js';
import { setRouteSubId } from '../router.js';
import {
  openModal, closeModal, openDrawer, closeDrawer, toast, setLoading, escapeHtml, badge,
  statusLabel, formatDateTime, formatDate, formatDuration, formatElapsed, confirmDialog, cssVar,
} from '../ui.js';

// ------------------------------------------------------------
// Ícones de status — silhuetas SVG (não emoji)
// ------------------------------------------------------------
const ICONS = {
  passed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9"/></svg>',
  failed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
  blocked: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>',
  skipped: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="6 4 16 12 6 20 6 4"/><line x1="18" y1="5" x2="18" y2="19"/></svg>',
  pre_existing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14.5"/></svg>',
};

const STATUS_DEFS = [
  { key: 'passed', label: 'Passou' },
  { key: 'failed', label: 'Falhou' },
  { key: 'blocked', label: 'Bloqueado' },
  { key: 'skipped', label: 'Pulado' },
  { key: 'pre_existing', label: 'Pré-existente' },
];

function iconSpan(key, size = 15) {
  return `<span class="status-icon" style="width:${size}px; height:${size}px;">${ICONS[key] || ''}</span>`;
}

let activeRunTab = 'cases';

export async function renderTestRunsPage(container, subId) {
  if (!currentProject) {
    container.innerHTML = `<div class="empty-state"><h3>Nenhum projeto selecionado</h3><p>Crie ou selecione um projeto para gerenciar execuções.</p></div>`;
    return;
  }

  // Se a URL já aponta para uma execução (e, possivelmente, um caso
  // específico dentro dela) — ex: a aba foi descartada/recarregada pelo
  // navegador — abre direto lá em vez de voltar para a lista.
  if (subId) {
    const [runId, autoOpenCaseId] = subId.split('/');
    return renderRunDetail(container, runId, autoOpenCaseId || null);
  }

  container.innerHTML = `<div class="flex" style="justify-content:center; padding:60px;"><span class="spinner"></span></div>`;

  const { data: runs } = await supabase
    .from('test_runs')
    .select('*, test_run_cases(status)')
    .eq('project_id', currentProject.id)
    .order('created_at', { ascending: false });

  setRouteSubId('test-runs', null);
  renderList(container, runs || []);
}

function progressSegments(runCases) {
  const total = runCases.length || 1;
  const counts = { passed: 0, failed: 0, blocked: 0, skipped: 0, pre_existing: 0, untested: 0 };
  runCases.forEach((rc) => { const s = rc.status || 'untested'; counts[s] = (counts[s] || 0) + 1; });
  const colors = { passed: 'var(--st-passed)', failed: 'var(--st-failed)', blocked: 'var(--st-blocked)', skipped: 'var(--st-skipped)', pre_existing: 'var(--st-preexisting)', untested: 'var(--st-untested-bg)' };
  return Object.entries(counts).map(([k, v]) =>
    `<span style="width:${(v / total) * 100}%; background:${colors[k]};"></span>`
  ).join('');
}

function renderList(container, runs) {
  document.body.classList.remove('has-run-sidebar');
  container.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="text-secondary">${runs.length} execução(ões)</span>
      </div>
      <button class="btn btn-primary" id="new-run-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        Nova execução
      </button>
    </div>

    ${runs.length === 0 ? `
      <div class="card"><div class="empty-state">
        <h3>Nenhuma execução ainda</h3>
        <p>Crie uma execução para começar a rodar seus casos de teste.</p>
      </div></div>
    ` : `
      <div class="grid grid-2">
        ${runs.map((r) => {
          const total = r.test_run_cases.length;
          const done = r.test_run_cases.filter(rc => rc.status && rc.status !== 'untested').length;
          const failed = r.test_run_cases.filter(rc => rc.status === 'failed').length;
          return `
            <div class="card row-clickable" data-run-id="${r.id}">
              <div class="flex" style="justify-content:space-between; margin-bottom:10px;">
                <div>
                  <div class="flex gap-8">
                    <span style="font-weight:700; font-size:15px;">${escapeHtml(r.title)}</span>
                    ${r.is_public ? '<span class="badge badge-medium">Pública</span>' : ''}
                  </div>
                  <div class="text-muted" style="font-size:12px; margin-top:2px;">${escapeHtml(r.environment || 'Sem ambiente definido')} · ${formatDateTime(r.created_at)}</div>
                </div>
                ${badge(r.status)}
              </div>
              <div class="progress-bar" style="margin-bottom:8px;">${progressSegments(r.test_run_cases)}</div>
              <div class="flex" style="justify-content:space-between; align-items:center; font-size:12px;">
                <span class="text-secondary">${done}/${total} executados</span>
                <div class="flex gap-8" style="align-items:center;">
                  ${failed > 0 ? `<span style="color:var(--st-failed); font-weight:600;">${failed} falha(s)</span>` : '<span class="text-muted">0 falhas</span>'}
                  <button class="icon-btn danger" data-delete-run="${r.id}" title="Excluir execução">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `}
  `;

  document.getElementById('new-run-btn').addEventListener('click', () => openNewRunModal(container));
  container.querySelectorAll('[data-run-id]').forEach((el) => {
    el.addEventListener('click', () => {
      activeRunTab = 'cases';
      setRouteSubId('test-runs', el.dataset.runId);
      renderRunDetail(container, el.dataset.runId);
    });
  });

  container.querySelectorAll('[data-delete-run]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDialog('Excluir esta execução? Todos os resultados registrados nela serão perdidos. Esta ação não pode ser desfeita.', async () => {
        const { error } = await supabase.from('test_runs').delete().eq('id', btn.dataset.deleteRun);
        if (error) { toast(error.message, 'error'); return; }
        toast('Execução excluída.');
        renderTestRunsPage(container);
      });
    });
  });
}

async function openNewRunModal(container) {
  const [{ data: cases }, { data: plans }, { data: planCasesAll }] = await Promise.all([
    supabase.from('test_cases').select('id, title, seq').eq('project_id', currentProject.id).eq('status', 'active').order('seq'),
    supabase.from('test_plans').select('id, title').eq('project_id', currentProject.id).order('created_at', { ascending: false }),
    supabase.from('test_plan_cases').select('test_plan_id, test_case_id'),
  ]);

  const casesById = {};
  (cases || []).forEach((c) => { casesById[c.id] = c; });

  const plansWithCount = (plans || []).map((p) => ({
    ...p,
    caseIds: (planCasesAll || []).filter((pc) => pc.test_plan_id === p.id).map((pc) => pc.test_case_id),
  }));

  openModal({
    title: 'Nova execução de teste',
    size: 'lg',
    bodyHtml: `
      <div class="field">
        <label>Título da execução</label>
        <input type="text" id="run-title" placeholder="Ex: Regressão Release 2.4" />
      </div>
      <div class="field">
        <label>Ambiente</label>
        <select id="run-env">
          <option value="Homologação">Homologação</option>
          <option value="Produção">Produção</option>
          <option value="Outro">Outro</option>
        </select>
        <div class="field-hint">Usado na métrica de defeitos escapados para produção — escolha "Produção" quando essa execução for de fato num ambiente produtivo.</div>
      </div>

      <div class="field">
        <label>Origem dos casos de teste</label>
        <div class="tabs" style="margin:0 0 14px;">
          <div class="tab active" data-source="repository" style="margin-right:20px;">Do repositório</div>
          <div class="tab" data-source="plan">De um plano de teste</div>
        </div>
      </div>

      <div id="source-repository">
        <div class="field">
          <label style="display:flex; justify-content:space-between;">
            <span>Selecione os casos de teste (${cases?.length || 0} disponíveis)</span>
            <span><a href="#" id="select-all-cases">selecionar todos</a></span>
          </label>
          <div style="max-height:260px; overflow-y:auto; border:1px solid var(--border); border-radius:8px; padding:8px;">
            ${(cases || []).map((c) => `
              <label class="flex gap-8" style="padding:7px 6px; cursor:pointer; border-radius:6px;">
                <input type="checkbox" class="run-case-check" value="${c.id}" />
                <span class="id-badge">${currentProject.code}-${c.seq}</span>
                <span>${escapeHtml(c.title)}</span>
              </label>
            `).join('') || '<p class="text-muted" style="padding:8px;">Nenhum caso de teste ativo. Crie casos primeiro.</p>'}
          </div>
        </div>
      </div>

      <div id="source-plan" class="hidden">
        <div class="field">
          <label>Selecione o plano de teste</label>
          <select id="run-plan-select">
            <option value="">— Selecione um plano —</option>
            ${plansWithCount.map((p) => `<option value="${p.id}">${escapeHtml(p.title)} (${p.caseIds.length} caso${p.caseIds.length === 1 ? '' : 's'})</option>`).join('') || ''}
          </select>
          ${plansWithCount.length === 0 ? '<div class="field-hint">Nenhum plano de teste criado ainda. Crie um em "Planos de teste".</div>' : ''}
        </div>
        <div id="plan-cases-preview" style="max-height:220px; overflow-y:auto; border:1px solid var(--border); border-radius:8px; padding:8px;">
          <p class="text-muted" style="padding:8px; margin:0;">Selecione um plano acima para ver os casos incluídos.</p>
        </div>
      </div>
    `,
    footerHtml: `
      <button class="btn" id="run-cancel">Cancelar</button>
      <button class="btn btn-primary" id="run-save">Criar execução</button>
    `,
  });

  let activeSource = 'repository';

  document.querySelectorAll('.tab[data-source]').forEach((tabEl) => {
    tabEl.addEventListener('click', () => {
      activeSource = tabEl.dataset.source;
      document.querySelectorAll('.tab[data-source]').forEach((t) => t.classList.toggle('active', t === tabEl));
      document.getElementById('source-repository').classList.toggle('hidden', activeSource !== 'repository');
      document.getElementById('source-plan').classList.toggle('hidden', activeSource !== 'plan');
    });
  });

  document.getElementById('run-cancel').addEventListener('click', closeModal);
  document.getElementById('select-all-cases')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.run-case-check').forEach((cb) => (cb.checked = true));
  });

  document.getElementById('run-plan-select')?.addEventListener('change', (e) => {
    const plan = plansWithCount.find((p) => p.id === e.target.value);
    const preview = document.getElementById('plan-cases-preview');
    if (!plan) {
      preview.innerHTML = '<p class="text-muted" style="padding:8px; margin:0;">Selecione um plano acima para ver os casos incluídos.</p>';
      return;
    }
    const validIds = plan.caseIds.filter((id) => casesById[id]);
    preview.innerHTML = validIds.length === 0
      ? '<p class="text-muted" style="padding:8px; margin:0;">Este plano não possui casos ativos.</p>'
      : validIds.map((id) => `
          <div class="flex gap-8" style="padding:6px;">
            <span class="id-badge">${currentProject.code}-${casesById[id].seq}</span>
            <span>${escapeHtml(casesById[id].title)}</span>
          </div>
        `).join('');
  });

  document.getElementById('run-save').addEventListener('click', async () => {
    const title = document.getElementById('run-title').value.trim();
    const environment = document.getElementById('run-env').value.trim();

    let selectedCaseIds;
    if (activeSource === 'plan') {
      const plan = plansWithCount.find((p) => p.id === document.getElementById('run-plan-select').value);
      if (!plan) { toast('Selecione um plano de teste.', 'error'); return; }
      selectedCaseIds = plan.caseIds.filter((id) => casesById[id]);
    } else {
      selectedCaseIds = Array.from(document.querySelectorAll('.run-case-check:checked')).map((cb) => cb.value);
    }

    if (!title) { toast('Dê um título à execução.', 'error'); return; }
    if (!selectedCaseIds || selectedCaseIds.length === 0) { toast('Selecione ao menos um caso de teste.', 'error'); return; }

    const btn = document.getElementById('run-save');
    setLoading(btn, true, 'Criando...');

    const { data: run, error } = await supabase.from('test_runs').insert({
      project_id: currentProject.id, title, environment, created_by: currentUser.id,
    }).select().single();

    if (error) { setLoading(btn, false); toast(error.message, 'error'); return; }

    const runCasesPayload = selectedCaseIds.map((tcId) => ({ test_run_id: run.id, test_case_id: tcId, status: 'untested' }));
    const { error: rcError } = await supabase.from('test_run_cases').insert(runCasesPayload);
    if (rcError) { setLoading(btn, false); toast(rcError.message, 'error'); return; }

    closeModal();
    toast('Execução criada!');
    activeRunTab = 'cases';
    setRouteSubId('test-runs', run.id);
    renderRunDetail(container, run.id);
  });
}

// ------------------------------------------------------------
// Agrupamento por suíte / sub-suíte (ordem estável, não reordena
// ao marcar resultado — só a organização visual muda)
// ------------------------------------------------------------
function buildSuiteOrder(suites) {
  const byParent = {};
  suites.forEach((s) => {
    const key = s.parent_suite_id || 'root';
    (byParent[key] = byParent[key] || []).push(s);
  });
  Object.values(byParent).forEach((arr) => arr.sort((a, b) => (a.position || 0) - (b.position || 0)));

  const order = [];
  function walk(parentId, depth) {
    (byParent[parentId || 'root'] || []).forEach((s) => {
      order.push({ id: s.id, title: s.title, depth });
      walk(s.id, depth + 1);
    });
  }
  walk(null, 0);
  return order;
}

function groupRunCasesBySuite(runCases, suites) {
  const suiteOrder = buildSuiteOrder(suites);
  const bySuite = {};
  runCases.forEach((rc) => {
    const key = rc.test_cases.suite_id || 'none';
    (bySuite[key] = bySuite[key] || []).push(rc);
  });
  Object.values(bySuite).forEach((arr) => arr.sort((a, b) => (a.test_cases.seq || 0) - (b.test_cases.seq || 0)));

  const groups = [];
  suiteOrder.forEach((s) => {
    if (bySuite[s.id]) groups.push({ title: s.title, depth: s.depth, cases: bySuite[s.id] });
  });
  if (bySuite.none) groups.push({ title: 'Sem suíte', depth: 0, cases: bySuite.none });
  return groups;
}

function flattenGroups(groups) {
  return groups.flatMap((g) => g.cases);
}

function profileName(userId, profilesMap) {
  if (!userId) return 'Não atribuído';
  if (userId === currentUser?.id) return (profilesMap[userId] && profilesMap[userId].full_name) || 'Você';
  return (profilesMap[userId] && profilesMap[userId].full_name) || 'Outro membro';
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div.textContent || '';
}

// ------------------------------------------------------------
// Página de detalhe da execução (abas + sidebar de progresso)
// ------------------------------------------------------------
async function renderRunDetail(container, runId, autoOpenCaseId) {
  container.innerHTML = `<div class="flex" style="justify-content:center; padding:60px;"><span class="spinner"></span></div>`;

  const [{ data: run }, { data: runCases }, { data: suites }] = await Promise.all([
    supabase.from('test_runs').select('*').eq('id', runId).single(),
    supabase.from('test_run_cases').select('*, test_cases(title, seq, priority, suite_id)').eq('test_run_id', runId),
    supabase.from('test_suites').select('id, title, parent_suite_id, position').eq('project_id', currentProject.id),
  ]);

  if (!run) {
    setRouteSubId('test-runs', null);
    toast('Essa execução não foi encontrada — pode ter sido excluída.', 'error');
    return renderTestRunsPage(container);
  }

  const safeRunCases = runCases || [];
  const runCaseIds = safeRunCases.map((rc) => rc.id);

  const { data: defectsRaw } = runCaseIds.length
    ? await supabase.from('defects').select('*').in('test_run_case_id', runCaseIds)
    : { data: [] };

  const defectsForRun = (defectsRaw || []).map((d) => {
    const rc = safeRunCases.find((r) => r.id === d.test_run_case_id);
    return { ...d, _caseTitle: rc ? rc.test_cases.title : null };
  });

  const userIds = new Set();
  if (run?.created_by) userIds.add(run.created_by);
  safeRunCases.forEach((rc) => {
    if (rc.assignee_id) userIds.add(rc.assignee_id);
    if (rc.executed_by) userIds.add(rc.executed_by);
  });

  let profilesMap = {};
  if (userIds.size > 0) {
    const { data: profiles } = await supabase.from('profiles').select('*').in('id', Array.from(userIds));
    (profiles || []).forEach((p) => { profilesMap[p.id] = p; });
  }

  drawRunDetail(container, run, safeRunCases, suites || [], defectsForRun, profilesMap);

  // Recupera o painel do caso específico (ex: após a aba ser
  // descartada/recarregada pelo navegador com o painel ainda aberto)
  if (autoOpenCaseId && safeRunCases.some((rc) => rc.id === autoOpenCaseId)) {
    const groups = groupRunCasesBySuite(safeRunCases, suites || []);
    const orderedIds = flattenGroups(groups).map((rc) => rc.id);
    openRunCaseDrawer(container, runId, autoOpenCaseId, orderedIds);
  }
}

function drawRunSidebar(run, runCases, profilesMap) {
  const total = runCases.length || 1;
  const executed = runCases.filter((rc) => rc.status && rc.status !== 'untested').length;
  const pct = Math.round((executed / total) * 100);
  const totalDurationSeconds = runCases.reduce((sum, rc) => sum + (rc.duration_seconds || 0), 0);

  return `
    <div class="run-sidebar-actions">
      <div class="run-sidebar-icon-row">
        <button class="icon-btn run-sidebar-icon-btn" id="share-report-btn" title="Compartilhar relatório">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.6" x2="15.4" y2="6.4"/><line x1="8.6" y1="13.4" x2="15.4" y2="17.6"/></svg>
          <span>Compartilhar</span>
        </button>
        <button class="icon-btn run-sidebar-icon-btn" id="export-run-btn" title="Exportar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Exportar</span>
        </button>
      </div>
      ${run.status === 'active' ? `
        <div class="flex gap-8">
          <button class="btn" id="cancel-run-btn" style="flex:1; justify-content:center;">Cancelar</button>
          <button class="btn btn-primary" id="complete-run-btn" style="flex:1; justify-content:center;">Concluir</button>
        </div>
      ` : ''}
    </div>

    <div style="position:relative; width:150px; height:150px; margin:0 auto 18px;">
      <canvas id="run-completion-chart" width="150" height="150"></canvas>
      <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;">
        <div style="font-family:var(--font-display); font-size:24px; font-weight:700;">${pct}%</div>
        <div class="text-muted" style="font-size:11px;">concluído</div>
      </div>
    </div>
    <div class="text-secondary" style="text-align:center; font-size:12.5px; margin-bottom:18px;">${executed} de ${runCases.length} casos</div>

    <div class="drawer-section" style="margin-bottom:14px;">
      <div class="drawer-section-label" style="margin-bottom:4px;">Status</div>
      ${badge(run.status)}
    </div>
    <div class="drawer-section" style="margin-bottom:14px;">
      <div class="drawer-section-label" style="margin-bottom:4px;">Iniciado por</div>
      <div style="font-size:13px; font-weight:600;">${escapeHtml(profileName(run.created_by, profilesMap))}</div>
    </div>
    <div class="drawer-section" style="margin-bottom:14px;">
      <div class="drawer-section-label" style="margin-bottom:4px;">Iniciado em</div>
      <div style="font-size:13px; font-weight:600;">${formatDate(run.created_at)}</div>
    </div>
    <div class="drawer-section" style="margin-bottom:14px;">
      <div class="drawer-section-label" style="margin-bottom:4px;">Tempo decorrido</div>
      <div id="run-elapsed-text" style="font-size:13px; font-weight:600;">${formatElapsed(run.created_at, run.completed_at)}</div>
    </div>
    <div class="drawer-section" style="margin-bottom:0;">
      <div class="drawer-section-label" style="margin-bottom:4px;">Tempo total testando</div>
      <div style="font-size:13px; font-weight:600;">${totalDurationSeconds > 0 ? formatDuration(totalDurationSeconds) : '—'}</div>
    </div>
  `;
}

function drawRunSidebarChart(runCases) {
  const ctx = document.getElementById('run-completion-chart');
  if (!ctx || !window.Chart) return;
  const counts = { passed: 0, failed: 0, blocked: 0, skipped: 0, pre_existing: 0, untested: 0 };
  runCases.forEach((rc) => { const s = rc.status || 'untested'; counts[s] = (counts[s] || 0) + 1; });

  new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Passou', 'Falhou', 'Bloqueado', 'Pulado', 'Pré-existente', 'Não testado'],
      datasets: [{
        data: [counts.passed, counts.failed, counts.blocked, counts.skipped, counts.pre_existing, counts.untested],
        backgroundColor: [cssVar('--st-passed'), cssVar('--st-failed'), cssVar('--st-blocked'), cssVar('--st-skipped'), cssVar('--st-preexisting'), cssVar('--st-untested-bg')],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: false,
      plugins: { legend: { display: false }, tooltip: { enabled: true } },
      cutout: '72%',
    },
  });
}

function casesTabHtml(groups) {
  return `
    <div class="toolbar" style="margin-bottom:12px;">
      <div class="toolbar-left">
        <label class="flex gap-8" style="cursor:pointer; font-size:12.5px;">
          <input type="checkbox" id="rc-select-all" />
          Selecionar todos
        </label>
      </div>
      <div class="flex gap-8">
        <button class="btn btn-sm" id="rc-assign-me">Atribuir para mim</button>
        <button class="btn btn-sm" id="rc-unassign">Desatribuir</button>
        <button class="btn btn-sm btn-danger" id="rc-remove">Remover</button>
      </div>
    </div>
    ${groups.map((g, gi) => {
      const suiteDuration = g.cases.reduce((sum, rc) => sum + (rc.duration_seconds || 0), 0);
      return `
      <div class="run-suite-group" data-depth="${g.depth}">
        <div class="run-suite-header" data-suite-toggle="${gi}" style="padding-left:${14 + g.depth * 18}px; cursor:pointer;">
          <div class="run-suite-path">
            <svg class="suite-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            <input type="checkbox" class="suite-select-all" data-suite="${gi}" onclick="event.stopPropagation()" />
            <span>${escapeHtml(g.title)}</span>
            <span class="text-muted" style="font-weight:400;">(${g.cases.length})</span>
          </div>
          <div class="run-suite-meta">
            <span class="mono">${formatDuration(suiteDuration)}</span>
            <div class="progress-bar run-suite-progress">${progressSegments(g.cases)}</div>
          </div>
        </div>
        <div class="run-suite-table-wrap" data-suite-panel="${gi}">
          <table>
            <thead><tr><th style="width:34px;"></th><th>ID</th><th>Membro</th><th>Status</th><th>Caso de teste</th><th>Duração</th><th>Prioridade</th></tr></thead>
            <tbody>
              ${g.cases.map((rc) => `
                <tr class="row-clickable" data-run-case-id="${rc.id}">
                  <td><input type="checkbox" class="rc-select" data-id="${rc.id}" data-suite="${gi}" /></td>
                  <td style="padding-left:${14 + g.depth * 18}px;"><span class="id-badge">${currentProject.code}-${rc.test_cases.seq}</span></td>
                  <td class="text-secondary" data-member-cell="${rc.id}"></td>
                  <td>${badge(rc.status)}</td>
                  <td style="font-weight:600;" title="${escapeHtml(rc.test_cases.title)}">${escapeHtml(rc.test_cases.title)}</td>
                  <td class="text-muted mono">${formatDuration(rc.duration_seconds)}</td>
                  <td>${badge(rc.test_cases.priority)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    }).join('')}
  `;
}

function defectsTabHtml(defectsForRun) {
  if (defectsForRun.length === 0) {
    return `<div class="card"><div class="empty-state"><h3>Nenhum defeito reportado</h3><p>Defeitos reportados durante esta execução aparecem aqui.</p></div></div>`;
  }
  return `
    <div class="card" style="padding:0;">
      <table>
        <thead><tr><th>ID</th><th>Título</th><th>Severidade</th><th>Status</th><th>Caso relacionado</th></tr></thead>
        <tbody>
          ${defectsForRun.map((d) => `
            <tr>
              <td><span class="id-badge">${currentProject.code}-B${d.seq}</span></td>
              <td style="font-weight:600;">${escapeHtml(d.title)}</td>
              <td>${badge(d.severity)}</td>
              <td>${badge(d.status)}</td>
              <td class="text-secondary">${escapeHtml(d._caseTitle || '—')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function computeTeamStats(runCases, profilesMap) {
  const byUser = {};
  runCases.forEach((rc) => {
    const uid = rc.assignee_id || rc.executed_by || 'unassigned';
    if (!byUser[uid]) byUser[uid] = { untested: 0, passed: 0, failed: 0, blocked: 0, skipped: 0, pre_existing: 0, duration: 0 };
    const s = rc.status || 'untested';
    byUser[uid][s] = (byUser[uid][s] || 0) + 1;
    byUser[uid].duration += rc.duration_seconds || 0;
  });
  return Object.entries(byUser).map(([uid, stats]) => ({
    name: uid === 'unassigned' ? 'Não atribuído' : profileName(uid, profilesMap),
    ...stats,
  }));
}

function teamTabHtml(runCases, profilesMap) {
  const rows = computeTeamStats(runCases, profilesMap);
  return `
    <div class="card" style="padding:0;">
      <table>
        <thead>
          <tr>
            <th>Usuário</th><th>Duração</th><th>Não testados</th><th>Passou</th><th>Falhou</th><th>Bloqueado</th><th>Pulado</th><th>Pré-existente</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td style="font-weight:600;">${escapeHtml(r.name)}</td>
              <td class="mono text-muted">${formatDuration(r.duration)}</td>
              <td>${r.untested || 0}</td>
              <td style="color:var(--st-passed); font-weight:600;">${r.passed || 0}</td>
              <td style="color:var(--st-failed); font-weight:600;">${r.failed || 0}</td>
              <td style="color:var(--st-blocked); font-weight:600;">${r.blocked || 0}</td>
              <td class="text-secondary">${r.skipped || 0}</td>
              <td style="color:var(--st-preexisting); font-weight:600;">${r.pre_existing || 0}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <p class="text-muted" style="font-size:12px; margin-top:10px;">
      Observação: o Mobatest usa "Pré-existente" no lugar de "Retest"/"Invalid" do Qase — são os status disponíveis neste app.
    </p>
  `;
}

function drawRunDetail(container, run, runCases, suites, defectsForRun, profilesMap) {
  const groups = groupRunCasesBySuite(runCases, suites);
  const orderedIds = flattenGroups(groups).map((rc) => rc.id);

  const TABS = [
    { key: 'cases', label: 'Casos de teste' },
    { key: 'defects', label: `Defeitos${defectsForRun.length ? ` (${defectsForRun.length})` : ''}` },
    { key: 'team', label: 'Estatísticas da equipe' },
  ];

  document.body.classList.add('has-run-sidebar');

  container.innerHTML = `
    <button class="btn btn-ghost btn-sm mb-8" id="back-to-runs" style="margin-bottom:14px;">← Voltar para execuções</button>

    <div class="flex gap-10" style="align-items:center; margin-bottom:14px;">
      <h2 style="font-size:19px;">${escapeHtml(run.title)}</h2>
      ${badge(run.status)}
      ${run.is_public ? '<span class="badge badge-medium">Link público ativo</span>' : ''}
    </div>
    <div class="text-muted" style="font-size:12.5px; margin-bottom:16px;">${escapeHtml(run.environment || 'Sem ambiente')} · Criada em ${formatDateTime(run.created_at)}</div>

    <div class="tabs" id="run-tabs">
      ${TABS.map((t) => `<div class="tab ${activeRunTab === t.key ? 'active' : ''}" data-tab="${t.key}">${t.label}</div>`).join('')}
    </div>

    <div class="run-layout">
      <div id="run-tab-content" class="run-layout-main">
        ${activeRunTab === 'cases' ? casesTabHtml(groups) : activeRunTab === 'defects' ? defectsTabHtml(defectsForRun) : teamTabHtml(runCases, profilesMap)}
      </div>
    </div>
    <div class="run-fixed-sidebar">
      ${drawRunSidebar(run, runCases, profilesMap)}
    </div>
  `;

  drawRunSidebarChart(runCases);

  // Preenche a coluna "Membro" (evita repetir escapeHtml em cada célula acima)
  runCases.forEach((rc) => {
    const cell = document.querySelector(`[data-member-cell="${rc.id}"]`);
    if (cell) cell.textContent = profileName(rc.assignee_id, profilesMap);
  });

  document.getElementById('back-to-runs').addEventListener('click', () => {
    setRouteSubId('test-runs', null);
    renderTestRunsPage(container);
  });

  document.querySelectorAll('#run-tabs .tab').forEach((tabEl) => {
    tabEl.addEventListener('click', () => {
      activeRunTab = tabEl.dataset.tab;
      drawRunDetail(container, run, runCases, suites, defectsForRun, profilesMap);
    });
  });

  document.getElementById('complete-run-btn')?.addEventListener('click', () => {
    confirmDialog('Marcar esta execução como concluída?', async () => {
      await supabase.from('test_runs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', run.id);
      toast('Execução concluída!');
      renderRunDetail(container, run.id);
    });
  });

  document.getElementById('cancel-run-btn')?.addEventListener('click', () => openCancelRunModal(container, run));

  document.getElementById('share-report-btn').addEventListener('click', () => openShareReportModal(container, run));
  document.getElementById('export-run-btn').addEventListener('click', () => openExportModal(run, groups, profilesMap));

  if (activeRunTab === 'cases') {
    function recalcSuiteVisibility() {
      const allGroups = Array.from(container.querySelectorAll('.run-suite-group'));
      const collapsedAncestorDepths = [];
      allGroups.forEach((group) => {
        const depth = parseInt(group.dataset.depth, 10);
        // Tira da pilha qualquer profundidade que não seja mais ancestral deste bloco
        while (collapsedAncestorDepths.length && collapsedAncestorDepths[collapsedAncestorDepths.length - 1] >= depth) {
          collapsedAncestorDepths.pop();
        }
        group.style.display = collapsedAncestorDepths.length > 0 ? 'none' : '';
        if (group.classList.contains('is-collapsed')) collapsedAncestorDepths.push(depth);
      });
    }

    document.querySelectorAll('[data-suite-toggle]').forEach((header) => {
      header.addEventListener('click', () => {
        header.closest('.run-suite-group').classList.toggle('is-collapsed');
        recalcSuiteVisibility();
      });
    });

    document.querySelectorAll('.suite-select-all').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        document.querySelectorAll(`.rc-select[data-suite="${cb.dataset.suite}"]`).forEach((rowCb) => {
          rowCb.checked = e.target.checked;
        });
      });
    });

    document.getElementById('rc-select-all')?.addEventListener('change', (e) => {
      document.querySelectorAll('.rc-select').forEach((cb) => { cb.checked = e.target.checked; });
      document.querySelectorAll('.suite-select-all').forEach((cb) => { cb.checked = e.target.checked; });
    });

    document.querySelectorAll('.rc-select').forEach((cb) => {
      cb.addEventListener('click', (e) => e.stopPropagation());
    });

    function getSelectedIds() {
      return Array.from(document.querySelectorAll('.rc-select:checked')).map((cb) => cb.dataset.id);
    }

    document.getElementById('rc-assign-me').addEventListener('click', async () => {
      const ids = getSelectedIds();
      if (ids.length === 0) { toast('Selecione ao menos um caso.', 'error'); return; }
      const { error } = await supabase.from('test_run_cases').update({ assignee_id: currentUser.id }).in('id', ids);
      if (error) { toast(error.message, 'error'); return; }
      toast(`${ids.length} caso(s) atribuído(s) a você.`);
      renderRunDetail(container, run.id);
    });

    document.getElementById('rc-unassign').addEventListener('click', async () => {
      const ids = getSelectedIds();
      if (ids.length === 0) { toast('Selecione ao menos um caso.', 'error'); return; }
      const { error } = await supabase.from('test_run_cases').update({ assignee_id: null }).in('id', ids);
      if (error) { toast(error.message, 'error'); return; }
      toast(`${ids.length} caso(s) desatribuído(s).`);
      renderRunDetail(container, run.id);
    });

    document.getElementById('rc-remove').addEventListener('click', () => {
      const ids = getSelectedIds();
      if (ids.length === 0) { toast('Selecione ao menos um caso.', 'error'); return; }
      confirmDialog(`Remover ${ids.length} caso(s) desta execução? Isso não exclui o caso de teste, só tira ele desta execução.`, async () => {
        const { error } = await supabase.from('test_run_cases').delete().in('id', ids);
        if (error) { toast(error.message, 'error'); return; }
        toast('Casos removidos da execução.');
        renderRunDetail(container, run.id);
      });
    });

    container.querySelectorAll('tr[data-run-case-id]').forEach((tr) => {
      tr.addEventListener('click', () => {
        openRunCaseDrawer(container, run.id, tr.dataset.runCaseId, orderedIds);
      });
    });
  }
}

// ------------------------------------------------------------
// Compartilhar relatório (link público somente leitura)
// ------------------------------------------------------------
function buildPublicReportUrl(token) {
  const base = window.location.href.split('#')[0].replace(/index\.html.*$/, '');
  return `${base}report.html?token=${token}`;
}

async function openShareReportModal(container, run) {
  // Proteção: execuções criadas antes desse recurso existir podem não ter
  // um token ainda. Gera e salva um agora mesmo, se for o caso.
  if (!run.report_token) {
    const generatedToken = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const { error: tokenError } = await supabase.from('test_runs').update({ report_token: generatedToken }).eq('id', run.id);
    if (!tokenError) run.report_token = generatedToken;
  }

  const publicUrl = buildPublicReportUrl(run.report_token);

  openModal({
    title: 'Compartilhar relatório',
    bodyHtml: `
      <div class="field">
        <label class="flex gap-8" style="cursor:pointer; align-items:flex-start;">
          <input type="checkbox" id="share-public-toggle" ${run.is_public ? 'checked' : ''} style="margin-top:3px;" />
          <span>Ativar link público — qualquer pessoa com o link pode <strong>visualizar</strong> esta execução, sem fazer login e sem conseguir alterar nada. Desative quando quiser revogar o acesso.</span>
        </label>
      </div>
      <div id="share-link-wrap" class="${run.is_public ? '' : 'hidden'}">
        <div class="field">
          <label>Link público desta execução</label>
          <div class="flex gap-8">
            <input type="text" id="share-link-input" value="${escapeHtml(publicUrl)}" readonly style="flex:1;" />
            <button class="btn btn-sm" id="share-copy-btn">Copiar</button>
          </div>
        </div>
      </div>
      <div class="field-hint">Sem o link ativado, apenas quem tem acesso ao Mobatest (login) consegue ver esta execução.</div>
    `,
    footerHtml: `<button class="btn btn-primary" id="share-done-btn">Concluído</button>`,
  });

  document.getElementById('share-public-toggle').addEventListener('change', async (e) => {
    const isPublic = e.target.checked;
    const { error } = await supabase.from('test_runs').update({ is_public: isPublic }).eq('id', run.id);
    if (error) { toast(error.message, 'error'); e.target.checked = !isPublic; return; }
    run.is_public = isPublic;
    document.getElementById('share-link-wrap').classList.toggle('hidden', !isPublic);
    toast(isPublic ? 'Link público ativado!' : 'Link público desativado.');
  });

  document.getElementById('share-copy-btn')?.addEventListener('click', () => {
    const input = document.getElementById('share-link-input');
    input.select();
    navigator.clipboard?.writeText(input.value).catch(() => {});
    toast('Link copiado!');
  });

  document.getElementById('share-done-btn').addEventListener('click', () => {
    closeModal();
    renderRunDetail(container, run.id);
  });
}

// ------------------------------------------------------------
// Exportar (CSV / PDF) com campo de observações
// ------------------------------------------------------------
function openExportModal(run, groups, profilesMap) {
  openModal({
    title: 'Exportar execução',
    bodyHtml: `
      <div class="field">
        <label>Formato</label>
        <select id="export-format">
          <option value="csv">CSV</option>
          <option value="pdf">PDF (via impressão do navegador)</option>
        </select>
      </div>
      <div class="field">
        <label>Observações</label>
        <textarea id="export-notes" rows="3" placeholder="Alguma ressalva ou observação para este relatório?">${escapeHtml(run.report_notes || '')}</textarea>
        <div class="field-hint">Fica salva junto com a execução para a próxima exportação.</div>
      </div>
    `,
    footerHtml: `
      <button class="btn" id="export-cancel">Cancelar</button>
      <button class="btn btn-primary" id="export-go">Exportar</button>
    `,
  });

  document.getElementById('export-cancel').addEventListener('click', closeModal);

  document.getElementById('export-go').addEventListener('click', async () => {
    const format = document.getElementById('export-format').value;
    const notes = document.getElementById('export-notes').value.trim();

    const btn = document.getElementById('export-go');
    setLoading(btn, true, 'Exportando...');
    await supabase.from('test_runs').update({ report_notes: notes }).eq('id', run.id);
    run.report_notes = notes;
    setLoading(btn, false);

    closeModal();
    if (format === 'csv') exportRunAsCSV(run, groups, notes, profilesMap);
    else exportRunAsPDF(run, groups, notes, profilesMap);
  });
}

function csvEscape(val) {
  const s = String(val ?? '');
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportRunAsCSV(run, groups, notes, profilesMap) {
  const lines = [];
  lines.push(['Execução', run.title].map(csvEscape).join(','));
  lines.push(['Ambiente', run.environment || '—'].map(csvEscape).join(','));
  lines.push(['Observações', notes || '—'].map(csvEscape).join(','));
  lines.push('');
  lines.push(['ID', 'Suíte', 'Título', 'Prioridade', 'Status', 'Responsável', 'Duração', 'Comentário'].map(csvEscape).join(','));

  groups.forEach((g) => {
    g.cases.forEach((rc) => {
      lines.push([
        `${currentProject.code}-${rc.test_cases.seq}`,
        g.title,
        rc.test_cases.title,
        rc.test_cases.priority,
        statusLabel(rc.status),
        profileName(rc.assignee_id, profilesMap),
        formatDuration(rc.duration_seconds),
        stripHtml(rc.comment || ''),
      ].map(csvEscape).join(','));
    });
  });

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${run.title.replace(/[^\w\-]+/g, '_')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('CSV exportado!');
}

function exportRunAsPDF(run, groups, notes, profilesMap) {
  const w = window.open('', '_blank');
  if (!w) { toast('Seu navegador bloqueou a janela de exportação. Permita pop-ups para este site.', 'error'); return; }

  const allCases = flattenGroups(groups);
  const counts = { passed: 0, failed: 0, blocked: 0, skipped: 0, pre_existing: 0, untested: 0 };
  allCases.forEach((rc) => { const s = rc.status || 'untested'; counts[s] = (counts[s] || 0) + 1; });
  const total = allCases.length || 1;
  const executed = allCases.filter((rc) => rc.status && rc.status !== 'untested').length;
  const pct = Math.round((executed / total) * 100);
  const totalDurationSeconds = allCases.reduce((sum, rc) => sum + (rc.duration_seconds || 0), 0);

  const sectionsHtml = groups.map((g) => `
    <h3>${escapeHtml(g.title)}</h3>
    <table>
      <thead><tr><th>ID</th><th>Título</th><th>Prioridade</th><th>Status</th><th>Responsável</th><th>Duração</th></tr></thead>
      <tbody>
        ${g.cases.map((rc) => `
          <tr>
            <td>${currentProject.code}-${rc.test_cases.seq}</td>
            <td>${escapeHtml(rc.test_cases.title)}</td>
            <td>${escapeHtml(rc.test_cases.priority)}</td>
            <td>${escapeHtml(statusLabel(rc.status))}</td>
            <td>${escapeHtml(profileName(rc.assignee_id, profilesMap))}</td>
            <td>${formatDuration(rc.duration_seconds)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `).join('');

  const summaryRows = [
    ['Não testado', counts.untested, '#8B98A5'],
    ['Passou', counts.passed, '#0E9F6E'],
    ['Falhou', counts.failed, '#E02424'],
    ['Bloqueado', counts.blocked, '#C27803'],
    ['Pré-existente', counts.pre_existing, '#7E3AF2'],
  ].map(([label, value, color]) => `
    <div class="legend-row"><span class="dot" style="background:${color};"></span>${escapeHtml(label)} (${value})</div>
  `).join('');

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(run.title)}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"><\/script>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; padding: 28px; color: #1a1a1a; }
      h1 { margin-bottom: 2px; }
      h3 { margin-top: 26px; border-bottom: 1px solid #ccc; padding-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 12px; }
      th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
      th { background: #f0f0f0; }
      .meta { color: #555; font-size: 13px; margin-bottom: 10px; }
      .notes { background: #fff8e1; border: 1px solid #eab308; padding: 10px 14px; margin: 14px 0; border-radius: 6px; font-size: 13px; }
      .summary { display: flex; gap: 30px; align-items: center; border: 1px solid #ddd; border-radius: 10px; padding: 18px 22px; margin-bottom: 20px; flex-wrap: wrap; }
      .summary canvas { width: 140px !important; height: 140px !important; }
      .legend { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; }
      .legend-row { display: flex; align-items: center; gap: 8px; }
      .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
      .info-grid { display: flex; gap: 34px; flex-wrap: wrap; font-size: 12.5px; }
      .info-grid .label { color: #777; font-size: 11px; text-transform: uppercase; margin-bottom: 3px; }
      .info-grid .value { font-weight: 700; font-size: 14px; }
      .rate { font-size: 26px; font-weight: 800; }
      @media print { a { display: none; } }
    </style>
  </head><body>
    <h1>${escapeHtml(run.title)}</h1>
    <div class="meta">${escapeHtml(run.environment || 'Sem ambiente')} — Criada em ${formatDateTime(run.created_at)}</div>
    ${notes ? `<div class="notes"><strong>Observações:</strong><br>${escapeHtml(notes).replace(/\n/g, '<br>')}</div>` : ''}

    <div class="summary">
      <canvas id="chart" width="140" height="140"></canvas>
      <div class="legend">${summaryRows}</div>
      <div class="info-grid">
        <div><div class="label">Taxa de conclusão</div><div class="rate">${pct}%</div><div class="meta" style="margin:0;">${executed} de ${allCases.length}</div></div>
        <div><div class="label">Iniciado por</div><div class="value">${escapeHtml(profileName(run.created_by, profilesMap))}</div></div>
        <div><div class="label">Início</div><div class="value">${formatDateTime(run.created_at)}</div></div>
        <div><div class="label">Tempo total testando</div><div class="value">${totalDurationSeconds > 0 ? formatDuration(totalDurationSeconds) : '—'}</div></div>
      </div>
    </div>

    ${sectionsHtml}
    <script>
      window.addEventListener('load', function () {
        try {
          new Chart(document.getElementById('chart'), {
            type: 'doughnut',
            data: {
              labels: ['Não testado','Passou','Falhou','Bloqueado','Pré-existente'],
              datasets: [{
                data: [${counts.untested}, ${counts.passed}, ${counts.failed}, ${counts.blocked}, ${counts.pre_existing}],
                backgroundColor: ['#8B98A5','#0E9F6E','#E02424','#C27803','#7E3AF2'],
                borderWidth: 0,
              }],
            },
            options: { responsive: false, animation: false, plugins: { legend: { display: false } }, cutout: '68%' },
          });
        } catch (e) { /* Chart.js pode falhar sem internet; PDF ainda funciona sem o gráfico */ }
        setTimeout(function () { window.focus(); window.print(); }, 250);
      });
    <\/script>
  </body></html>`);
  w.document.close();
}

function renderReadonly(html, emptyLabel) {
  const value = (html || '').trim();
  if (!value) return `<div class="readonly-block is-empty">${escapeHtml(emptyLabel)}</div>`;
  return `<div class="readonly-block">${value}</div>`;
}

// ------------------------------------------------------------
// Painel lateral de um caso dentro da execução
// (timer de duração + avanço automático para o próximo caso)
// ------------------------------------------------------------
async function openRunCaseDrawer(container, runId, runCaseId, orderedIds) {
  const [{ data: rc }, { data: suites }] = await Promise.all([
    supabase
      .from('test_run_cases')
      .select('*, test_cases(title, seq, priority, suite_id, description, preconditions, repro_steps, postconditions)')
      .eq('id', runCaseId)
      .single(),
    supabase.from('test_suites').select('id, title').eq('project_id', currentProject.id),
  ]);
  if (!rc) { toast('Não foi possível carregar este caso.', 'error'); return; }

  setRouteSubId('test-runs', `${runId}/${runCaseId}`);

  const tc = rc.test_cases;
  const suite = (suites || []).find((s) => s.id === tc.suite_id);

  const { data: history } = await supabase
    .from('test_run_cases')
    .select('status, executed_at, test_runs(title, environment)')
    .eq('test_case_id', rc.test_case_id)
    .order('executed_at', { ascending: false });

  const historyRows = (history || []).filter((h) => h.executed_at);

  // Timer de duração — inicia ao abrir, para ao marcar um resultado
  const openedAt = Date.now();
  let timerHandle = null;

  function formatMMSS(totalSeconds) {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function stopTimer() {
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
  }

  openDrawer({
    width: '640px',
    eyebrow: `<span class="id-badge">${currentProject.code}-${tc.seq}</span>${suite ? ` · ${escapeHtml(suite.title)}` : ''}`,
    title: `<h2 style="font-size:18px; margin:2px 0 0;">${escapeHtml(tc.title)}</h2>`,
    tabs: [{ key: 'execution', label: 'Execução' }, { key: 'history', label: 'Histórico de execuções' }],
    activeTab: 'execution',
    bodyHtmlByTab: {
      execution: `
        <div class="drawer-section">
          <div class="drawer-section-label" style="display:flex; justify-content:space-between; align-items:center;">
            <span>Marcar resultado</span>
            <span class="mono text-secondary" id="rc-timer" style="font-size:12px;">⏱ 00:00</span>
          </div>
          <div class="status-choice-row">
            ${STATUS_DEFS.map((s) => `
              <button type="button" class="status-choice-btn ${s.key} ${rc.status === s.key ? 'is-active' : ''}" data-status="${s.key}">
                ${iconSpan(s.key)} ${escapeHtml(s.label)}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="drawer-section">
          <div class="drawer-section-label">Descrição</div>
          ${renderReadonly(tc.description, 'Sem descrição.')}
        </div>
        <div class="drawer-section">
          <div class="drawer-section-label">Pré-requisitos</div>
          ${renderReadonly(tc.preconditions, 'Não definido.')}
        </div>
        <div class="drawer-section">
          <div class="drawer-section-label">Passos para reprodução</div>
          ${renderReadonly(tc.repro_steps, 'Não definido.')}
        </div>
        <div class="drawer-section">
          <div class="drawer-section-label">Resultado esperado</div>
          ${renderReadonly(tc.postconditions, 'Não definido.')}
        </div>
      `,
      history: historyRows.length === 0 ? `<div class="drawer-empty-tab">Nenhuma execução anterior registrada para este caso.</div>` : `
        <table>
          <thead><tr><th>Execução</th><th>Ambiente</th><th>Resultado</th><th>Quando</th></tr></thead>
          <tbody>
            ${historyRows.map((h) => `
              <tr>
                <td style="font-weight:600;">${escapeHtml(h.test_runs?.title || '—')}</td>
                <td class="text-secondary">${escapeHtml(h.test_runs?.environment || '—')}</td>
                <td>${badge(h.status)}</td>
                <td class="text-muted">${formatDateTime(h.executed_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `,
    },
    onClose: () => {
      stopTimer();
      setRouteSubId('test-runs', runId);
    },
  });

  const timerEl = document.getElementById('rc-timer');
  timerHandle = setInterval(() => {
    if (timerEl) timerEl.textContent = '⏱ ' + formatMMSS((Date.now() - openedAt) / 1000);
  }, 1000);

  async function applyStatus(status, extra = {}) {
    stopTimer();
    const durationSeconds = Math.round((Date.now() - openedAt) / 1000);

    const { error } = await supabase.from('test_run_cases').update({
      status, executed_at: new Date().toISOString(), executed_by: currentUser.id, duration_seconds: durationSeconds, ...extra,
    }).eq('id', rc.id);
    if (error) { toast(error.message, 'error'); return; }

    toast('Status atualizado!');
    await renderRunDetail(container, runId);

    // Avança automaticamente para o próximo caso da lista (ordem estável)
    const currentIndex = orderedIds.indexOf(runCaseId);
    const nextId = orderedIds[currentIndex + 1];
    if (nextId) {
      openRunCaseDrawer(container, runId, nextId, orderedIds);
    } else {
      closeDrawer();
      toast('Você chegou ao último caso desta execução!');
    }
  }

  document.querySelectorAll('.status-choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const status = btn.dataset.status;
      if (status === 'failed') {
        openAddBugModal(rc, tc, applyStatus);
      } else {
        applyStatus(status);
      }
    });
  });
}

// ------------------------------------------------------------
// Modal "Adicionar defeito" — abre ao marcar um caso como Falhou.
// Permite criar um bug novo (com template Problema/Passos/Resultado
// esperado em BDD) ou vincular a um defeito já existente.
// ------------------------------------------------------------
async function openCancelRunModal(container, run) {
  const { data: reasons } = await supabase.from('cancellation_reasons').select('*').eq('is_active', true).order('label');

  openModal({
    title: 'Cancelar execução',
    bodyHtml: `
      <p class="text-secondary" style="font-size:13px; margin:0 0 16px;">Os resultados já registrados continuam salvos, mas a execução sai da lista de execuções ativas.</p>
      <div class="field">
        <label>Motivo do cancelamento <span style="color:var(--st-failed);">*</span></label>
        <select id="cancel-reason">
          <option value="">— Selecione —</option>
          ${(reasons || []).map((r) => `<option value="${r.id}">${escapeHtml(r.label)}</option>`).join('')}
        </select>
        ${(reasons || []).length === 0 ? '<div class="field-hint">Nenhum motivo cadastrado — peça a um Admin pra cadastrar em "Cadastros".</div>' : ''}
      </div>
    `,
    footerHtml: `
      <button class="btn" id="cancel-run-close">Voltar</button>
      <button class="btn btn-danger" id="cancel-run-confirm">Cancelar execução</button>
    `,
  });

  document.getElementById('cancel-run-close').addEventListener('click', closeModal);
  document.getElementById('cancel-run-confirm').addEventListener('click', async () => {
    const reasonId = document.getElementById('cancel-reason').value;
    if (!reasonId) { toast('Selecione o motivo do cancelamento.', 'error'); return; }

    const btn = document.getElementById('cancel-run-confirm');
    setLoading(btn, true);
    const { error } = await supabase.from('test_runs').update({
      status: 'cancelled', completed_at: new Date().toISOString(), cancellation_reason_id: reasonId,
    }).eq('id', run.id);
    setLoading(btn, false);

    if (error) { toast(error.message, 'error'); return; }
    closeModal();
    toast('Execução cancelada.');
    renderRunDetail(container, run.id);
  });
}

async function openAddBugModal(rc, tc, applyStatus) {
  const [{ data: existingDefects }, reasons, devs, pos] = await Promise.all([
    supabase.from('defects').select('id, seq, title').eq('project_id', currentProject.id).order('created_at', { ascending: false }),
    fetchFailureReasons(),
    fetchContacts('dev'),
    fetchContacts('po'),
  ]);

  const defaultTitle = `Falha em: ${tc.title}`;
  const defaultCard = BUG_CARD_TEMPLATE;

  openModal({
    title: 'Adicionar defeito',
    size: 'lg',
    closeOnOverlayClick: false,
    bodyHtml: `
      <div class="tabs" style="margin-bottom:16px;">
        <div class="tab active" data-bugsrc="new">Criar novo bug</div>
        <div class="tab" data-bugsrc="existing">Adicionar a bug existente</div>
      </div>

      <div id="bug-new-panel">
        <div class="field">
          <label>Título do bug</label>
          <input type="text" id="bug-title" value="${escapeHtml(defaultTitle)}" />
        </div>
        <div class="field">
          <label>Card</label>
          <div id="bug-card-editor"></div>
        </div>
        <div class="field">
          <label>Severidade</label>
          <div class="status-choice-row">
            ${SEVERITY_DEFS.map((s) => `
              <button type="button" class="bug-severity-btn status-choice-btn ${s.key === 'normal' ? 'is-active' : ''}" data-severity="${s.key}" style="background:var(--bg-elevated); color:var(--text-secondary);">
                ${escapeHtml(s.label)}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="field">
          <label>Motivo da falha <span style="color:var(--st-failed);">*</span></label>
          <select id="bug-reason">${failureReasonOptionsHtml(reasons)}</select>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Dev responsável</label>
            <select id="bug-dev">${contactOptionsHtml(devs)}</select>
          </div>
          <div class="field">
            <label>PO responsável</label>
            <select id="bug-po">${contactOptionsHtml(pos)}</select>
          </div>
        </div>
      </div>

      <div id="bug-existing-panel" class="hidden">
        <div class="field">
          <label>Selecione o defeito já existente</label>
          <select id="bug-existing-select">
            <option value="">— Selecione —</option>
            ${(existingDefects || []).map((d) => `<option value="${d.id}">${currentProject.code}-B${d.seq} — ${escapeHtml(d.title)}</option>`).join('')}
          </select>
          ${(existingDefects || []).length === 0 ? '<div class="field-hint">Nenhum defeito cadastrado ainda neste projeto.</div>' : ''}
        </div>
      </div>
    `,
    footerHtml: `
      <button class="btn" id="bug-cancel">Cancelar</button>
      <button class="btn btn-primary" id="bug-save">Salvar e marcar como falhou</button>
    `,
  });

  const cardEditor = createRichEditor(document.getElementById('bug-card-editor'), {
    value: defaultCard,
    placeholder: 'Descreva o problema encontrado',
    minHeight: '180px',
  });

  let bugSource = 'new';
  let selectedSeverity = 'normal';

  document.querySelectorAll('.tab[data-bugsrc]').forEach((tabEl) => {
    tabEl.addEventListener('click', () => {
      bugSource = tabEl.dataset.bugsrc;
      document.querySelectorAll('.tab[data-bugsrc]').forEach((t) => t.classList.toggle('active', t === tabEl));
      document.getElementById('bug-new-panel').classList.toggle('hidden', bugSource !== 'new');
      document.getElementById('bug-existing-panel').classList.toggle('hidden', bugSource !== 'existing');
    });
  });

  document.querySelectorAll('.bug-severity-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedSeverity = btn.dataset.severity;
      document.querySelectorAll('.bug-severity-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
    });
  });

  document.getElementById('bug-cancel').addEventListener('click', closeModal);

  document.getElementById('bug-save').addEventListener('click', async () => {
    const btn = document.getElementById('bug-save');

    if (bugSource === 'existing') {
      const defectId = document.getElementById('bug-existing-select').value;
      if (!defectId) { toast('Selecione um defeito existente.', 'error'); return; }
      const chosen = (existingDefects || []).find((d) => d.id === defectId);
      setLoading(btn, true);
      closeModal();
      await applyStatus('failed', { comment: `Falha já mapeada no defeito ${currentProject.code}-B${chosen.seq} — ${chosen.title}` });
      return;
    }

    const title = document.getElementById('bug-title').value.trim();
    if (!title) { toast('Dê um título ao bug.', 'error'); return; }
    const failure_reason_id = document.getElementById('bug-reason').value;
    if (!failure_reason_id) { toast('Selecione o motivo da falha.', 'error'); return; }
    const description = cardEditor.getHTML();

    setLoading(btn, true, 'Salvando...');
    const { error } = await supabase.from('defects').insert({
      title,
      description,
      severity: selectedSeverity,
      priority: 'medium',
      failure_reason_id,
      dev_contact_id: document.getElementById('bug-dev').value || null,
      po_contact_id: document.getElementById('bug-po').value || null,
      project_id: currentProject.id,
      reporter_id: currentUser.id,
      test_case_id: rc.test_case_id,
      test_run_case_id: rc.id,
    });
    if (error) { setLoading(btn, false); toast(error.message, 'error'); return; }

    closeModal();
    toast('Defeito criado!');
    await applyStatus('failed');
  });
}

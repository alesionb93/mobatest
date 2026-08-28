import { supabase } from '../supabaseClient.js';
import { currentUser } from '../auth.js';
import { currentProject } from '../state.js';
import { openModal, closeModal, toast, setLoading, escapeHtml, formatDate, confirmDialog } from '../ui.js';

export async function renderTestPlansPage(container) {
  if (!currentProject) {
    container.innerHTML = `<div class="empty-state"><h3>Nenhum projeto selecionado</h3><p>Crie ou selecione um projeto para ver planos de teste.</p></div>`;
    return;
  }
  container.innerHTML = `<div class="flex" style="justify-content:center; padding:60px;"><span class="spinner"></span></div>`;

  const { data: plans } = await supabase
    .from('test_plans')
    .select('*, test_plan_cases(test_case_id)')
    .eq('project_id', currentProject.id)
    .order('created_at', { ascending: false });

  renderList(container, plans || []);
}

function renderList(container, plans) {
  container.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left"><span class="text-secondary">${plans.length} plano(s) de teste</span></div>
      <button class="btn btn-primary" id="new-plan-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        Novo plano
      </button>
    </div>

    ${plans.length === 0 ? `
      <div class="card"><div class="empty-state">
        <h3>Nenhum plano de teste ainda</h3>
        <p>Agrupe casos de teste relacionados em um plano para organizar ciclos de teste.</p>
      </div></div>
    ` : `
      <div class="grid grid-3">
        ${plans.map((p) => `
          <div class="card row-clickable" data-plan-id="${p.id}">
            <div style="font-weight:700; font-size:15px; margin-bottom:6px;">${escapeHtml(p.title)}</div>
            <p class="text-secondary" style="font-size:13px; margin:0 0 12px; min-height:36px;">${escapeHtml(p.description || 'Sem descrição.')}</p>
            <div class="flex" style="justify-content:space-between; font-size:12px;">
              <span class="text-muted">${p.test_plan_cases.length} caso(s)</span>
              <span class="text-muted">${formatDate(p.created_at)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;

  document.getElementById('new-plan-btn').addEventListener('click', () => openPlanModal(container));
  container.querySelectorAll('[data-plan-id]').forEach((el) => {
    el.addEventListener('click', () => {
      const plan = plans.find((p) => p.id === el.dataset.planId);
      openPlanModal(container, plan);
    });
  });
}

async function openPlanModal(container, existing = null) {
  const [{ data: cases }, { data: suites }] = await Promise.all([
    supabase.from('test_cases').select('id, title, seq, suite_id').eq('project_id', currentProject.id).order('seq'),
    supabase.from('test_suites').select('id, title, parent_suite_id, position').eq('project_id', currentProject.id).order('position'),
  ]);

  const allCasesLocal = cases || [];
  const allSuitesLocal = suites || [];
  const selectedIds = new Set((existing?.test_plan_cases || []).map((tpc) => tpc.test_case_id));

  const suitesById = {};
  allSuitesLocal.forEach((s) => { suitesById[s.id] = s; });
  const byParent = {};
  allSuitesLocal.forEach((s) => { const k = s.parent_suite_id || 'root'; (byParent[k] = byParent[k] || []).push(s); });
  const casesBySuite = {};
  allCasesLocal.forEach((c) => { const k = c.suite_id || 'none'; (casesBySuite[k] = casesBySuite[k] || []).push(c); });

  function getAllCaseIdsUnder(suiteId) {
    let ids = (casesBySuite[suiteId] || []).map((c) => c.id);
    (byParent[suiteId] || []).forEach((child) => { ids = ids.concat(getAllCaseIdsUnder(child.id)); });
    return ids;
  }

  function renderSuiteNode(suite, depth) {
    const childSuites = byParent[suite.id] || [];
    const directCases = casesBySuite[suite.id] || [];
    const totalUnder = getAllCaseIdsUnder(suite.id).length;

    return `
      <div class="plan-suite-node">
        <div class="plan-suite-row" style="padding-left:${depth * 18}px;">
          <button type="button" class="suite-collapse-toggle" data-plan-toggle="${suite.id}" title="Recolher/expandir">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <input type="checkbox" class="plan-suite-check" data-suite-check="${suite.id}" />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; color:var(--text-muted);"><path d="M3 7v11a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-7l-2-2H5a2 2 0 00-2 2z"/></svg>
          <span style="flex:1; font-weight:600;">${escapeHtml(suite.title)}</span>
          <span class="text-muted" style="font-size:11px;">${totalUnder}</span>
        </div>
        <div class="plan-suite-children" data-suite-children="${suite.id}">
          ${directCases.map((c) => `
            <label class="plan-case-row" style="padding-left:${(depth + 1) * 18}px;">
              <input type="checkbox" class="plan-case-check" data-suite-check="${suite.id}" value="${c.id}" ${selectedIds.has(c.id) ? 'checked' : ''} />
              <span class="id-badge">${currentProject.code}-${c.seq}</span>
              <span>${escapeHtml(c.title)}</span>
            </label>
          `).join('')}
          ${childSuites.map((child) => renderSuiteNode(child, depth + 1)).join('')}
        </div>
      </div>
    `;
  }

  const rootSuites = byParent.root || [];
  const noSuiteCases = casesBySuite.none || [];

  const treeHtml = `
    ${rootSuites.map((s) => renderSuiteNode(s, 0)).join('')}
    ${noSuiteCases.length > 0 ? `
      <div class="plan-suite-node">
        <div class="plan-suite-row">
          <span style="width:16px;"></span>
          <input type="checkbox" class="plan-suite-check" data-suite-check="none" />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; color:var(--text-muted);"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
          <span style="flex:1; font-weight:600;">Sem suíte</span>
          <span class="text-muted" style="font-size:11px;">${noSuiteCases.length}</span>
        </div>
        <div class="plan-suite-children" data-suite-children="none">
          ${noSuiteCases.map((c) => `
            <label class="plan-case-row" style="padding-left:18px;">
              <input type="checkbox" class="plan-case-check" data-suite-check="none" value="${c.id}" ${selectedIds.has(c.id) ? 'checked' : ''} />
              <span class="id-badge">${currentProject.code}-${c.seq}</span>
              <span>${escapeHtml(c.title)}</span>
            </label>
          `).join('')}
        </div>
      </div>
    ` : ''}
    ${allCasesLocal.length === 0 ? '<p class="text-muted" style="padding:8px;">Nenhum caso de teste disponível.</p>' : ''}
  `;

  openModal({
    title: existing ? 'Editar plano de teste' : 'Novo plano de teste',
    size: 'lg',
    bodyHtml: `
      <div class="field">
        <label>Título</label>
        <input type="text" id="plan-title" value="${escapeHtml(existing?.title || '')}" placeholder="Ex: Ciclo de release 2.4" />
      </div>
      <div class="field">
        <label>Descrição</label>
        <textarea id="plan-desc" rows="2" placeholder="Objetivo deste plano">${escapeHtml(existing?.description || '')}</textarea>
      </div>
      <div class="field">
        <label style="display:flex; justify-content:space-between; align-items:center;">
          <span>Casos de teste incluídos</span>
          <span id="plan-selected-count" class="text-muted" style="font-size:12px; font-weight:400;"></span>
        </label>
        <div id="plan-case-tree" style="max-height:320px; overflow-y:auto; border:1px solid var(--border); border-radius:8px; padding:6px;">
          ${treeHtml}
        </div>
      </div>
    `,
    footerHtml: `
      ${existing ? '<button class="btn btn-danger" id="plan-delete" style="margin-right:auto;">Excluir</button>' : ''}
      <button class="btn" id="plan-cancel">Cancelar</button>
      <button class="btn btn-primary" id="plan-save">${existing ? 'Salvar alterações' : 'Criar plano'}</button>
    `,
  });

  const tree = document.getElementById('plan-case-tree');

  function updateSelectedCount() {
    const count = tree.querySelectorAll('.plan-case-check:checked').length;
    document.getElementById('plan-selected-count').textContent = `${count} selecionado(s)`;
  }

  function refreshSuiteState(suiteId) {
    let current = suiteId;
    while (current) {
      const suiteCheckbox = tree.querySelector(`.plan-suite-check[data-suite-check="${current}"]`);
      const childrenWrap = tree.querySelector(`[data-suite-children="${current}"]`);
      if (suiteCheckbox && childrenWrap) {
        const caseChecks = childrenWrap.querySelectorAll('.plan-case-check');
        const total = caseChecks.length;
        const checkedCount = Array.from(caseChecks).filter((cb) => cb.checked).length;
        suiteCheckbox.checked = total > 0 && checkedCount === total;
        suiteCheckbox.indeterminate = checkedCount > 0 && checkedCount < total;
      }
      const suite = suitesById[current];
      current = suite ? suite.parent_suite_id : null;
    }
  }

  // Inicializa estado tri-state de todas as suítes com base na seleção atual
  [...rootSuites, ...allSuitesLocal].forEach((s) => refreshSuiteState(s.id));
  if (noSuiteCases.length > 0) refreshSuiteState('none');
  updateSelectedCount();

  tree.querySelectorAll('[data-plan-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.planToggle;
      const childrenWrap = tree.querySelector(`[data-suite-children="${id}"]`);
      const collapsed = childrenWrap.style.display === 'none';
      childrenWrap.style.display = collapsed ? '' : 'none';
      btn.querySelector('svg').style.transform = collapsed ? '' : 'rotate(-90deg)';
    });
  });

  tree.querySelectorAll('.plan-suite-check').forEach((cb) => {
    cb.addEventListener('change', () => {
      const suiteId = cb.dataset.suiteCheck;
      const childrenWrap = tree.querySelector(`[data-suite-children="${suiteId}"]`);
      childrenWrap.querySelectorAll('.plan-case-check').forEach((c) => { c.checked = cb.checked; });
      childrenWrap.querySelectorAll('.plan-suite-check').forEach((c) => { c.checked = cb.checked; c.indeterminate = false; });
      const suite = suitesById[suiteId];
      if (suite) refreshSuiteState(suite.parent_suite_id);
      updateSelectedCount();
    });
  });

  tree.querySelectorAll('.plan-case-check').forEach((cb) => {
    cb.addEventListener('change', () => {
      refreshSuiteState(cb.dataset.suiteCheck);
      updateSelectedCount();
    });
  });

  document.getElementById('plan-cancel').addEventListener('click', closeModal);

  if (existing) {
    document.getElementById('plan-delete').addEventListener('click', () => {
      confirmDialog('Excluir este plano de teste?', async () => {
        const { error } = await supabase.from('test_plans').delete().eq('id', existing.id);
        if (error) { toast(error.message, 'error'); return; }
        closeModal();
        toast('Plano excluído.');
        renderTestPlansPage(container);
      });
    });
  }

  document.getElementById('plan-save').addEventListener('click', async () => {
    const title = document.getElementById('plan-title').value.trim();
    if (!title) { toast('Dê um título ao plano.', 'error'); return; }
    const description = document.getElementById('plan-desc').value.trim();
    const chosenCaseIds = Array.from(tree.querySelectorAll('.plan-case-check:checked')).map((cb) => cb.value);

    const btn = document.getElementById('plan-save');
    setLoading(btn, true);

    let planId = existing?.id;
    if (existing) {
      const { error } = await supabase.from('test_plans').update({ title, description }).eq('id', existing.id);
      if (error) { setLoading(btn, false); toast(error.message, 'error'); return; }
      await supabase.from('test_plan_cases').delete().eq('test_plan_id', planId);
    } else {
      const { data, error } = await supabase.from('test_plans').insert({
        project_id: currentProject.id, title, description, created_by: currentUser.id,
      }).select().single();
      if (error) { setLoading(btn, false); toast(error.message, 'error'); return; }
      planId = data.id;
    }

    if (chosenCaseIds.length > 0) {
      const rows = chosenCaseIds.map((tcId) => ({ test_plan_id: planId, test_case_id: tcId }));
      const { error: tpcError } = await supabase.from('test_plan_cases').insert(rows);
      if (tpcError) { setLoading(btn, false); toast(tpcError.message, 'error'); return; }
    }

    closeModal();
    toast(existing ? 'Plano atualizado!' : 'Plano criado!');
    renderTestPlansPage(container);
  });
}

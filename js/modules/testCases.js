import { supabase } from '../supabaseClient.js';
import { currentProject } from '../state.js';
import {
  openModal, closeModal, openDrawer, closeDrawer, toast, setLoading, escapeHtml,
  badge, historyStrip, formatDateTime, formatDate, confirmDialog,
} from '../ui.js';
import { createCollapsibleField } from '../richEditor.js';

let allSuites = [];
let allCases = [];
let selectedSuiteId = 'all';
let pendingJiraQueueItemId = null; // setado quando o caso está sendo criado a partir de um card da fila do Jira
let searchTerm = '';

function getSavedSuiteTreeWidth() {
  try {
    const saved = parseInt(localStorage.getItem('testly_suite_tree_width'), 10);
    if (saved >= 180 && saved <= 500) return saved;
  } catch (e) { /* ignorado */ }
  return 250;
}
let suiteTreeWidth = getSavedSuiteTreeWidth();

export async function renderTestCasesPage(container, openCaseId = null) {
  if (!currentProject) {
    container.innerHTML = emptyNoProject();
    return;
  }

  container.innerHTML = `<div class="flex" style="justify-content:center; padding:60px;"><span class="spinner"></span></div>`;

  const [{ data: suites }, { data: cases }, { data: runCases }] = await Promise.all([
    supabase.from('test_suites').select('*').eq('project_id', currentProject.id).order('position'),
    supabase.from('test_cases').select('*').eq('project_id', currentProject.id).order('position').order('seq'),
    supabase.from('test_run_cases')
      .select('test_case_id, status, executed_at, test_runs!inner(project_id, created_at)')
      .eq('test_runs.project_id', currentProject.id)
      .order('executed_at', { ascending: true }),
  ]);

  allSuites = suites || [];
  allCases = cases || [];

  // Monta histórico de resultados por caso de teste
  const historyByCase = {};
  (runCases || []).forEach((rc) => {
    if (!rc.executed_at) return;
    if (!historyByCase[rc.test_case_id]) historyByCase[rc.test_case_id] = [];
    historyByCase[rc.test_case_id].push(rc.status);
  });

  renderLayout(container, historyByCase);

  if (openCaseId) {
    const target = allCases.find((c) => c.id === openCaseId);
    if (target) openCaseDrawer(container, historyByCase, target);
  }

  // Veio da fila do Jira ("Criar caso de teste")? Abre o painel de
  // criação já com o título preenchido.
  const jiraPrefillRaw = sessionStorage.getItem('jira_prefill_case');
  if (jiraPrefillRaw) {
    sessionStorage.removeItem('jira_prefill_case');
    try {
      const { title, jiraQueueItemId } = JSON.parse(jiraPrefillRaw);
      pendingJiraQueueItemId = jiraQueueItemId || null;
      openCaseDrawer(container, historyByCase, null, null, title || '');
    } catch (e) { /* ignorado */ }
  }
}

export async function openNewCaseWithTitle(container, title) {
  await renderTestCasesPage(container);
  const historyByCase = {};
  openCaseDrawer(container, historyByCase, null, null, title);
}

function emptyNoProject() {
  return `
    <div class="empty-state">
      <h3>Nenhum projeto selecionado</h3>
      <p>Crie ou selecione um projeto para gerenciar casos de teste.</p>
    </div>
  `;
}

function buildSuiteTree(suites) {
  const byParent = {};
  suites.forEach((s) => {
    const key = s.parent_suite_id || 'root';
    if (!byParent[key]) byParent[key] = [];
    byParent[key].push(s);
  });
  return byParent;
}

function getSuiteById(id) {
  return allSuites.find((s) => s.id === id) || null;
}

function getDescendantSuiteIds(suiteId) {
  const result = new Set();
  function walk(id) {
    allSuites.filter((s) => s.parent_suite_id === id).forEach((child) => {
      result.add(child.id);
      walk(child.id);
    });
  }
  walk(suiteId);
  return result;
}

let collapsedSuiteIds = new Set();

function renderSuiteTreeHtml(byParent, parentId, casesCountBySuite, depth = 0) {
  const children = byParent[parentId || 'root'] || [];
  return children.map((s) => {
    const count = casesCountBySuite[s.id] || 0;
    const hasChildren = (byParent[s.id] || []).length > 0;
    const isCollapsed = collapsedSuiteIds.has(s.id);
    return `
      <div class="nav-item suite-item ${selectedSuiteId === s.id ? 'active' : ''}"
           style="padding-left:${hasChildren ? depth * 14 : 24 + depth * 14}px; margin:1px 0;" data-suite-id="${s.id}" draggable="true">
        ${hasChildren ? `
          <button class="suite-collapse-toggle" data-toggle-suite="${s.id}" title="${isCollapsed ? 'Expandir' : 'Recolher'}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transform:rotate(${isCollapsed ? -90 : 0}deg); transition:transform 0.12s ease;"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        ` : ''}
        <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v11a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-7l-2-2H5a2 2 0 00-2 2z"/></svg></span>
        <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(s.title)}</span>
        <span class="text-muted" style="font-size:11px;">${count}</span>
      </div>
      ${!isCollapsed ? renderSuiteTreeHtml(byParent, s.id, casesCountBySuite, depth + 1) : ''}
    `;
  }).join('');
}

function renderLayout(container, historyByCase) {
  const byParent = buildSuiteTree(allSuites);
  const casesCountBySuite = {};
  allCases.forEach((c) => {
    if (c.suite_id) casesCountBySuite[c.suite_id] = (casesCountBySuite[c.suite_id] || 0) + 1;
  });

  const filteredCases = allCases.filter((c) => {
    const matchesSuite = selectedSuiteId === 'all' || c.suite_id === selectedSuiteId;
    const matchesSearch = !searchTerm || c.title.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSuite && matchesSearch;
  });

  const openSuite = selectedSuiteId !== 'all' ? getSuiteById(selectedSuiteId) : null;

  container.innerHTML = `
    <div style="display:flex; align-items:flex-start;">
      <div class="card" id="suite-tree-panel" style="width:${suiteTreeWidth}px; flex-shrink:0; padding:12px;">
        <div class="flex" style="justify-content:space-between; padding:4px 8px 10px;">
          <span style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">Suítes</span>
          <div class="flex gap-8">
            <button class="btn btn-ghost btn-sm" id="collapse-all-suites-btn" title="Recolher todas">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
            <button class="btn btn-ghost btn-sm" id="expand-all-suites-btn" title="Expandir todas">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <button class="btn btn-ghost btn-sm" id="new-suite-btn" title="Nova suíte">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
        </div>
        <div class="nav-item ${selectedSuiteId === 'all' ? 'active' : ''}" data-suite-id="all" style="margin:1px 0;">
          <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></span>
          Todos os casos
          <span class="text-muted" style="font-size:11px; margin-left:auto;">${allCases.length}</span>
        </div>
        ${renderSuiteTreeHtml(byParent, null, casesCountBySuite)}
        ${allSuites.length === 0 ? '<p class="text-muted" style="font-size:12px; padding:10px 8px;">Nenhuma suíte ainda.</p>' : ''}
      </div>

      <div class="suite-resize-handle" id="suite-resize-handle" title="Arrastar para redimensionar"></div>

      <div style="flex:1; min-width:0;">
        ${openSuite ? `
          <div class="suite-header-bar">
            <div class="suite-header-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v11a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-7l-2-2H5a2 2 0 00-2 2z"/></svg>
              ${escapeHtml(openSuite.title)}
            </div>
            <div class="suite-menu-wrap">
              <button class="icon-btn" id="suite-menu-btn" title="Mais opções">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
              </button>
              <div class="suite-menu hidden" id="suite-menu">
                <div class="suite-menu-item" data-action="new-case">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                  Criar caso de teste
                </div>
                <div class="suite-menu-item" data-action="new-subsuite">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v11a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-7l-2-2H5a2 2 0 00-2 2z"/><path d="M12 11v4M10 13h4"/></svg>
                  Criar sub-suíte
                </div>
                <div class="suite-menu-sep"></div>
                <div class="suite-menu-item" data-action="edit">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Editar
                </div>
                <div class="suite-menu-item" data-action="duplicate">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  Duplicar
                </div>
                <div class="suite-menu-sep"></div>
                <div class="suite-menu-item danger" data-action="delete">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
                  Excluir
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="toolbar">
          <div class="toolbar-left">
            <div class="search-input">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input type="text" id="search-cases" placeholder="Buscar casos de teste..." value="${escapeHtml(searchTerm)}" />
            </div>
          </div>
          <div class="flex gap-8">
            <button class="btn" id="export-cases-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Exportar
            </button>
            <button class="btn" id="import-cases-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Importar
            </button>
            <button class="btn btn-primary" id="new-case-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              Novo caso de teste
            </button>
          </div>
        </div>

        <div id="bulk-actions-bar" class="toolbar hidden" style="background:var(--bg-elevated); border-radius:var(--radius-md); padding:8px 14px; margin-bottom:10px;">
          <div class="toolbar-left">
            <span class="text-secondary" id="bulk-count" style="font-size:12.5px; font-weight:600;"></span>
          </div>
          <div class="flex gap-8">
            <select id="bulk-suite-select" title="Mover para suíte">
              <option value="">Mover para suíte...</option>
              <option value="__none__">— Sem suíte —</option>
              ${suiteOptionsHtml()}
            </select>
            <select id="bulk-priority-select" title="Alterar prioridade">
              <option value="">Prioridade...</option>
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
              <option value="critical">Crítica</option>
            </select>
            <select id="bulk-automation-select" title="Alterar automação">
              <option value="">Automação...</option>
              <option value="manual">Manual</option>
              <option value="automated">Automatizado</option>
              <option value="to_automate">A automatizar</option>
            </select>
            <button class="btn btn-sm btn-danger" id="bulk-delete-btn">Excluir</button>
          </div>
        </div>

        <div class="card" style="padding:0;">
          ${filteredCases.length === 0 ? `
            <div class="empty-state">
              <h3>Nenhum caso de teste encontrado</h3>
              <p>Crie o primeiro caso desta suíte ou ajuste a busca.</p>
            </div>
          ` : `
            <table>
              <thead>
                <tr><th style="width:34px;"><input type="checkbox" id="select-all-cases-checkbox" /></th><th>ID</th><th>Título</th><th>Prioridade</th><th>Tipo</th><th>Automação</th><th>Histórico</th></tr>
              </thead>
              <tbody>
                ${filteredCases.map((c) => `
                  <tr class="row-clickable" data-case-id="${c.id}" draggable="true">
                    <td><input type="checkbox" class="case-select" data-id="${c.id}" onclick="event.stopPropagation()" /></td>
                    <td><span class="id-badge">${escapeHtml(currentProject.code)}-${c.seq}</span></td>
                    <td style="font-weight:600;">${escapeHtml(c.title)}</td>
                    <td>${badge(c.priority)}</td>
                    <td class="text-secondary">${escapeHtml(c.type)}</td>
                    <td>${badge(c.automation_status)}</td>
                    <td>${historyStrip(historyByCase[c.id] || [])}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>
    </div>
  `;

  // Eventos
  container.querySelectorAll('.nav-item[data-suite-id]').forEach((el) => {
    el.addEventListener('click', () => {
      selectedSuiteId = el.dataset.suiteId === 'all' ? 'all' : el.dataset.suiteId;
      renderLayout(container, historyByCase);
    });
  });

  container.querySelector('#search-cases').addEventListener('input', (e) => {
    searchTerm = e.target.value;
    const cursorPos = e.target.selectionStart;
    renderLayout(container, historyByCase);
    const newInput = container.querySelector('#search-cases');
    if (newInput) {
      newInput.focus();
      newInput.setSelectionRange(cursorPos, cursorPos);
    }
  });

  container.querySelector('#new-suite-btn').addEventListener('click', () => openSuiteModal(container, null));
  container.querySelector('#new-case-btn').addEventListener('click', () => openCaseDrawer(container, historyByCase, null, selectedSuiteId !== 'all' ? selectedSuiteId : null));
  container.querySelector('#export-cases-btn').addEventListener('click', () => exportCasesAsCSV(filteredCases));
  container.querySelector('#import-cases-btn').addEventListener('click', () => openImportModal(container));

  function updateBulkBar() {
    const selected = Array.from(container.querySelectorAll('.case-select:checked'));
    const bar = document.getElementById('bulk-actions-bar');
    bar.classList.toggle('hidden', selected.length === 0);
    document.getElementById('bulk-count').textContent = `${selected.length} selecionado(s)`;
  }
  function getSelectedCaseIds() {
    return Array.from(container.querySelectorAll('.case-select:checked')).map((cb) => cb.dataset.id);
  }

  container.querySelector('#select-all-cases-checkbox')?.addEventListener('change', (e) => {
    container.querySelectorAll('.case-select').forEach((cb) => { cb.checked = e.target.checked; });
    updateBulkBar();
  });
  container.querySelectorAll('.case-select').forEach((cb) => {
    cb.addEventListener('change', updateBulkBar);
  });

  container.querySelector('#bulk-suite-select')?.addEventListener('change', async (e) => {
    const value = e.target.value;
    if (!value) return;
    const ids = getSelectedCaseIds();
    const suite_id = value === '__none__' ? null : value;
    const { error } = await supabase.from('test_cases').update({ suite_id }).in('id', ids);
    if (error) { toast(error.message, 'error'); return; }
    toast(`${ids.length} caso(s) movido(s)!`);
    renderTestCasesPage(container);
  });

  container.querySelector('#bulk-priority-select')?.addEventListener('change', async (e) => {
    const value = e.target.value;
    if (!value) return;
    const ids = getSelectedCaseIds();
    const { error } = await supabase.from('test_cases').update({ priority: value }).in('id', ids);
    if (error) { toast(error.message, 'error'); return; }
    toast(`Prioridade atualizada em ${ids.length} caso(s)!`);
    renderTestCasesPage(container);
  });

  container.querySelector('#bulk-automation-select')?.addEventListener('change', async (e) => {
    const value = e.target.value;
    if (!value) return;
    const ids = getSelectedCaseIds();
    const { error } = await supabase.from('test_cases').update({ automation_status: value }).in('id', ids);
    if (error) { toast(error.message, 'error'); return; }
    toast(`Automação atualizada em ${ids.length} caso(s)!`);
    renderTestCasesPage(container);
  });

  container.querySelector('#bulk-delete-btn')?.addEventListener('click', () => {
    const ids = getSelectedCaseIds();
    if (ids.length === 0) return;
    confirmDialog(`Excluir ${ids.length} caso(s) de teste selecionado(s)? Esta ação não pode ser desfeita.`, async () => {
      const { error } = await supabase.from('test_cases').delete().in('id', ids);
      if (error) { toast(error.message, 'error'); return; }
      toast(`${ids.length} caso(s) excluído(s).`);
      renderTestCasesPage(container);
    });
  });

  container.querySelector('#collapse-all-suites-btn').addEventListener('click', () => {
    allSuites.forEach((s) => {
      if (allSuites.some((c) => c.parent_suite_id === s.id)) collapsedSuiteIds.add(s.id);
    });
    renderLayout(container, historyByCase);
  });
  container.querySelector('#expand-all-suites-btn').addEventListener('click', () => {
    collapsedSuiteIds.clear();
    renderLayout(container, historyByCase);
  });
  container.querySelectorAll('[data-toggle-suite]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.toggleSuite;
      if (collapsedSuiteIds.has(id)) collapsedSuiteIds.delete(id);
      else collapsedSuiteIds.add(id);
      renderLayout(container, historyByCase);
    });
  });

  container.querySelectorAll('tr[data-case-id]').forEach((tr) => {
    tr.addEventListener('click', () => {
      const testCase = allCases.find((c) => c.id === tr.dataset.caseId);
      openCaseDrawer(container, historyByCase, testCase);
    });
  });

  // Menu "..." da suíte aberta
  if (openSuite) {
    const menuBtn = container.querySelector('#suite-menu-btn');
    const menu = container.querySelector('#suite-menu');
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => menu.classList.add('hidden'), { once: true });

    menu.querySelectorAll('.suite-menu-item').forEach((item) => {
      item.addEventListener('click', () => {
        menu.classList.add('hidden');
        const action = item.dataset.action;
        if (action === 'new-case') openCaseDrawer(container, historyByCase, null, openSuite.id);
        else if (action === 'new-subsuite') openSuiteModal(container, openSuite.id);
        else if (action === 'edit') openEditSuiteModal(container, openSuite);
        else if (action === 'duplicate') duplicateSuite(container, openSuite);
        else if (action === 'delete') deleteSuiteConfirm(container, openSuite);
      });
    });
  }

  wireSuiteDragDrop(container);
  wireCaseDragDrop(container);
  wireSuiteTreeResize(container);
}

function wireSuiteTreeResize(container) {
  const handle = container.querySelector('#suite-resize-handle');
  const panel = container.querySelector('#suite-tree-panel');
  if (!handle || !panel) return;

  let startX = 0;
  let startWidth = 0;

  function onMouseMove(e) {
    const newWidth = Math.max(180, Math.min(500, startWidth + (e.clientX - startX)));
    panel.style.width = `${newWidth}px`;
    suiteTreeWidth = newWidth;
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    handle.classList.remove('is-dragging');
    try { localStorage.setItem('testly_suite_tree_width', String(suiteTreeWidth)); } catch (e) { /* ignorado */ }
  }

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    handle.classList.add('is-dragging');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// ------------------------------------------------------------
// ARRASTAR E SOLTAR
// ------------------------------------------------------------
function clearDropClasses(container) {
  container.querySelectorAll('.drop-inside, .drop-before, .drop-after').forEach((el) => {
    el.classList.remove('drop-inside', 'drop-before', 'drop-after');
  });
}

function wireSuiteDragDrop(container) {
  const suiteEls = Array.from(container.querySelectorAll('.suite-item[data-suite-id]'));

  suiteEls.forEach((el) => {
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'suite', id: el.dataset.suiteId }));
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('drag-ghost');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('drag-ghost');
      clearDropClasses(container);
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / rect.height;
      el.classList.remove('drop-inside', 'drop-before', 'drop-after');
      if (ratio < 0.25) el.classList.add('drop-before');
      else if (ratio > 0.75) el.classList.add('drop-after');
      else el.classList.add('drop-inside');
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drop-inside', 'drop-before', 'drop-after');
    });
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const zone = el.classList.contains('drop-before') ? 'before' : el.classList.contains('drop-after') ? 'after' : 'inside';
      clearDropClasses(container);

      let data;
      try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
      if (!data) return;

      const targetSuiteId = el.dataset.suiteId;

      if (data.type === 'suite') {
        if (data.id === targetSuiteId) return;
        const descendants = getDescendantSuiteIds(data.id);
        if (descendants.has(targetSuiteId)) { toast('Não é possível mover uma suíte para dentro dela mesma.', 'error'); return; }
        await moveSuite(data.id, targetSuiteId, zone);
      } else if (data.type === 'case') {
        await supabase.from('test_cases').update({ suite_id: targetSuiteId }).eq('id', data.id);
        toast('Caso movido para a suíte!');
      }
      renderTestCasesPage(container);
    });
  });

  // "Todos os casos" — soltar aqui tira o caso de qualquer suíte, ou joga a suíte pra raiz
  const allItem = container.querySelector('[data-suite-id="all"]');
  if (allItem) {
    allItem.addEventListener('dragover', (e) => { e.preventDefault(); allItem.classList.add('drop-inside'); });
    allItem.addEventListener('dragleave', () => allItem.classList.remove('drop-inside'));
    allItem.addEventListener('drop', async (e) => {
      e.preventDefault();
      allItem.classList.remove('drop-inside');
      let data;
      try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
      if (!data) return;
      if (data.type === 'suite') {
        await supabase.from('test_suites').update({ parent_suite_id: null }).eq('id', data.id);
        toast('Suíte movida para a raiz!');
      } else if (data.type === 'case') {
        await supabase.from('test_cases').update({ suite_id: null }).eq('id', data.id);
        toast('Caso removido da suíte!');
      }
      renderTestCasesPage(container);
    });
  }
}

async function moveSuite(suiteId, targetSuiteId, zone) {
  if (zone === 'inside') {
    await supabase.from('test_suites').update({ parent_suite_id: targetSuiteId }).eq('id', suiteId);
    toast('Suíte movida para dentro de outra!');
    return;
  }
  const target = getSuiteById(targetSuiteId);
  const parentId = target ? target.parent_suite_id : null;
  const siblings = allSuites
    .filter((s) => (s.parent_suite_id || null) === (parentId || null) && s.id !== suiteId)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
  const targetIndex = siblings.findIndex((s) => s.id === targetSuiteId);
  const insertAt = zone === 'before' ? targetIndex : targetIndex + 1;
  siblings.splice(insertAt, 0, { id: suiteId });

  await supabase.from('test_suites').update({ parent_suite_id: parentId }).eq('id', suiteId);
  await Promise.all(siblings.map((s, i) => supabase.from('test_suites').update({ position: i }).eq('id', s.id)));
  toast('Suítes reordenadas!');
}

function wireCaseDragDrop(container) {
  const rows = Array.from(container.querySelectorAll('tr[data-case-id]'));

  rows.forEach((tr) => {
    tr.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'case', id: tr.dataset.caseId }));
      e.dataTransfer.effectAllowed = 'move';
      tr.classList.add('drag-ghost');
    });
    tr.addEventListener('dragend', () => {
      tr.classList.remove('drag-ghost');
      rows.forEach((r) => r.classList.remove('drop-before', 'drop-after'));
    });
    tr.addEventListener('dragover', (e) => {
      e.preventDefault();
      const rect = tr.getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / rect.height;
      rows.forEach((r) => r.classList.remove('drop-before', 'drop-after'));
      tr.classList.add(ratio < 0.5 ? 'drop-before' : 'drop-after');
    });
    tr.addEventListener('drop', async (e) => {
      e.preventDefault();
      const zone = tr.classList.contains('drop-before') ? 'before' : 'after';
      rows.forEach((r) => r.classList.remove('drop-before', 'drop-after'));

      let data;
      try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
      if (!data || data.type !== 'case' || data.id === tr.dataset.caseId) return;

      await reorderCase(data.id, tr.dataset.caseId, zone);
      renderTestCasesPage(container);
    });
  });
}

async function reorderCase(draggedId, targetId, zone) {
  const target = allCases.find((c) => c.id === targetId);
  if (!target) return;
  const suiteId = target.suite_id;
  const siblings = allCases
    .filter((c) => (c.suite_id || null) === (suiteId || null) && c.id !== draggedId)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
  const targetIndex = siblings.findIndex((c) => c.id === targetId);
  const insertAt = zone === 'before' ? targetIndex : targetIndex + 1;
  siblings.splice(insertAt, 0, { id: draggedId });

  await supabase.from('test_cases').update({ suite_id: suiteId }).eq('id', draggedId);
  await Promise.all(siblings.map((c, i) => supabase.from('test_cases').update({ position: i }).eq('id', c.id)));
  toast('Casos reordenados!');
}

function suiteOptionsHtml(selectedId) {
  return allSuites.map((s) =>
    `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${escapeHtml(s.title)}</option>`
  ).join('');
}

function openSuiteModal(container, defaultParentId = null) {
  openModal({
    title: defaultParentId ? 'Nova sub-suíte' : 'Nova suíte de teste',
    bodyHtml: `
      <div class="field">
        <label>Nome da suíte</label>
        <input type="text" id="suite-title" placeholder="Ex: Autenticação" />
      </div>
      <div class="field">
        <label>Suíte pai (opcional)</label>
        <select id="suite-parent">
          <option value="">— Nenhuma (raiz) —</option>
          ${suiteOptionsHtml(defaultParentId)}
        </select>
      </div>
    `,
    footerHtml: `
      <button class="btn" id="suite-cancel">Cancelar</button>
      <button class="btn btn-primary" id="suite-save">Criar suíte</button>
    `,
  });
  document.getElementById('suite-cancel').addEventListener('click', closeModal);
  document.getElementById('suite-save').addEventListener('click', async () => {
    const title = document.getElementById('suite-title').value.trim();
    const parent_suite_id = document.getElementById('suite-parent').value || null;
    if (!title) { toast('Dê um nome à suíte.', 'error'); return; }
    const btn = document.getElementById('suite-save');
    setLoading(btn, true);
    const { error } = await supabase.from('test_suites').insert({
      project_id: currentProject.id, title, parent_suite_id,
    });
    if (error) { setLoading(btn, false); toast(error.message, 'error'); return; }
    closeModal();
    toast('Suíte criada!');
    renderTestCasesPage(container);
  });
}

function openEditSuiteModal(container, suite) {
  const descendants = getDescendantSuiteIds(suite.id);
  const validParents = allSuites.filter((s) => s.id !== suite.id && !descendants.has(s.id));

  openModal({
    title: 'Editar suíte',
    bodyHtml: `
      <div class="field">
        <label>Nome da suíte</label>
        <input type="text" id="edit-suite-title" value="${escapeHtml(suite.title)}" />
      </div>
      <div class="field">
        <label>Suíte pai (opcional)</label>
        <select id="edit-suite-parent">
          <option value="">— Nenhuma (raiz) —</option>
          ${validParents.map((s) => `<option value="${s.id}" ${s.id === suite.parent_suite_id ? 'selected' : ''}>${escapeHtml(s.title)}</option>`).join('')}
        </select>
        <div class="field-hint">Não é possível mover uma suíte para dentro de uma de suas próprias sub-suítes.</div>
      </div>
      <div class="field">
        <label>Descrição (opcional)</label>
        <textarea id="edit-suite-description" rows="2">${escapeHtml(suite.description || '')}</textarea>
      </div>
    `,
    footerHtml: `
      <button class="btn" id="edit-suite-cancel">Cancelar</button>
      <button class="btn btn-primary" id="edit-suite-save">Salvar alterações</button>
    `,
  });

  document.getElementById('edit-suite-cancel').addEventListener('click', closeModal);
  document.getElementById('edit-suite-save').addEventListener('click', async () => {
    const title = document.getElementById('edit-suite-title').value.trim();
    if (!title) { toast('Dê um nome à suíte.', 'error'); return; }
    const parent_suite_id = document.getElementById('edit-suite-parent').value || null;
    const description = document.getElementById('edit-suite-description').value.trim();

    const btn = document.getElementById('edit-suite-save');
    setLoading(btn, true);
    const { error } = await supabase.from('test_suites').update({ title, parent_suite_id, description }).eq('id', suite.id);
    if (error) { setLoading(btn, false); toast(error.message, 'error'); return; }
    closeModal();
    toast('Suíte atualizada!');
    renderTestCasesPage(container);
  });
}

async function duplicateSuite(container, suite) {
  const { data: newSuite, error } = await supabase.from('test_suites').insert({
    project_id: currentProject.id,
    title: `${suite.title} (cópia)`,
    parent_suite_id: suite.parent_suite_id,
    description: suite.description || '',
  }).select().single();
  if (error) { toast(error.message, 'error'); return; }

  const casesToDuplicate = allCases.filter((c) => c.suite_id === suite.id);
  if (casesToDuplicate.length > 0) {
    const payload = casesToDuplicate.map((c) => ({
      project_id: currentProject.id,
      suite_id: newSuite.id,
      title: c.title,
      description: c.description,
      preconditions: c.preconditions,
      repro_steps: c.repro_steps,
      postconditions: c.postconditions,
      priority: c.priority,
      severity: c.severity,
      type: c.type,
      automation_status: c.automation_status,
      status: c.status,
    }));
    const { error: casesError } = await supabase.from('test_cases').insert(payload);
    if (casesError) { toast(casesError.message, 'error'); return; }
  }

  toast(`Suíte duplicada${casesToDuplicate.length ? ` com ${casesToDuplicate.length} caso(s)` : ''}!`);
  selectedSuiteId = newSuite.id;
  renderTestCasesPage(container);
}

function deleteSuiteConfirm(container, suite) {
  const descendants = getDescendantSuiteIds(suite.id);
  const caseCount = allCases.filter((c) => c.suite_id === suite.id || descendants.has(c.suite_id)).length;
  const suffix = descendants.size > 0 ? ` e ${descendants.size} sub-suíte(s)` : '';

  confirmDialog(
    `Excluir a suíte "${suite.title}"${suffix}? Os casos de teste NÃO serão apagados${caseCount ? ` (${caseCount} caso(s) ficarão sem suíte)` : ''}.`,
    async () => {
      const { error } = await supabase.from('test_suites').delete().eq('id', suite.id);
      if (error) { toast(error.message, 'error'); return; }
      toast('Suíte excluída.');
      selectedSuiteId = 'all';
      renderTestCasesPage(container);
    }
  );
}

const BDD_TEMPLATE = '<p><strong>Dado que</strong></p><p><strong>Quando</strong></p><p><strong>Então</strong></p>';

function suiteName(suiteId) {
  const s = allSuites.find((s) => s.id === suiteId);
  return s ? s.title : null;
}

function generalTabHtml() {
  return `
    <div class="drawer-section">
      <div class="drawer-section-label">Descrição</div>
      <div id="case-description-editor"></div>
    </div>
    <div class="drawer-section">
      <div class="drawer-section-label">Pré-requisitos</div>
      <div id="case-preconditions-editor"></div>
    </div>
    <div class="drawer-section">
      <div class="drawer-section-label">Passos para reprodução</div>
      <div id="case-repro-steps-editor"></div>
    </div>
    <div class="drawer-section">
      <div class="drawer-section-label">Resultado esperado</div>
      <div id="case-postconditions-editor"></div>
    </div>
  `;
}

function propertiesTabHtml(existing, defaultSuiteId) {
  return `
    <div class="field">
      <label>Suíte</label>
      <select id="case-suite">
        <option value="">— Sem suíte —</option>
        ${suiteOptionsHtml(existing?.suite_id || defaultSuiteId)}
      </select>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Prioridade</label>
        <select id="case-priority">
          ${['low','medium','high','critical'].map(p => `<option value="${p}" ${existing?.priority===p?'selected':''}>${p}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Severidade</label>
        <select id="case-severity">
          ${['minor','normal','major','critical'].map(s => `<option value="${s}" ${(existing?.severity||'normal')===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Tipo</label>
        <select id="case-type">
          ${['functional','regression','smoke','integration','e2e','performance','security','usability','other'].map(t => `<option value="${t}" ${existing?.type===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Automação</label>
        <select id="case-automation">
          ${['manual','automated','to_automate'].map(a => `<option value="${a}" ${existing?.automation_status===a?'selected':''}>${a}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field">
      <label>Status</label>
      <select id="case-status">
        ${['active','draft','deprecated'].map(s => `<option value="${s}" ${(existing?.status||'active')===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>
  `;
}

async function runsTabHtml(existing) {
  if (!existing) return `<div class="drawer-empty-tab">Salve o caso de teste primeiro para ver o histórico de execuções.</div>`;
  const { data } = await supabase
    .from('test_run_cases')
    .select('status, executed_at, test_runs(title, environment)')
    .eq('test_case_id', existing.id)
    .order('executed_at', { ascending: false });

  if (!data || data.length === 0) return `<div class="drawer-empty-tab">Este caso ainda não foi incluído em nenhuma execução.</div>`;

  return `
    <table>
      <thead><tr><th>Execução</th><th>Ambiente</th><th>Resultado</th><th>Quando</th></tr></thead>
      <tbody>
        ${data.map((rc) => `
          <tr>
            <td style="font-weight:600;">${escapeHtml(rc.test_runs?.title || '—')}</td>
            <td class="text-secondary">${escapeHtml(rc.test_runs?.environment || '—')}</td>
            <td>${badge(rc.status)}</td>
            <td class="text-muted">${rc.executed_at ? formatDateTime(rc.executed_at) : 'não executado'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function defectsTabHtml(existing) {
  if (!existing) return `<div class="drawer-empty-tab">Salve o caso de teste primeiro para ver defeitos vinculados.</div>`;
  const { data } = await supabase
    .from('defects')
    .select('*')
    .eq('test_case_id', existing.id)
    .order('created_at', { ascending: false });

  if (!data || data.length === 0) return `<div class="drawer-empty-tab">Nenhum defeito vinculado a este caso.</div>`;

  return `
    <table>
      <thead><tr><th>ID</th><th>Título</th><th>Severidade</th><th>Status</th></tr></thead>
      <tbody>
        ${data.map((d) => `
          <tr>
            <td><span class="id-badge">${currentProject.code}-B${d.seq}</span></td>
            <td style="font-weight:600;">${escapeHtml(d.title)}</td>
            <td>${badge(d.severity)}</td>
            <td>${badge(d.status)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function historyTabHtml(existing) {
  if (!existing) return `<div class="drawer-empty-tab">Salve o caso de teste primeiro para ver o histórico.</div>`;
  return `
    <div class="field-row">
      <div class="stat-card" style="flex:1;">
        <div class="label">Criado em</div>
        <div style="font-size:14px; font-weight:600; margin-top:6px;">${formatDate(existing.created_at)}</div>
      </div>
      <div class="stat-card" style="flex:1;">
        <div class="label">Última atualização</div>
        <div style="font-size:14px; font-weight:600; margin-top:6px;">${formatDate(existing.updated_at)}</div>
      </div>
    </div>
  `;
}

async function openCaseDrawer(container, historyByCase, existing = null, defaultSuiteId = null, defaultTitle = '') {
  const TABS = [
    { key: 'general', label: 'Geral' },
    { key: 'properties', label: 'Propriedades' },
    { key: 'runs', label: 'Execuções' },
    { key: 'defects', label: 'Defeitos' },
    { key: 'history', label: 'Histórico' },
  ];

  const [runsHtml, defectsHtml] = await Promise.all([runsTabHtml(existing), defectsTabHtml(existing)]);

  const suite = existing ? suiteName(existing.suite_id) : null;

  openDrawer({
    width: '620px',
    eyebrow: existing
      ? `<span class="id-badge">${currentProject.code}-${existing.seq}</span>${suite ? ` · ${escapeHtml(suite)}` : ''}`
      : 'Novo caso de teste',
    title: `<input type="text" class="drawer-title-input" id="case-title" value="${escapeHtml(existing?.title || defaultTitle || '')}" placeholder="Título do caso de teste" />`,
    headerActions: existing ? `
      <button class="icon-btn" id="case-duplicate" title="Duplicar">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      </button>
      <button class="icon-btn danger" id="case-delete" title="Excluir">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
      </button>
    ` : '',
    tabs: TABS,
    activeTab: 'general',
    bodyHtmlByTab: {
      general: generalTabHtml(),
      properties: propertiesTabHtml(existing, defaultSuiteId),
      runs: runsHtml,
      defects: defectsHtml,
      history: historyTabHtml(existing),
    },
    footerHtml: `
      <button class="btn" id="case-cancel">Cancelar</button>
      <button class="btn btn-primary" id="case-save">${existing ? 'Salvar alterações' : 'Criar caso'}</button>
    `,
  });

  const descriptionEditor = createCollapsibleField(document.getElementById('case-description-editor'), {
    value: existing?.description || '',
    placeholder: 'Do que se trata este caso de teste',
    minHeight: '70px',
    emptyLabel: 'Não preenchido — clique para adicionar uma descrição',
  });
  const preconditionsEditor = createCollapsibleField(document.getElementById('case-preconditions-editor'), {
    value: existing?.preconditions || '',
    placeholder: 'O que precisa estar pronto antes de rodar este teste',
    minHeight: '60px',
    emptyLabel: 'Não preenchido — clique para adicionar pré-requisitos',
  });
  const reproStepsEditor = createCollapsibleField(document.getElementById('case-repro-steps-editor'), {
    value: existing?.repro_steps || '',
    placeholder: 'Digite "1." e espaço para numerar automaticamente os passos',
    minHeight: '100px',
    emptyLabel: 'Não preenchido — clique para adicionar os passos',
  });
  const postconditionsEditor = createCollapsibleField(document.getElementById('case-postconditions-editor'), {
    value: existing?.postconditions ?? BDD_TEMPLATE,
    placeholder: 'O que deve acontecer ao final do teste',
    minHeight: '90px',
    emptyLabel: 'Não preenchido — clique para adicionar o resultado esperado',
  });

  document.getElementById('case-cancel').addEventListener('click', closeDrawer);

  if (existing) {
    document.getElementById('case-duplicate').addEventListener('click', async () => {
      const { data: newCase, error } = await supabase.from('test_cases').insert({
        project_id: currentProject.id,
        suite_id: existing.suite_id,
        title: `${existing.title} (cópia)`,
        description: existing.description,
        preconditions: existing.preconditions,
        repro_steps: existing.repro_steps,
        postconditions: existing.postconditions,
        priority: existing.priority,
        severity: existing.severity,
        type: existing.type,
        automation_status: existing.automation_status,
        status: existing.status,
      }).select().single();
      if (error) { toast(error.message, 'error'); return; }
      closeDrawer();
      toast('Caso de teste duplicado!');
      renderTestCasesPage(container);
    });

    document.getElementById('case-delete').addEventListener('click', () => {
      confirmDialog('Excluir este caso de teste? Esta ação não pode ser desfeita.', async () => {
        const { error } = await supabase.from('test_cases').delete().eq('id', existing.id);
        if (error) { toast(error.message, 'error'); return; }
        closeDrawer();
        toast('Caso de teste excluído.');
        renderTestCasesPage(container);
      });
    });
  }

  document.getElementById('case-save').addEventListener('click', async () => {
    const title = document.getElementById('case-title').value.trim();
    if (!title) { toast('Dê um título ao caso de teste.', 'error'); return; }

    const payload = {
      title,
      suite_id: document.getElementById('case-suite').value || null,
      priority: document.getElementById('case-priority').value,
      severity: document.getElementById('case-severity').value,
      type: document.getElementById('case-type').value,
      automation_status: document.getElementById('case-automation').value,
      status: document.getElementById('case-status').value,
      description: descriptionEditor.getHTML(),
      preconditions: preconditionsEditor.getHTML(),
      repro_steps: reproStepsEditor.getHTML(),
      postconditions: postconditionsEditor.getHTML(),
      updated_at: new Date().toISOString(),
    };

    const btn = document.getElementById('case-save');
    setLoading(btn, true);

    let error;
    let newCaseId = null;
    if (existing) {
      ({ error } = await supabase.from('test_cases').update(payload).eq('id', existing.id));
    } else {
      const { data: inserted, error: insErr } = await supabase.from('test_cases').insert({
        ...payload, project_id: currentProject.id,
      }).select().single();
      error = insErr;
      newCaseId = inserted?.id || null;
    }

    if (error) { setLoading(btn, false); toast(error.message, 'error'); return; }

    if (!existing && pendingJiraQueueItemId && newCaseId) {
      await supabase.from('jira_queue_items').update({ created_test_case_id: newCaseId }).eq('id', pendingJiraQueueItemId);
      pendingJiraQueueItemId = null;
    }

    closeDrawer();
    toast(existing ? 'Caso de teste atualizado!' : 'Caso de teste criado!');
    renderTestCasesPage(container);
  });
}

// ============================================================
// IMPORTAÇÃO VIA CSV
// ============================================================

const IMPORT_TEMPLATE_ROWS = [
  ['Titulo', 'Descricao', 'Pre-requisitos', 'Passos para reproducao', 'Resultado esperado', 'Prioridade', 'Severidade', 'Tipo', 'Automacao'],
  [
    'Realizar login com sucesso',
    'Cenário que vai validar o login com sucesso no app da Mobato',
    '',
    '1. Abra o app "Mobato"\n2. Insira o usuário e senha validos\n3. Clique em "Acessar"',
    'Dado que estou na tela de login\nE insiro meu usuário e senha validos\nQuando eu clicar no botão "Acessar"\nEntão deve realizar login, me direcionando para a HomeActivity',
    'Alta',
    'Normal',
    'Funcional',
    'Manual',
  ],
];

const IMPORT_PRIORITY_MAP = { baixa: 'low', media: 'medium', alta: 'high', critica: 'critical' };
const IMPORT_SEVERITY_MAP = { menor: 'minor', normal: 'normal', maior: 'major', critica: 'critical' };
const IMPORT_TYPE_MAP = {
  funcional: 'functional', regressao: 'regression', smoke: 'smoke', integracao: 'integration',
  e2e: 'e2e', performance: 'performance', seguranca: 'security', usabilidade: 'usability', outro: 'other',
};
const IMPORT_AUTOMATION_MAP = { manual: 'manual', automatizado: 'automated', 'a automatizar': 'to_automate' };

function normalizeKey(str) {
  return (str || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // remove acentos
}

function csvEscapeCell(val) {
  const s = String(val ?? '');
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function htmlToPlainText(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('p, li, div, br, hr').forEach((el) => {
    el.insertAdjacentText('afterend', '\n');
  });
  return div.textContent.replace(/\n{3,}/g, '\n\n').trim();
}

function exportCasesAsCSV(cases) {
  if (cases.length === 0) { toast('Nenhum caso de teste pra exportar (confira o filtro/busca).', 'error'); return; }

  const suiteTitleById = {};
  allSuites.forEach((s) => { suiteTitleById[s.id] = s.title; });

  const PRIORITY_LABELS_REV = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' };
  const SEVERITY_LABELS_REV = { minor: 'Menor', normal: 'Normal', major: 'Maior', critical: 'Crítica' };
  const TYPE_LABELS_REV = {
    functional: 'Funcional', regression: 'Regressão', smoke: 'Smoke', integration: 'Integração',
    e2e: 'E2E', performance: 'Performance', security: 'Segurança', usability: 'Usabilidade', other: 'Outro',
  };
  const AUTOMATION_LABELS_REV = { manual: 'Manual', automated: 'Automatizado', to_automate: 'A automatizar' };

  const header = ['ID', 'Suite', 'Titulo', 'Descricao', 'Pre-requisitos', 'Passos para reproducao', 'Resultado esperado', 'Prioridade', 'Severidade', 'Tipo', 'Automacao'];
  const rows = cases.map((c) => [
    `${currentProject.code}-${c.seq}`,
    c.suite_id ? (suiteTitleById[c.suite_id] || '') : '',
    c.title,
    htmlToPlainText(c.description),
    htmlToPlainText(c.preconditions),
    htmlToPlainText(c.repro_steps),
    htmlToPlainText(c.postconditions),
    PRIORITY_LABELS_REV[c.priority] || c.priority,
    SEVERITY_LABELS_REV[c.severity] || c.severity,
    TYPE_LABELS_REV[c.type] || c.type,
    AUTOMATION_LABELS_REV[c.automation_status] || c.automation_status,
  ]);

  const lines = [header, ...rows].map((row) => row.map(csvEscapeCell).join(','));
  const csvText = '\uFEFF' + lines.join('\r\n');

  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentProject.code}-casos-de-teste.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  toast(`${cases.length} caso(s) exportado(s)!`);
}

function buildTemplateCSV() {
  const lines = IMPORT_TEMPLATE_ROWS.map((row) => row.map(csvEscapeCell).join(','));
  return '\uFEFF' + lines.join('\r\n');
}

function downloadTemplateCSV() {
  const blob = new Blob([buildTemplateCSV()], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo-importacao-casos-de-teste.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Parser de CSV simples (RFC 4180): lida com campos entre aspas contendo
// vírgulas e quebras de linha.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '');

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function textToHtmlParagraphs(text) {
  if (!text) return '';
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => `<p>${escapeHtml(l)}</p>`).join('');
}

function parseImportRows(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length === 0) return { cases: [], skipped: 0 };

  const header = rows[0].map(normalizeKey);
  const colIndex = (names) => header.findIndex((h) => names.includes(h));

  const idx = {
    title: colIndex(['titulo', 'título']),
    description: colIndex(['descricao', 'descrição']),
    preconditions: colIndex(['pre-requisitos', 'prerequisitos', 'pre requisitos']),
    repro: colIndex(['passos para reproducao', 'passos para reprodução']),
    expected: colIndex(['resultado esperado']),
    priority: colIndex(['prioridade']),
    severity: colIndex(['severidade']),
    type: colIndex(['tipo']),
    automation: colIndex(['automacao', 'automação']),
  };

  const cases = [];
  let skipped = 0;

  rows.slice(1).forEach((row) => {
    const title = idx.title !== -1 ? (row[idx.title] || '').trim() : '';
    if (!title) { skipped++; return; }

    cases.push({
      title,
      description: textToHtmlParagraphs(idx.description !== -1 ? row[idx.description] : ''),
      preconditions: textToHtmlParagraphs(idx.preconditions !== -1 ? row[idx.preconditions] : ''),
      repro_steps: textToHtmlParagraphs(idx.repro !== -1 ? row[idx.repro] : ''),
      postconditions: textToHtmlParagraphs(idx.expected !== -1 ? row[idx.expected] : ''),
      priority: IMPORT_PRIORITY_MAP[normalizeKey(idx.priority !== -1 ? row[idx.priority] : '')] || 'medium',
      severity: IMPORT_SEVERITY_MAP[normalizeKey(idx.severity !== -1 ? row[idx.severity] : '')] || 'normal',
      type: IMPORT_TYPE_MAP[normalizeKey(idx.type !== -1 ? row[idx.type] : '')] || 'functional',
      automation_status: IMPORT_AUTOMATION_MAP[normalizeKey(idx.automation !== -1 ? row[idx.automation] : '')] || 'manual',
    });
  });

  return { cases, skipped };
}

function openImportModal(container) {
  openModal({
    title: 'Importar casos de teste via CSV',
    size: 'lg',
    bodyHtml: `
      <div class="field">
        <div class="readonly-block" style="font-size:12.5px; padding:0;">
          O arquivo CSV deve ter as colunas: <strong>Titulo</strong> (obrigatório), Descricao, Pre-requisitos,
          Passos para reproducao, Resultado esperado, Prioridade (Baixa/Média/Alta/Crítica),
          Severidade (Menor/Normal/Maior/Crítica), Tipo e Automacao (Manual/Automatizado/A automatizar).
          Baixe o modelo abaixo para ver um exemplo já preenchido.
        </div>
        <button type="button" class="btn btn-sm mt-8" id="download-template-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Baixar modelo de exemplo
        </button>
      </div>

      <div class="field">
        <label>Suíte de destino</label>
        <select id="import-suite-select">
          <option value="">— Sem suíte —</option>
          ${suiteOptionsHtml()}
        </select>
        <div class="field-hint">Todos os casos importados neste arquivo entram nessa mesma suíte.</div>
      </div>

      <div class="field">
        <label>Arquivo CSV</label>
        <input type="file" id="import-file-input" accept=".csv,text/csv" />
      </div>

      <div class="field">
        <label class="flex gap-8" style="cursor:pointer; font-weight:400;">
          <input type="checkbox" id="import-replace-checkbox" />
          Substituir casos existentes com o mesmo título (na suíte escolhida)
        </label>
      </div>

      <div id="import-preview" class="text-muted" style="font-size:12.5px;"></div>
    `,
    footerHtml: `
      <button class="btn" id="import-cancel">Cancelar</button>
      <button class="btn btn-primary" id="import-go" disabled>Importar casos de teste</button>
    `,
  });

  let parsedCases = [];

  document.getElementById('download-template-btn').addEventListener('click', downloadTemplateCSV);
  document.getElementById('import-cancel').addEventListener('click', closeModal);

  document.getElementById('import-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const preview = document.getElementById('import-preview');
    const goBtn = document.getElementById('import-go');
    if (!file) { preview.textContent = ''; goBtn.disabled = true; return; }

    const text = await file.text();
    const { cases, skipped } = parseImportRows(text);
    parsedCases = cases;

    if (cases.length === 0) {
      preview.innerHTML = `<span style="color:var(--st-failed);">Nenhum caso válido encontrado nesse arquivo. Confira se a coluna "Titulo" está preenchida.</span>`;
      goBtn.disabled = true;
    } else {
      preview.innerHTML = `<strong style="color:var(--st-passed);">${cases.length} caso(s) prontos para importar.</strong>${skipped ? ` ${skipped} linha(s) ignorada(s) por falta de título.` : ''}`;
      goBtn.disabled = false;
    }
  });

  document.getElementById('import-go').addEventListener('click', async () => {
    if (parsedCases.length === 0) return;
    const suiteId = document.getElementById('import-suite-select').value || null;
    const replaceExisting = document.getElementById('import-replace-checkbox').checked;

    const btn = document.getElementById('import-go');
    setLoading(btn, true, 'Importando...');

    let existingByTitle = {};
    if (replaceExisting) {
      const query = supabase.from('test_cases').select('id, title').eq('project_id', currentProject.id);
      const { data: existing } = suiteId ? await query.eq('suite_id', suiteId) : await query;
      (existing || []).forEach((c) => { existingByTitle[c.title.trim().toLowerCase()] = c.id; });
    }

    const toInsert = [];
    const toUpdate = [];
    parsedCases.forEach((c) => {
      const matchId = replaceExisting ? existingByTitle[c.title.trim().toLowerCase()] : null;
      if (matchId) {
        toUpdate.push({ id: matchId, payload: { ...c, suite_id: suiteId, updated_at: new Date().toISOString() } });
      } else {
        toInsert.push({ ...c, suite_id: suiteId, project_id: currentProject.id });
      }
    });

    let errorMsg = null;
    if (toInsert.length > 0) {
      const { error } = await supabase.from('test_cases').insert(toInsert);
      if (error) errorMsg = error.message;
    }
    if (!errorMsg) {
      for (const u of toUpdate) {
        const { error } = await supabase.from('test_cases').update(u.payload).eq('id', u.id);
        if (error) { errorMsg = error.message; break; }
      }
    }

    setLoading(btn, false);
    if (errorMsg) { toast(errorMsg, 'error'); return; }

    closeModal();
    toast(`Importação concluída: ${toInsert.length} caso(s) criado(s)${toUpdate.length ? `, ${toUpdate.length} atualizado(s)` : ''}.`);
    renderTestCasesPage(container);
  });
}

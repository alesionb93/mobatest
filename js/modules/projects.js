import { supabase } from '../supabaseClient.js';
import { openModal, closeModal, toast, setLoading, formatDate, escapeHtml } from '../ui.js';
import { projects, currentProject, loadProjects, setCurrentProject, createProject } from '../state.js';

export function openCreateProjectModal(afterCreate) {
  openModal({
    title: 'Novo projeto',
    bodyHtml: `
      <div class="field">
        <label>Nome do projeto</label>
        <input type="text" id="np-name" placeholder="Ex: App Mobile Banking" />
      </div>
      <div class="field">
        <label>Código (prefixo curto)</label>
        <input type="text" id="np-code" placeholder="Ex: MB" maxlength="8" style="text-transform:uppercase" />
        <div class="field-hint">Usado como prefixo visual dos IDs (não afeta a funcionalidade).</div>
      </div>
      <div class="field">
        <label>Descrição (opcional)</label>
        <textarea id="np-desc" placeholder="Do que se trata este projeto?"></textarea>
      </div>
    `,
    footerHtml: `
      <button class="btn" id="np-cancel">Cancelar</button>
      <button class="btn btn-primary" id="np-save">Criar projeto</button>
    `,
  });

  document.getElementById('np-cancel').addEventListener('click', closeModal);
  document.getElementById('np-save').addEventListener('click', async () => {
    const name = document.getElementById('np-name').value.trim();
    const code = document.getElementById('np-code').value.trim().toUpperCase() || 'PRJ';
    const description = document.getElementById('np-desc').value.trim();
    if (!name) { toast('Dê um nome ao projeto.', 'error'); return; }

    const btn = document.getElementById('np-save');
    setLoading(btn, true, 'Criando...');
    try {
      await createProject({ name, code, description });
      closeModal();
      toast('Projeto criado com sucesso!');
      if (afterCreate) afterCreate();
    } catch (err) {
      setLoading(btn, false);
      toast(err.message, 'error');
    }
  });
}

export function openProjectSwitcher() {
  const rows = projects.map((p) => `
    <div class="nav-item ${currentProject && p.id === currentProject.id ? 'active' : ''}"
         style="margin:0 0 4px; padding:10px 12px;" data-project-id="${p.id}">
      <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></span>
      <div>
        <div style="font-weight:600;">${escapeHtml(p.name)}</div>
        <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(p.code)}</div>
      </div>
    </div>
  `).join('');

  openModal({
    title: 'Trocar de projeto',
    bodyHtml: `
      <div style="margin-bottom:14px;">${rows || '<p class="text-muted">Nenhum projeto ainda.</p>'}</div>
      <button class="btn btn-primary" id="switcher-new-project" style="width:100%; justify-content:center;">+ Novo projeto</button>
    `,
  });

  document.querySelectorAll('#modal-root [data-project-id]').forEach((el) => {
    el.addEventListener('click', () => {
      setCurrentProject(el.dataset.projectId);
      closeModal();
      window.dispatchEvent(new CustomEvent('project-switched'));
    });
  });

  document.getElementById('switcher-new-project').addEventListener('click', () => {
    openCreateProjectModal(() => window.dispatchEvent(new CustomEvent('project-switched')));
  });
}

export async function renderProjectsPage(container) {
  container.innerHTML = `<div class="flex" style="justify-content:center; padding:60px;"><span class="spinner"></span></div>`;

  const { data: members } = await supabase
    .from('project_members')
    .select('project_id, role');

  const rows = projects.map((p) => {
    const membership = members?.find((m) => m.project_id === p.id);
    return `
      <tr data-id="${p.id}">
        <td class="row-clickable" data-goto="${p.id}"><span class="id-badge">${escapeHtml(p.code)}</span></td>
        <td class="row-clickable" data-goto="${p.id}" style="font-weight:600;">${escapeHtml(p.name)}</td>
        <td class="row-clickable text-secondary" data-goto="${p.id}">${escapeHtml(p.description || '—')}</td>
        <td><span class="badge badge-medium">${membership?.role || 'member'}</span></td>
        <td class="text-muted">${formatDate(p.created_at)}</td>
        <td><button class="btn btn-sm" data-export-project="${p.id}" title="Baixar backup completo (JSON)">Exportar</button></td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="text-secondary">${projects.length} projeto(s)</span>
      </div>
      <button class="btn btn-primary" id="new-project-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        Novo projeto
      </button>
    </div>
    <div class="card" style="padding:0;">
      ${projects.length === 0 ? `
        <div class="empty-state">
          <h3>Nenhum projeto ainda</h3>
          <p>Crie seu primeiro projeto para começar a organizar casos de teste.</p>
        </div>
      ` : `
        <table>
          <thead><tr><th>Código</th><th>Nome</th><th>Descrição</th><th>Meu papel</th><th>Criado em</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `}
    </div>
  `;

  document.getElementById('new-project-btn').addEventListener('click', () => {
    openCreateProjectModal(() => renderProjectsPage(container));
  });

  container.querySelectorAll('[data-export-project]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportProjectBackup(btn.dataset.exportProject, projects.find((p) => p.id === btn.dataset.exportProject));
    });
  });

  container.querySelectorAll('[data-goto]').forEach((el) => {
    el.addEventListener('click', () => {
      setCurrentProject(el.dataset.goto);
      window.dispatchEvent(new CustomEvent('project-switched'));
      window.location.hash = '#dashboard';
    });
  });

}

async function exportProjectBackup(projectId, project) {
  toast('Preparando backup... isso pode levar alguns segundos.');

  const [
    { data: suites }, { data: cases }, { data: plans },
    { data: runs }, { data: runCases }, { data: defects }, { data: comments },
  ] = await Promise.all([
    supabase.from('test_suites').select('*').eq('project_id', projectId),
    supabase.from('test_cases').select('*').eq('project_id', projectId),
    supabase.from('test_plans').select('*').eq('project_id', projectId),
    supabase.from('test_runs').select('*').eq('project_id', projectId),
    supabase.from('test_run_cases').select('*'),
    supabase.from('defects').select('*').eq('project_id', projectId),
    supabase.from('defect_comments').select('*'),
  ]);

  const planIds = (plans || []).map((p) => p.id);
  const { data: planCases } = planIds.length
    ? await supabase.from('test_plan_cases').select('*').in('test_plan_id', planIds)
    : { data: [] };

  const runIds = new Set((runs || []).map((r) => r.id));
  const defectIds = new Set((defects || []).map((d) => d.id));

  const backup = {
    exported_at: new Date().toISOString(),
    project,
    test_suites: suites || [],
    test_cases: cases || [],
    test_plans: plans || [],
    test_plan_cases: planCases || [],
    test_runs: runs || [],
    test_run_cases: (runCases || []).filter((rc) => runIds.has(rc.test_run_id)),
    defects: defects || [],
    defect_comments: (comments || []).filter((c) => defectIds.has(c.defect_id)),
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.code}-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  toast('Backup baixado!');
}

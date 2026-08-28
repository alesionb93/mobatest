import { supabase } from '../supabaseClient.js';
import { currentProject } from '../state.js';
import { currentUser } from '../auth.js';
import { toast, escapeHtml, timeAgo, initials } from '../ui.js';
import { openNewCaseWithTitle } from './testCases.js';

export async function renderJiraQueuePage(container) {
  if (!currentProject) {
    container.innerHTML = `<div class="empty-state"><h3>Nenhum projeto selecionado</h3><p>Crie ou selecione um projeto para ver a fila do Jira.</p></div>`;
    return;
  }

  container.innerHTML = `<div class="flex" style="justify-content:center; padding:60px;"><span class="spinner"></span></div>`;

  const { data: items, error } = await supabase
    .from('jira_queue_items')
    .select('*')
    .eq('project_id', currentProject.id)
    .order('entered_status_at', { ascending: false });

  if (error) {
    container.innerHTML = `<div class="empty-state"><h3>Não foi possível carregar</h3><p>${escapeHtml(error.message)}</p></div>`;
    return;
  }

  const profileIds = [...new Set((items || []).map((i) => i.assigned_to).filter(Boolean))];
  let profilesMap = {};
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', profileIds);
    (profiles || []).forEach((p) => { profilesMap[p.id] = p.full_name; });
  }

  drawQueue(container, items || [], profilesMap);
}

function drawQueue(container, items, profilesMap) {
  container.innerHTML = `
    <div class="card" style="background:var(--accent-2-dim); border-color:var(--accent-2); margin-bottom:20px;">
      <div class="flex gap-10" style="align-items:flex-start;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-2)" stroke-width="2" style="flex-shrink:0; margin-top:1px;"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        <div style="font-size:12.5px; color:var(--text-secondary);">
          <strong style="color:var(--text-primary);">Protótipo:</strong> esta tela mostra como ficaria a fila de cards que chegam em "Para teste" no Jira, atualizada automaticamente. Por enquanto tem só um card de exemplo (fixo) — a atualização automática de verdade depende de configurar um webhook no Jira, com acesso de admin.
        </div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <span class="text-secondary">${items.length} card(s) aguardando teste</span>
      </div>
    </div>

    ${items.length === 0 ? `
      <div class="card">
        <div class="empty-state">
          <h3>Nenhum card na fila</h3>
          <p>Quando a integração estiver ativa, cards que entrarem em "Para teste" no Jira aparecem aqui automaticamente.</p>
        </div>
      </div>
    ` : items.map((item) => drawItemCard(item, profilesMap)).join('')}
  `;

  container.querySelectorAll('[data-take-item]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { error } = await supabase.from('jira_queue_items').update({ assigned_to: currentUser.id }).eq('id', btn.dataset.takeItem);
      if (error) { toast(error.message, 'error'); return; }
      toast('Card atribuído a você!');
      renderJiraQueuePage(container);
    });
  });

  container.querySelectorAll('[data-release-item]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { error } = await supabase.from('jira_queue_items').update({ assigned_to: null }).eq('id', btn.dataset.releaseItem);
      if (error) { toast(error.message, 'error'); return; }
      toast('Card liberado.');
      renderJiraQueuePage(container);
    });
  });

  container.querySelectorAll('[data-create-case]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openNewCaseWithTitle(container, btn.dataset.title);
    });
  });
}

function drawItemCard(item, profilesMap) {
  const isMine = item.assigned_to && item.assigned_to === currentUser.id;
  const assignedName = item.assigned_to ? (profilesMap[item.assigned_to] || 'Alguém') : null;

  return `
    <div class="card" style="margin-bottom:12px;">
      <div class="flex" style="justify-content:space-between; align-items:flex-start; gap:16px;">
        <div style="min-width:0;">
          <div class="flex gap-8" style="align-items:center; margin-bottom:6px;">
            ${item.jira_url
              ? `<a href="${escapeHtml(item.jira_url)}" target="_blank" rel="noopener" class="id-badge" style="text-decoration:none;">${escapeHtml(item.jira_key)}</a>`
              : `<span class="id-badge">${escapeHtml(item.jira_key)}</span>`}
            <span class="badge badge-medium">${escapeHtml(item.issue_type || 'Item')}</span>
            <span class="text-muted" style="font-size:11.5px;">Entrou em "Para teste" ${timeAgo(item.entered_status_at)}</span>
          </div>
          <div style="font-weight:600; font-size:14px; margin-bottom:8px;">${escapeHtml(item.title)}</div>
          ${assignedName ? `
            <div class="flex gap-8" style="align-items:center;">
              <div class="avatar" style="width:22px; height:22px; font-size:9.5px;">${initials(assignedName)}</div>
              <span class="text-secondary" style="font-size:12px;">${isMine ? 'Você pegou este card' : `${escapeHtml(assignedName)} está com este card`}</span>
            </div>
          ` : `<span class="text-muted" style="font-size:12px;">Ninguém pegou ainda</span>`}
        </div>
        <div class="flex gap-8" style="flex-shrink:0;">
          ${item.test_case_id
            ? `<span class="badge badge-passed">Caso já criado</span>`
            : `<button class="btn btn-sm" data-create-case="${item.id}" data-title="${escapeHtml(item.title)}">+ Criar caso de teste</button>`}
          ${isMine
            ? `<button class="btn btn-sm" data-release-item="${item.id}">Liberar</button>`
            : `<button class="btn btn-sm btn-primary" data-take-item="${item.id}">Pegar para mim</button>`}
        </div>
      </div>
    </div>
  `;
}

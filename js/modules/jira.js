import { supabase } from '../supabaseClient.js';
import { currentProject } from '../state.js';
import { currentUser } from '../auth.js';
import { escapeHtml, toast, timeAgo, initials, formatDateTime, badge } from '../ui.js';
import { setRouteSubId } from '../router.js';

export async function renderJiraPage(container, subId) {
  if (!currentProject) {
    container.innerHTML = `<div class="empty-state"><h3>Nenhum projeto selecionado</h3><p>Crie ou selecione um projeto para ver a fila do Jira.</p></div>`;
    return;
  }

  if (subId) {
    return renderJiraDetail(container, subId);
  }

  container.innerHTML = `<div class="flex" style="justify-content:center; padding:60px;"><span class="spinner"></span></div>`;

  const [{ data: items }, { data: profiles }] = await Promise.all([
    supabase.from('jira_queue_items').select('*').eq('project_id', currentProject.id).order('status_entered_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name'),
  ]);

  setRouteSubId('jira', null);
  renderList(container, items || [], profiles || []);
}

function renderList(container, items, profiles) {
  const nameById = {}; profiles.forEach((p) => { nameById[p.id] = p.full_name; });
  const pending = items.filter((i) => !i.created_test_case_id);
  const done = items.filter((i) => i.created_test_case_id);

  container.innerHTML = `
    <div class="readonly-block" style="font-size:12.5px; margin-bottom:18px;">
      🔌 Este módulo ainda não está conectado ao Jira de verdade — os itens abaixo entram aqui manualmente por enquanto.
      Quando o webhook do Jira estiver configurado, cards que mudarem para "Para teste" vão aparecer aqui sozinhos.
    </div>

    <div class="card" style="padding:0; margin-bottom:20px;">
      ${pending.length === 0 ? `
        <div class="empty-state">
          <h3>Nenhum card esperando teste</h3>
          <p>Cards do Jira que entrarem em "Para teste" vão aparecer aqui.</p>
        </div>
      ` : `
        <table>
          <thead><tr><th>Card</th><th>Título</th><th>Tipo</th><th>Entrou em</th><th>Responsável</th><th></th></tr></thead>
          <tbody>
            ${pending.map((item) => `
              <tr class="row-clickable" data-goto-jira="${item.id}">
                <td><span class="id-badge">${escapeHtml(item.jira_key)}</span></td>
                <td style="font-weight:600;">${escapeHtml(item.title)}</td>
                <td class="text-secondary">${escapeHtml(item.issue_type || '—')}</td>
                <td class="text-muted">${timeAgo(item.status_entered_at)}</td>
                <td>
                  ${item.claimed_by ? `
                    <div class="flex gap-6" style="align-items:center;">
                      <div class="avatar" style="width:22px; height:22px; font-size:10px;">${initials(nameById[item.claimed_by] || '?')}</div>
                      <span style="font-size:12.5px;">${escapeHtml(nameById[item.claimed_by] || 'Alguém')}</span>
                    </div>
                  ` : '<span class="text-muted" style="font-size:12.5px;">Ninguém ainda</span>'}
                </td>
                <td>
                  <div class="flex gap-6">
                    ${!item.claimed_by ? `<button class="btn btn-sm" data-claim="${item.id}">Pegar para mim</button>` : ''}
                    ${item.claimed_by === currentUser.id ? `<button class="btn btn-sm" data-unclaim="${item.id}">Devolver</button>` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>

    ${done.length > 0 ? `
      <div class="drawer-section-label" style="margin-bottom:8px;">Já viraram caso de teste (${done.length})</div>
      <div class="card" style="padding:0;">
        <table>
          <thead><tr><th>Card</th><th>Título</th><th>Caso de teste</th></tr></thead>
          <tbody>
            ${done.map((item) => `
              <tr class="row-clickable" data-goto-jira="${item.id}">
                <td><span class="id-badge">${escapeHtml(item.jira_key)}</span></td>
                <td class="text-secondary">${escapeHtml(item.title)}</td>
                <td><a href="#test-cases/${item.created_test_case_id}" onclick="event.stopPropagation()">Ver caso →</a></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}
  `;

  container.querySelectorAll('[data-goto-jira]').forEach((row) => {
    row.addEventListener('click', () => {
      setRouteSubId('jira', row.dataset.gotoJira);
      renderJiraDetail(container, row.dataset.gotoJira);
    });
  });

  container.querySelectorAll('[data-claim]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { error } = await supabase.from('jira_queue_items')
        .update({ claimed_by: currentUser.id, claimed_at: new Date().toISOString() })
        .eq('id', btn.dataset.claim);
      if (error) { toast(error.message, 'error'); return; }
      toast('Card atribuído a você!');
      renderJiraPage(container);
    });
  });

  container.querySelectorAll('[data-unclaim]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { error } = await supabase.from('jira_queue_items')
        .update({ claimed_by: null, claimed_at: null })
        .eq('id', btn.dataset.unclaim);
      if (error) { toast(error.message, 'error'); return; }
      toast('Card devolvido pra fila.');
      renderJiraPage(container);
    });
  });
}

// ------------------------------------------------------------
// DETALHE — página cheia, com o conteúdo do card formatado no
// mesmo padrão visual usado em defeitos/casos de teste.
// ------------------------------------------------------------
async function renderJiraDetail(container, itemId) {
  container.innerHTML = `<div class="flex" style="justify-content:center; padding:60px;"><span class="spinner"></span></div>`;

  const { data: item } = await supabase.from('jira_queue_items').select('*').eq('id', itemId).single();

  if (!item) {
    setRouteSubId('jira', null);
    toast('Esse card não foi encontrado.', 'error');
    return renderJiraPage(container);
  }

  const { data: profile } = item.claimed_by
    ? await supabase.from('profiles').select('full_name').eq('id', item.claimed_by).maybeSingle()
    : { data: null };

  container.innerHTML = `
    <button class="btn btn-ghost btn-sm" id="back-to-jira" style="margin-bottom:14px;">← Voltar para a fila</button>

    <div class="flex gap-10" style="align-items:center; margin-bottom:8px; flex-wrap:wrap;">
      <span class="id-badge">${escapeHtml(item.jira_key)}</span>
      ${item.jira_url ? `<a href="${escapeHtml(item.jira_url)}" target="_blank" rel="noopener" style="font-size:12px;">Abrir no Jira ↗</a>` : ''}
    </div>

    <h2 style="font-size:22px; margin:0 0 10px;">${escapeHtml(item.title)}</h2>

    <div class="flex gap-8" style="flex-wrap:wrap; margin-bottom:20px;">
      ${item.issue_type ? `<span class="badge badge-medium">${escapeHtml(item.issue_type)}</span>` : ''}
      ${item.priority ? `<span class="badge badge-blocked">${escapeHtml(item.priority)}</span>` : ''}
      ${(item.labels || '').split(',').map((l) => l.trim()).filter(Boolean).map((l) => `<span class="badge badge-skipped">${escapeHtml(l)}</span>`).join('')}
    </div>

    <div class="field-row" style="max-width:640px; margin-bottom:22px;">
      <div class="field">
        <div class="drawer-section-label" style="margin-bottom:4px;">Reporter</div>
        <div style="font-size:13.5px; font-weight:600;">${escapeHtml(item.reporter_name || '—')}</div>
      </div>
      <div class="field">
        <div class="drawer-section-label" style="margin-bottom:4px;">Responsável no Jira</div>
        <div style="font-size:13.5px; font-weight:600;">${escapeHtml(item.assignee_name || '—')}</div>
      </div>
      <div class="field">
        <div class="drawer-section-label" style="margin-bottom:4px;">Entrou em "Para teste"</div>
        <div style="font-size:13.5px; font-weight:600;">${formatDateTime(item.status_entered_at)}</div>
      </div>
    </div>

    <div class="drawer-section-label" style="margin-bottom:8px;">Descrição</div>
    <div class="card" style="max-width:900px; margin-bottom:20px;">
      <div class="readonly-block">${item.description_html || (item.description ? escapeHtml(item.description).replace(/\n/g, '<br>') : '<span class="text-muted">Sem descrição.</span>')}</div>
    </div>

    ${item.subtasks && item.subtasks.length > 0 ? `
      <div class="drawer-section-label" style="margin-bottom:8px;">Subtarefas</div>
      <div class="card" style="max-width:900px; padding:0; margin-bottom:20px;">
        <table>
          <thead><tr><th>Ticket</th><th>Título</th><th>Status</th></tr></thead>
          <tbody>
            ${item.subtasks.map((st) => `
              <tr class="row-clickable" data-subtask-key="${escapeHtml(st.key)}">
                <td><span class="id-badge">${escapeHtml(st.key)}</span></td>
                <td>${escapeHtml(st.title)}</td>
                <td><span class="badge badge-passed">${escapeHtml(st.status || '—')}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}

    <div class="drawer-section-label" style="margin-bottom:8px;">Quem está com este card</div>
    <div class="card" style="max-width:900px; margin-bottom:22px;">
      ${item.claimed_by ? `
        <div class="flex gap-8" style="align-items:center;">
          <div class="avatar" style="width:28px; height:28px; font-size:11px;">${initials(profile?.full_name || '?')}</div>
          <span style="font-size:13.5px; font-weight:600;">${escapeHtml(profile?.full_name || 'Alguém')}</span>
          <span class="text-muted" style="font-size:12px;">desde ${timeAgo(item.claimed_at)}</span>
        </div>
      ` : '<span class="text-muted" style="font-size:13px;">Ninguém pegou este card ainda.</span>'}
    </div>

    <div class="flex gap-8">
      ${!item.claimed_by ? `<button class="btn" id="jira-claim-btn">Pegar para mim</button>` : ''}
      ${item.claimed_by === currentUser.id ? `<button class="btn" id="jira-unclaim-btn">Devolver pra fila</button>` : ''}
      ${item.created_test_case_id
        ? `<a href="#test-cases/${item.created_test_case_id}" class="btn btn-primary">Ver caso de teste criado →</a>`
        : `<button class="btn btn-primary" id="jira-create-case-btn">Criar caso de teste</button>`}
    </div>
  `;

  document.getElementById('back-to-jira').addEventListener('click', () => {
    setRouteSubId('jira', null);
    renderJiraPage(container);
  });

  document.getElementById('jira-claim-btn')?.addEventListener('click', async () => {
    const { error } = await supabase.from('jira_queue_items')
      .update({ claimed_by: currentUser.id, claimed_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) { toast(error.message, 'error'); return; }
    toast('Card atribuído a você!');
    renderJiraDetail(container, item.id);
  });

  document.getElementById('jira-unclaim-btn')?.addEventListener('click', async () => {
    const { error } = await supabase.from('jira_queue_items').update({ claimed_by: null, claimed_at: null }).eq('id', item.id);
    if (error) { toast(error.message, 'error'); return; }
    toast('Card devolvido pra fila.');
    renderJiraDetail(container, item.id);
  });

  document.getElementById('jira-create-case-btn')?.addEventListener('click', () => {
    sessionStorage.setItem('jira_prefill_case', JSON.stringify({ title: item.title, jiraQueueItemId: item.id }));
    window.location.hash = '#test-cases';
  });

  container.querySelectorAll('[data-subtask-key]').forEach((row) => {
    row.addEventListener('click', () => {
      if (!item.jira_url) return;
      const subtaskUrl = item.jira_url.replace(item.jira_key, row.dataset.subtaskKey);
      window.open(subtaskUrl, '_blank');
    });
  });
}

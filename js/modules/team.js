import { supabase } from '../supabaseClient.js';
import { currentProject } from '../state.js';
import { currentUser } from '../auth.js';
import { openModal, closeModal, toast, setLoading, escapeHtml, initials, timeAgo, badge } from '../ui.js';

export async function renderTeamPage(container) {
  if (!currentProject) {
    container.innerHTML = `<div class="empty-state"><h3>Nenhum projeto selecionado</h3><p>Crie ou selecione um projeto para ver a equipe.</p></div>`;
    return;
  }

  container.innerHTML = `<div class="flex" style="justify-content:center; padding:60px;"><span class="spinner"></span></div>`;

  const { data: members, error } = await supabase
    .from('project_members')
    .select('user_id, role, is_active, created_at, profiles(full_name, email, last_seen_at)')
    .eq('project_id', currentProject.id)
    .order('created_at');

  if (error) {
    container.innerHTML = `<div class="empty-state"><h3>Não foi possível carregar a equipe</h3><p>${escapeHtml(error.message)}</p></div>`;
    return;
  }

  renderTeamList(container, members || []);
}

function roleLabel(role) {
  return role === 'owner' ? 'Dono' : role === 'admin' ? 'Admin' : 'Membro';
}

function renderTeamList(container, members) {
  container.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="text-secondary">${members.length} membro(s) em ${escapeHtml(currentProject.name)}</span>
      </div>
      <button class="btn btn-primary" id="invite-member-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        Convidar membro
      </button>
    </div>

    <div class="card" style="padding:0;">
      <table>
        <thead><tr><th></th><th>Nome</th><th>E-mail</th><th>Ativo</th><th>Papel</th><th>Última ação</th><th></th></tr></thead>
        <tbody>
          ${members.map((m) => {
            const isOwner = m.role === 'owner';
            const name = m.profiles?.full_name || 'Sem nome';
            return `
              <tr data-user-id="${m.user_id}">
                <td><div class="avatar" style="width:30px; height:30px; font-size:12px;">${initials(name)}</div></td>
                <td style="font-weight:600;">${escapeHtml(name)} ${m.user_id === currentUser.id ? '<span class="text-muted" style="font-weight:400;">(você)</span>' : ''}</td>
                <td class="text-secondary">${escapeHtml(m.profiles?.email || '—')}</td>
                <td>
                  ${isOwner
                    ? '<span class="badge badge-passed">Ativo</span>'
                    : `<label class="toggle-switch"><input type="checkbox" class="active-toggle" ${m.is_active ? 'checked' : ''} data-user-id="${m.user_id}" /><span></span></label>`}
                </td>
                <td>
                  ${isOwner
                    ? '<span class="badge badge-medium">Dono</span>'
                    : `<select class="role-select" data-user-id="${m.user_id}">
                        <option value="member" ${m.role === 'member' ? 'selected' : ''}>Membro</option>
                        <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin</option>
                      </select>`}
                </td>
                <td class="text-muted">${timeAgo(m.profiles?.last_seen_at)}</td>
                <td>
                  ${!isOwner ? `<button class="icon-btn danger" data-remove="${m.user_id}" title="Remover"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg></button>` : ''}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('invite-member-btn').addEventListener('click', () => {
    openInviteModal(() => renderTeamPage(container));
  });

  container.querySelectorAll('.active-toggle').forEach((cb) => {
    cb.addEventListener('change', async () => {
      const { error } = await supabase.from('project_members')
        .update({ is_active: cb.checked })
        .eq('project_id', currentProject.id).eq('user_id', cb.dataset.userId);
      if (error) { toast(error.message, 'error'); cb.checked = !cb.checked; return; }
      toast(cb.checked ? 'Membro reativado.' : 'Membro desativado — perdeu o acesso ao projeto.');
    });
  });

  container.querySelectorAll('.role-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const { error } = await supabase.from('project_members')
        .update({ role: sel.value })
        .eq('project_id', currentProject.id).eq('user_id', sel.dataset.userId);
      if (error) { toast(error.message, 'error'); return; }
      toast('Papel atualizado.');
    });
  });

  container.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('tr');
      const actionsCell = btn.closest('td');
      actionsCell.innerHTML = `
        <div class="flex gap-6">
          <button class="btn btn-sm" data-cancel-remove>Cancelar</button>
          <button class="btn btn-sm btn-danger" data-confirm-remove>Remover</button>
        </div>
      `;
      actionsCell.querySelector('[data-cancel-remove]').addEventListener('click', () => renderTeamPage(container));
      actionsCell.querySelector('[data-confirm-remove]').addEventListener('click', async () => {
        const { error } = await supabase.from('project_members')
          .delete().eq('project_id', currentProject.id).eq('user_id', btn.dataset.remove);
        if (error) { toast(error.message, 'error'); return; }
        toast('Membro removido.');
        renderTeamPage(container);
      });
    });
  });
}

function openInviteModal(onInvited) {
  openModal({
    title: 'Convidar membro',
    bodyHtml: `
      <div class="field">
        <label>E-mail</label>
        <input type="email" id="invite-email" placeholder="pessoa@empresa.com" />
        <div class="field-hint">A pessoa precisa já ter uma conta no Mobatest com esse e-mail.</div>
      </div>
      <div class="field">
        <label>Papel</label>
        <select id="invite-role">
          <option value="member">Membro</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div id="invite-feedback"></div>
    `,
    footerHtml: `
      <button class="btn" id="invite-cancel">Cancelar</button>
      <button class="btn btn-primary" id="invite-go">Convidar</button>
    `,
  });

  document.getElementById('invite-cancel').addEventListener('click', closeModal);
  document.getElementById('invite-go').addEventListener('click', async () => {
    const email = document.getElementById('invite-email').value.trim().toLowerCase();
    const role = document.getElementById('invite-role').value;
    const feedback = document.getElementById('invite-feedback');
    feedback.innerHTML = '';
    if (!email) { toast('Digite um e-mail.', 'error'); return; }

    const btn = document.getElementById('invite-go');
    setLoading(btn, true, 'Buscando...');

    const { data: found, error: findError } = await supabase.rpc('find_user_by_email', { p_email: email });
    if (findError) { setLoading(btn, false); toast(findError.message, 'error'); return; }

    const user = Array.isArray(found) ? found[0] : found;
    if (!user) {
      setLoading(btn, false);
      feedback.innerHTML = `<div class="text-muted" style="font-size:12.5px; padding:6px 0;">Nenhuma conta encontrada com esse e-mail. Peça pra pessoa criar uma conta no Mobatest primeiro — depois é só convidar de novo.</div>`;
      return;
    }

    const { error: insertError } = await supabase.from('project_members').insert({
      project_id: currentProject.id, user_id: user.id, role,
    });
    setLoading(btn, false);

    if (insertError) {
      toast(insertError.message.includes('duplicate') ? 'Essa pessoa já é membro deste projeto.' : insertError.message, 'error');
      return;
    }

    closeModal();
    toast(`${user.full_name || 'Pessoa'} adicionada à equipe!`);
    if (onInvited) onInvited();
  });
}

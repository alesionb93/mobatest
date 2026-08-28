import { supabase } from '../supabaseClient.js';
import { currentUser } from '../auth.js';
import { openModal, closeModal, toast, setLoading, escapeHtml } from '../ui.js';

let activeTab = 'reasons';
let isAdmin = false;

export async function renderRegistriesPage(container) {
  container.innerHTML = `<div class="flex" style="justify-content:center; padding:60px;"><span class="spinner"></span></div>`;

  const { data: myMemberships } = await supabase
    .from('project_members')
    .select('role')
    .eq('user_id', currentUser.id)
    .eq('is_active', true);
  isAdmin = (myMemberships || []).some((m) => m.role === 'owner' || m.role === 'admin');

  drawRegistries(container);
}

function drawRegistries(container) {
  container.innerHTML = `
    <div class="tabs">
      <div class="tab ${activeTab === 'reasons' ? 'active' : ''}" data-tab="reasons">Motivos de falha</div>
      <div class="tab ${activeTab === 'cancellation' ? 'active' : ''}" data-tab="cancellation">Motivos de cancelamento</div>
      <div class="tab ${activeTab === 'contacts' ? 'active' : ''}" data-tab="contacts">Contatos (Dev/PO)</div>
    </div>
    ${!isAdmin ? `<div class="text-muted" style="font-size:12.5px; margin-bottom:14px;">Você pode ver estas listas, mas só um Admin ou Dono de projeto pode editá-las.</div>` : ''}
    <div id="registries-content"></div>
  `;

  container.querySelectorAll('[data-tab]').forEach((el) => {
    el.addEventListener('click', () => {
      activeTab = el.dataset.tab;
      drawRegistries(container);
    });
  });

  if (activeTab === 'reasons') renderReasonsTab(container);
  else if (activeTab === 'cancellation') renderCancellationTab(container);
  else renderContactsTab(container);
}

// ------------------------------------------------------------
// MOTIVOS DE FALHA
// ------------------------------------------------------------
async function renderReasonsTab(container) {
  await renderReasonListTab(container, 'failure_reasons', renderReasonsTab, 'Novo motivo de falha...');
}

async function renderCancellationTab(container) {
  await renderReasonListTab(container, 'cancellation_reasons', renderCancellationTab, 'Novo motivo de cancelamento...');
}

async function renderReasonListTab(container, table, rerender, placeholder) {
  const content = document.getElementById('registries-content');
  content.innerHTML = `<div class="flex" style="justify-content:center; padding:40px;"><span class="spinner"></span></div>`;

  const { data: reasons } = await supabase.from(table).select('*').order('label');

  content.innerHTML = `
    ${isAdmin ? `
      <div class="flex gap-8" style="margin-bottom:14px;">
        <input type="text" id="new-reason-input" placeholder="${escapeHtml(placeholder)}" style="flex:1;" />
        <button class="btn btn-primary" id="add-reason-btn">Adicionar</button>
      </div>
    ` : ''}
    <div class="card" style="padding:0;">
      ${(reasons || []).length === 0 ? `<div class="empty-state"><h3>Nenhum motivo cadastrado</h3></div>` : `
        <table>
          <thead><tr><th>Motivo</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${reasons.map((r) => `
              <tr data-id="${r.id}">
                <td style="font-weight:600;">${escapeHtml(r.label)}</td>
                <td>${r.is_active ? '<span class="badge badge-passed">Ativo</span>' : '<span class="badge badge-skipped">Inativo</span>'}</td>
                <td>
                  ${isAdmin ? `
                    <div class="flex gap-6">
                      <button class="btn btn-sm" data-toggle-reason="${r.id}" data-active="${r.is_active}">${r.is_active ? 'Desativar' : 'Ativar'}</button>
                      <button class="icon-btn danger" data-delete-reason="${r.id}" title="Excluir">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
                      </button>
                    </div>
                  ` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;

  if (!isAdmin) return;

  document.getElementById('add-reason-btn').addEventListener('click', async () => {
    const input = document.getElementById('new-reason-input');
    const label = input.value.trim();
    if (!label) { toast('Digite um motivo.', 'error'); return; }
    const { error } = await supabase.from(table).insert({ label });
    if (error) { toast(error.message.includes('duplicate') ? 'Esse motivo já existe.' : error.message, 'error'); return; }
    toast('Motivo adicionado!');
    rerender(container);
  });

  content.querySelectorAll('[data-toggle-reason]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const nowActive = btn.dataset.active !== 'true';
      const { error } = await supabase.from(table).update({ is_active: nowActive }).eq('id', btn.dataset.toggleReason);
      if (error) { toast(error.message, 'error'); return; }
      rerender(container);
    });
  });

  content.querySelectorAll('[data-delete-reason]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('tr');
      row.querySelector('td:last-child').innerHTML = `
        <div class="flex gap-6">
          <button class="btn btn-sm" data-cancel>Cancelar</button>
          <button class="btn btn-sm btn-danger" data-confirm>Excluir</button>
        </div>
      `;
      row.querySelector('[data-cancel]').addEventListener('click', () => rerender(container));
      row.querySelector('[data-confirm]').addEventListener('click', async () => {
        const { error } = await supabase.from(table).delete().eq('id', btn.dataset.deleteReason);
        if (error) { toast('Não foi possível excluir — provavelmente já está em uso. Desative em vez de excluir.', 'error'); return; }
        toast('Motivo excluído.');
        rerender(container);
      });
    });
  });
}

// ------------------------------------------------------------
// CONTATOS (Dev / PO)
// ------------------------------------------------------------
async function renderContactsTab(container) {
  const content = document.getElementById('registries-content');
  content.innerHTML = `<div class="flex" style="justify-content:center; padding:40px;"><span class="spinner"></span></div>`;

  const { data: contacts } = await supabase.from('contacts').select('*').order('name');

  content.innerHTML = `
    ${isAdmin ? `<button class="btn btn-primary" id="new-contact-btn" style="margin-bottom:14px;">+ Novo contato</button>` : ''}
    <div class="card" style="padding:0;">
      ${(contacts || []).length === 0 ? `<div class="empty-state"><h3>Nenhum contato cadastrado</h3><p>Cadastre devs e POs pra poder atribuí-los como responsáveis num defeito.</p></div>` : `
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Tipo</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${contacts.map((c) => `
              <tr data-id="${c.id}">
                <td style="font-weight:600;">${escapeHtml(c.name)}</td>
                <td class="text-secondary">${escapeHtml(c.email || '—')}</td>
                <td><span class="badge badge-medium">${c.kind === 'dev' ? 'Dev' : 'PO'}</span></td>
                <td>${c.is_active ? '<span class="badge badge-passed">Ativo</span>' : '<span class="badge badge-skipped">Inativo</span>'}</td>
                <td>
                  ${isAdmin ? `
                    <div class="flex gap-6">
                      <button class="btn btn-sm" data-toggle-contact="${c.id}" data-active="${c.is_active}">${c.is_active ? 'Desativar' : 'Ativar'}</button>
                      <button class="icon-btn danger" data-delete-contact="${c.id}" title="Excluir">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
                      </button>
                    </div>
                  ` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;

  if (!isAdmin) return;

  document.getElementById('new-contact-btn').addEventListener('click', () => openContactModal(() => renderContactsTab(container)));

  content.querySelectorAll('[data-toggle-contact]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const nowActive = btn.dataset.active !== 'true';
      const { error } = await supabase.from('contacts').update({ is_active: nowActive }).eq('id', btn.dataset.toggleContact);
      if (error) { toast(error.message, 'error'); return; }
      renderContactsTab(container);
    });
  });

  content.querySelectorAll('[data-delete-contact]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('tr');
      row.querySelector('td:last-child').innerHTML = `
        <div class="flex gap-6">
          <button class="btn btn-sm" data-cancel>Cancelar</button>
          <button class="btn btn-sm btn-danger" data-confirm>Excluir</button>
        </div>
      `;
      row.querySelector('[data-cancel]').addEventListener('click', () => renderContactsTab(container));
      row.querySelector('[data-confirm]').addEventListener('click', async () => {
        const { error } = await supabase.from('contacts').delete().eq('id', btn.dataset.deleteContact);
        if (error) { toast('Não foi possível excluir — provavelmente já está em uso em algum defeito. Desative em vez de excluir.', 'error'); return; }
        toast('Contato excluído.');
        renderContactsTab(container);
      });
    });
  });
}

function openContactModal(onSaved) {
  openModal({
    title: 'Novo contato',
    bodyHtml: `
      <div class="field">
        <label>Nome</label>
        <input type="text" id="contact-name" placeholder="Ex: João Silva" />
      </div>
      <div class="field">
        <label>E-mail (opcional)</label>
        <input type="email" id="contact-email" placeholder="joao@empresa.com" />
      </div>
      <div class="field">
        <label>Tipo</label>
        <select id="contact-kind">
          <option value="dev">Dev</option>
          <option value="po">PO</option>
        </select>
      </div>
    `,
    footerHtml: `
      <button class="btn" id="contact-cancel">Cancelar</button>
      <button class="btn btn-primary" id="contact-save">Salvar</button>
    `,
  });

  document.getElementById('contact-cancel').addEventListener('click', closeModal);
  document.getElementById('contact-save').addEventListener('click', async () => {
    const name = document.getElementById('contact-name').value.trim();
    if (!name) { toast('Dê um nome ao contato.', 'error'); return; }
    const email = document.getElementById('contact-email').value.trim();
    const kind = document.getElementById('contact-kind').value;

    const btn = document.getElementById('contact-save');
    setLoading(btn, true);
    const { error } = await supabase.from('contacts').insert({ name, email: email || null, kind });
    setLoading(btn, false);
    if (error) { toast(error.message, 'error'); return; }

    closeModal();
    toast('Contato cadastrado!');
    if (onSaved) onSaved();
  });
}

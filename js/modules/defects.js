import { supabase } from '../supabaseClient.js';
import { currentUser } from '../auth.js';
import { currentProject } from '../state.js';
import {
  openModal, closeModal, toast, setLoading, escapeHtml, badge, statusLabel,
  formatDateTime, formatDate, confirmDialog, initials, timeAgo,
} from '../ui.js';
import { createRichEditor } from '../richEditor.js';
import { BUG_CARD_TEMPLATE, SEVERITY_DEFS } from '../bugTemplate.js';
import { setRouteSubId } from '../router.js';
import { fetchFailureReasons, fetchContacts, failureReasonOptionsHtml, contactOptionsHtml } from '../defectFields.js';

let statusFilter = 'all';
let editingDefectId = null; // id do defeito atualmente em modo de edição (null = todos em visualização)

export async function renderDefectsPage(container, subId) {
  if (!currentProject) {
    container.innerHTML = `<div class="empty-state"><h3>Nenhum projeto selecionado</h3><p>Crie ou selecione um projeto para ver defeitos.</p></div>`;
    return;
  }

  // Se a URL já aponta para um defeito específico (ex: a aba foi
  // descartada/recarregada pelo navegador), abre direto nele.
  if (subId) {
    return renderDefectDetail(container, subId);
  }

  container.innerHTML = `<div class="flex" style="justify-content:center; padding:60px;"><span class="spinner"></span></div>`;

  const { data: defects } = await supabase
    .from('defects')
    .select('*, test_cases(title, seq)')
    .eq('project_id', currentProject.id)
    .order('created_at', { ascending: false });

  setRouteSubId('defects', null);
  renderList(container, defects || []);
}

function renderList(container, defects) {
  const filtered = statusFilter === 'all' ? defects : defects.filter((d) => d.status === statusFilter);
  const statuses = ['all', 'open', 'in_progress', 'resolved', 'closed'];
  const labels = { all: 'Todos', open: 'Abertos', in_progress: 'Em andamento', resolved: 'Resolvidos', closed: 'Fechados' };

  container.innerHTML = `
    <div class="toolbar">
      <div class="tabs" style="border:none; margin:0;">
        ${statuses.map((s) => `<div class="tab ${statusFilter === s ? 'active' : ''}" data-filter="${s}">${labels[s]} ${s !== 'all' ? `(${defects.filter(d => d.status === s).length})` : `(${defects.length})`}</div>`).join('')}
      </div>
      <button class="btn btn-primary" id="new-defect-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        Reportar defeito
      </button>
    </div>

    <div class="card" style="padding:0;">
      ${filtered.length === 0 ? `
        <div class="empty-state">
          <h3>Nenhum defeito encontrado</h3>
          <p>Ótimo sinal — ou ainda não há bugs reportados neste filtro.</p>
        </div>
      ` : `
        <table>
          <thead><tr><th>ID</th><th>Título</th><th>Severidade</th><th>Prioridade</th><th>Status</th><th>Caso vinculado</th><th>Criado</th></tr></thead>
          <tbody>
            ${filtered.map((d) => `
              <tr class="row-clickable" data-defect-id="${d.id}">
                <td><span class="id-badge">${currentProject.code}-B${d.seq}</span></td>
                <td style="font-weight:600;">${escapeHtml(d.title)}</td>
                <td>${badge(d.severity)}</td>
                <td>${badge(d.priority)}</td>
                <td>${badge(d.status)}</td>
                <td class="text-secondary">${d.test_cases ? `${currentProject.code}-${d.test_cases.seq}` : '—'}</td>
                <td class="text-muted">${formatDateTime(d.created_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;

  container.querySelectorAll('[data-filter]').forEach((el) => {
    el.addEventListener('click', () => { statusFilter = el.dataset.filter; renderList(container, defects); });
  });

  document.getElementById('new-defect-btn').addEventListener('click', () => {
    openCreateDefectModal(container);
  });

  container.querySelectorAll('[data-defect-id]').forEach((tr) => {
    tr.addEventListener('click', () => {
      setRouteSubId('defects', tr.dataset.defectId);
      renderDefectDetail(container, tr.dataset.defectId);
    });
  });
}

// ------------------------------------------------------------
// CRIAÇÃO — modal rápido, já com o template padrão de bug
// ------------------------------------------------------------
async function openCreateDefectModal(container, prefill = {}) {
  const defaultTitle = prefill.title || '';
  const [reasons, devs, pos] = await Promise.all([fetchFailureReasons(), fetchContacts('dev'), fetchContacts('po')]);

  openModal({
    title: 'Reportar defeito',
    size: 'lg',
    closeOnOverlayClick: false,
    bodyHtml: `
      <div class="field">
        <label>Título</label>
        <input type="text" id="def-title" value="${escapeHtml(defaultTitle)}" placeholder="Ex: Botão de login não responde no Safari" />
      </div>
      <div class="field">
        <label>Card</label>
        <div id="def-card-editor"></div>
      </div>
      <div class="field">
        <label>Severidade</label>
        <div class="status-choice-row">
          ${SEVERITY_DEFS.map((s) => `
            <button type="button" class="def-severity-btn status-choice-btn ${s.key === 'normal' ? 'is-active' : ''}" data-severity="${s.key}" style="background:var(--bg-elevated); color:var(--text-secondary);">
              ${escapeHtml(s.label)}
            </button>
          `).join('')}
        </div>
      </div>
      <div class="field">
        <label>Motivo da falha <span style="color:var(--st-failed);">*</span></label>
        <select id="def-reason">${failureReasonOptionsHtml(reasons)}</select>
        ${reasons.length === 0 ? `<div class="field-hint">Nenhum motivo cadastrado ainda — peça a um Admin pra cadastrar em "Cadastros".</div>` : ''}
      </div>
      <div class="field-row">
        <div class="field">
          <label>Dev responsável</label>
          <select id="def-dev">${contactOptionsHtml(devs)}</select>
        </div>
        <div class="field">
          <label>PO responsável</label>
          <select id="def-po">${contactOptionsHtml(pos)}</select>
        </div>
      </div>
    `,
    footerHtml: `
      <button class="btn" id="def-cancel">Cancelar</button>
      <button class="btn btn-primary" id="def-save">Reportar defeito</button>
    `,
  });

  const cardEditor = createRichEditor(document.getElementById('def-card-editor'), {
    value: BUG_CARD_TEMPLATE,
    placeholder: 'Descreva o problema encontrado',
    minHeight: '180px',
  });

  let selectedSeverity = 'normal';
  document.querySelectorAll('.def-severity-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedSeverity = btn.dataset.severity;
      document.querySelectorAll('.def-severity-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
    });
  });

  document.getElementById('def-cancel').addEventListener('click', closeModal);
  document.getElementById('def-save').addEventListener('click', async () => {
    const title = document.getElementById('def-title').value.trim();
    if (!title) { toast('Dê um título ao defeito.', 'error'); return; }
    const failure_reason_id = document.getElementById('def-reason').value;
    if (!failure_reason_id) { toast('Selecione o motivo da falha.', 'error'); return; }

    const btn = document.getElementById('def-save');
    setLoading(btn, true, 'Salvando...');

    const { data, error } = await supabase.from('defects').insert({
      title,
      description: cardEditor.getHTML(),
      severity: selectedSeverity,
      priority: 'medium',
      failure_reason_id,
      dev_contact_id: document.getElementById('def-dev').value || null,
      po_contact_id: document.getElementById('def-po').value || null,
      project_id: currentProject.id,
      reporter_id: currentUser.id,
      test_case_id: prefill.test_case_id || null,
      test_run_case_id: prefill.test_run_case_id || null,
    }).select().single();

    if (error) { setLoading(btn, false); toast(error.message, 'error'); return; }

    closeModal();
    toast('Defeito reportado!');
    setRouteSubId('defects', data.id);
    renderDefectDetail(container, data.id);
  });
}

// ------------------------------------------------------------
// DETALHE — página cheia (não modal), pra dar espaço de leitura
// ------------------------------------------------------------
async function renderDefectDetail(container, defectId) {
  if (editingDefectId !== defectId) editingDefectId = null;
  container.innerHTML = `<div class="flex" style="justify-content:center; padding:60px;"><span class="spinner"></span></div>`;

  const [{ data: defect }, reasons, devs, pos] = await Promise.all([
    supabase.from('defects').select('*, test_cases(title, seq)').eq('id', defectId).single(),
    fetchFailureReasons(),
    fetchContacts('dev'),
    fetchContacts('po'),
  ]);

  if (!defect) {
    setRouteSubId('defects', null);
    toast('Esse defeito não foi encontrado — pode ter sido excluído.', 'error');
    return renderDefectsPage(container);
  }

  drawDefectDetail(container, defect, { reasons, devs, pos });
}

const MAX_ATTACHMENT_SIZE = 150 * 1024 * 1024; // 150MB

function attachmentIcon(fileType) {
  if (fileType.startsWith('video/')) return '🎬';
  if (fileType === 'application/pdf') return '📄';
  return '📎';
}

function attachmentCardHtml(a) {
  const isImage = a.file_type.startsWith('image/');
  return `
    <div class="evidence-item" data-attachment-id="${a.id}" data-storage-path="${escapeHtml(a.storage_path)}" title="Clique para abrir">
      ${isImage
        ? `<img data-thumb="${a.id}" alt="${escapeHtml(a.file_name)}" />`
        : `<div class="evidence-file-icon">${attachmentIcon(a.file_type)}</div>`}
      <div class="evidence-file-name">${escapeHtml(a.file_name)}</div>
      <button class="evidence-delete-btn" data-delete-attachment="${a.id}" title="Excluir">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
      </button>
    </div>
  `;
}

async function loadAttachments(container, defectId) {
  const listEl = container.querySelector('#def-attachments-list');
  if (!listEl) return;

  const { data, error } = await supabase.from('attachments').select('*').eq('defect_id', defectId).order('created_at');
  if (error) { listEl.innerHTML = `<p class="text-muted" style="font-size:12.5px;">${escapeHtml(error.message)}</p>`; return; }

  if (!data || data.length === 0) {
    listEl.innerHTML = `<p class="text-muted" style="font-size:12.5px;">Nenhum arquivo anexado ainda.</p>`;
    return;
  }

  listEl.innerHTML = data.map(attachmentCardHtml).join('');

  // Resolve miniaturas de imagem (link temporário, o bucket é privado)
  data.filter((a) => a.file_type.startsWith('image/')).forEach(async (a) => {
    const { data: signed } = await supabase.storage.from('evidence').createSignedUrl(a.storage_path, 3600);
    const img = listEl.querySelector(`[data-thumb="${a.id}"]`);
    if (img && signed) img.src = signed.signedUrl;
  });

  listEl.querySelectorAll('.evidence-item').forEach((item) => {
    item.addEventListener('click', async (e) => {
      if (e.target.closest('[data-delete-attachment]')) return;
      const { data: signed, error: signError } = await supabase.storage.from('evidence').createSignedUrl(item.dataset.storagePath, 300);
      if (signError || !signed) { toast('Não foi possível abrir o arquivo.', 'error'); return; }
      window.open(signed.signedUrl, '_blank');
    });
  });

  listEl.querySelectorAll('[data-delete-attachment]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = btn.closest('.evidence-item');
      await supabase.storage.from('evidence').remove([item.dataset.storagePath]);
      const { error: delError } = await supabase.from('attachments').delete().eq('id', btn.dataset.deleteAttachment);
      if (delError) { toast(delError.message, 'error'); return; }
      toast('Evidência removida.');
      loadAttachments(container, defectId);
    });
  });
}

function wireAttachmentUpload(container, defect) {
  const input = container.querySelector('#def-attachment-input');
  if (!input) return;
  input.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    e.target.value = '';
    if (files.length === 0) return;

    const listEl = container.querySelector('#def-attachments-list');
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_SIZE) { toast(`"${file.name}" passa de 150MB e não foi enviado.`, 'error'); continue; }

      listEl.insertAdjacentHTML('afterbegin', `<div class="evidence-item evidence-uploading" data-uploading="1"><span class="spinner"></span>Enviando...</div>`);
      const path = `${currentProject.id}/${defect.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('evidence').upload(path, file);
      if (upErr) { toast(`Falha ao enviar "${file.name}": ${upErr.message}`, 'error'); continue; }

      const { error: insErr } = await supabase.from('attachments').insert({
        defect_id: defect.id, storage_path: path, file_name: file.name,
        file_type: file.type || 'application/octet-stream', file_size: file.size, uploaded_by: currentUser.id,
      });
      if (insErr) toast(insErr.message, 'error');
    }
    loadAttachments(container, defect.id);
  });
}

async function loadComments(container, defectId) {
  const listEl = container.querySelector('#def-comments-list');
  if (!listEl) return;

  const [{ data: comments, error }, { data: profiles }] = await Promise.all([
    supabase.from('defect_comments').select('*').eq('defect_id', defectId).order('created_at'),
    supabase.from('profiles').select('id, full_name'),
  ]);

  if (error) { listEl.innerHTML = `<p class="text-muted" style="font-size:12.5px;">${escapeHtml(error.message)}</p>`; return; }

  const nameById = {}; (profiles || []).forEach((p) => { nameById[p.id] = p.full_name; });

  if (!comments || comments.length === 0) {
    listEl.innerHTML = `<p class="text-muted" style="font-size:12.5px;">Nenhum comentário ainda — seja o primeiro.</p>`;
    return;
  }

  listEl.innerHTML = comments.map((c) => `
    <div class="flex gap-8" data-comment-id="${c.id}" style="align-items:flex-start;">
      <div class="avatar" style="width:28px; height:28px; font-size:11px; flex-shrink:0;">${initials(nameById[c.user_id] || '?')}</div>
      <div style="flex:1; min-width:0;">
        <div class="flex gap-8" style="align-items:baseline;">
          <strong style="font-size:12.5px;">${escapeHtml(nameById[c.user_id] || 'Usuário')}</strong>
          <span class="text-muted" style="font-size:11px;">${timeAgo(c.created_at)}</span>
          ${c.user_id === currentUser.id ? `<button class="icon-btn danger" data-delete-comment="${c.id}" title="Excluir" style="margin-left:auto; width:20px; height:20px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg></button>` : ''}
        </div>
        <div style="font-size:13px; margin-top:2px; white-space:pre-wrap;">${escapeHtml(c.body)}</div>
      </div>
    </div>
  `).join('');

  listEl.querySelectorAll('[data-delete-comment]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { error: delError } = await supabase.from('defect_comments').delete().eq('id', btn.dataset.deleteComment);
      if (delError) { toast(delError.message, 'error'); return; }
      loadComments(container, defectId);
    });
  });
}

function wireCommentForm(container, defect) {
  const btn = container.querySelector('#def-comment-send');
  const input = container.querySelector('#def-comment-input');
  if (!btn || !input) return;
  btn.addEventListener('click', async () => {
    const body = input.value.trim();
    if (!body) return;
    setLoading(btn, true, 'Enviando...');
    const { error } = await supabase.from('defect_comments').insert({ defect_id: defect.id, user_id: currentUser.id, body });
    setLoading(btn, false);
    if (error) { toast(error.message, 'error'); return; }
    input.value = '';
    loadComments(container, defect.id);
  });
}

function drawDefectDetail(container, defect, { reasons, devs, pos }) {
  const isEditing = editingDefectId === defect.id;
  const reasonLabel = reasons.find((r) => r.id === defect.failure_reason_id)?.label;
  const devLabel = devs.find((d) => d.id === defect.dev_contact_id)?.name;
  const poLabel = pos.find((p) => p.id === defect.po_contact_id)?.name;

  container.innerHTML = `
    <button class="btn btn-ghost btn-sm" id="back-to-defects" style="margin-bottom:14px;">← Voltar para defeitos</button>

    <div class="flex gap-10" style="align-items:center; margin-bottom:8px; flex-wrap:wrap;">
      <span class="id-badge">${currentProject.code}-B${defect.seq}</span>
      ${defect.test_cases ? `<span class="text-muted" style="font-size:12.5px;">Relacionado ao caso <strong class="text-secondary">${currentProject.code}-${defect.test_cases.seq}</strong> — ${escapeHtml(defect.test_cases.title)}</span>` : ''}
    </div>

    ${isEditing ? `
      <div class="drawer-title-row" style="margin:0 0 4px;">
        <input type="text" id="def-title" class="drawer-title-input" style="font-size:22px;" value="${escapeHtml(defect.title)}" placeholder="Título do defeito" />
      </div>
    ` : `
      <h2 style="font-size:22px; margin:0 0 4px;">${escapeHtml(defect.title)}</h2>
    `}
    <div class="text-muted" style="font-size:12px; margin-bottom:20px;">Criado em ${formatDateTime(defect.created_at)}${defect.updated_at && defect.updated_at !== defect.created_at ? ` · Atualizado em ${formatDateTime(defect.updated_at)}` : ''}</div>

    ${isEditing ? `
      <div class="field-row" style="max-width:640px; margin-bottom:20px;">
        <div class="field">
          <label>Status</label>
          <select id="def-status">
            ${['open', 'in_progress', 'resolved', 'closed'].map((s) => `<option value="${s}" ${defect.status === s ? 'selected' : ''}>${escapeHtml(statusLabel(s))}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Severidade</label>
          <select id="def-severity">
            ${SEVERITY_DEFS.map((s) => `<option value="${s.key}" ${defect.severity === s.key ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Prioridade</label>
          <select id="def-priority">
            ${['low', 'medium', 'high', 'critical'].map((p) => `<option value="${p}" ${defect.priority === p ? 'selected' : ''}>${escapeHtml(statusLabel(p))}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field-row" style="max-width:640px; margin-bottom:20px;">
        <div class="field">
          <label>Motivo da falha <span style="color:var(--st-failed);">*</span></label>
          <select id="def-reason">${failureReasonOptionsHtml(reasons, defect.failure_reason_id)}</select>
        </div>
        <div class="field">
          <label>Dev responsável</label>
          <select id="def-dev">${contactOptionsHtml(devs, defect.dev_contact_id)}</select>
        </div>
        <div class="field">
          <label>PO responsável</label>
          <select id="def-po">${contactOptionsHtml(pos, defect.po_contact_id)}</select>
        </div>
      </div>
    ` : `
      <div class="flex gap-8" style="flex-wrap:wrap; margin-bottom:20px;">
        ${badge(defect.status)}
        ${badge(defect.severity)}
        ${badge(defect.priority)}
      </div>
      <div class="field-row" style="max-width:640px; margin-bottom:20px;">
        <div class="field">
          <div class="drawer-section-label" style="margin-bottom:4px;">Motivo da falha</div>
          <div style="font-size:13.5px; font-weight:600;">${reasonLabel ? escapeHtml(reasonLabel) : '<span class="text-muted" style="font-weight:400;">Não definido</span>'}</div>
        </div>
        <div class="field">
          <div class="drawer-section-label" style="margin-bottom:4px;">Dev responsável</div>
          <div style="font-size:13.5px; font-weight:600;">${devLabel ? escapeHtml(devLabel) : '<span class="text-muted" style="font-weight:400;">Sem dev atribuído</span>'}</div>
        </div>
        <div class="field">
          <div class="drawer-section-label" style="margin-bottom:4px;">PO responsável</div>
          <div style="font-size:13.5px; font-weight:600;">${poLabel ? escapeHtml(poLabel) : '<span class="text-muted" style="font-weight:400;">Sem PO atribuído</span>'}</div>
        </div>
      </div>
    `}

    <div class="drawer-section-label" style="margin-bottom:8px;">Card</div>
    <div class="card" style="max-width:900px; ${isEditing ? 'padding:0;' : ''}">
      ${isEditing ? '<div id="def-card-editor"></div>' : `<div class="readonly-block">${defect.description || '<span class="text-muted">Sem descrição.</span>'}</div>`}
    </div>

    <div class="drawer-section-label" style="margin:22px 0 8px;">Evidências (fotos e vídeos)</div>
    <div class="card" style="max-width:900px;">
      <label class="evidence-upload-btn" for="def-attachment-input">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Adicionar foto ou vídeo
      </label>
      <input type="file" id="def-attachment-input" accept="image/*,video/*,application/pdf,.txt,.csv" multiple class="hidden" />
      <div class="field-hint" style="margin-top:6px;">Até 25MB por arquivo.</div>
      <div id="def-attachments-list" class="evidence-grid" style="margin-top:14px;">
        <div class="flex" style="justify-content:center; padding:20px;"><span class="spinner"></span></div>
      </div>
    </div>

    <div class="drawer-section-label" style="margin:22px 0 8px;">Comentários</div>
    <div class="card" style="max-width:900px;">
      <div id="def-comments-list" style="display:flex; flex-direction:column; gap:12px; margin-bottom:14px;">
        <div class="flex" style="justify-content:center; padding:10px;"><span class="spinner"></span></div>
      </div>
      <div class="flex gap-8" style="align-items:flex-start;">
        <textarea id="def-comment-input" rows="2" placeholder="Escreva um comentário..." style="flex:1;"></textarea>
        <button class="btn btn-primary" id="def-comment-send">Comentar</button>
      </div>
    </div>

    <div class="flex gap-8" style="margin-top:22px;">
      ${isEditing ? `
        <button class="btn" id="def-cancel-edit">Cancelar</button>
        <button class="btn btn-primary" id="def-save">Salvar alterações</button>
      ` : `
        <button class="btn btn-danger" id="def-delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
          Excluir
        </button>
        <button class="btn btn-primary" id="def-edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Editar
        </button>
      `}
    </div>
  `;

  let cardEditor = null;
  if (isEditing) {
    cardEditor = createRichEditor(document.getElementById('def-card-editor'), {
      value: defect.description || '',
      placeholder: 'Descreva o problema encontrado',
      minHeight: '260px',
    });
  }

  loadAttachments(container, defect.id);
  wireAttachmentUpload(container, defect);
  loadComments(container, defect.id);
  wireCommentForm(container, defect);

  document.getElementById('back-to-defects').addEventListener('click', () => {
    setRouteSubId('defects', null);
    editingDefectId = null;
    renderDefectsPage(container);
  });

  if (!isEditing) {
    document.getElementById('def-edit').addEventListener('click', () => {
      editingDefectId = defect.id;
      drawDefectDetail(container, defect, { reasons, devs, pos });
    });

    document.getElementById('def-delete').addEventListener('click', () => {
      confirmDialog('Excluir este defeito? Esta ação não pode ser desfeita.', async () => {
        const { error } = await supabase.from('defects').delete().eq('id', defect.id);
        if (error) { toast(error.message, 'error'); return; }
        toast('Defeito excluído.');
        setRouteSubId('defects', null);
        renderDefectsPage(container);
      });
    });
    return;
  }

  document.getElementById('def-cancel-edit').addEventListener('click', () => {
    editingDefectId = null;
    drawDefectDetail(container, defect, { reasons, devs, pos });
  });

  document.getElementById('def-save').addEventListener('click', async () => {
    const title = document.getElementById('def-title').value.trim();
    if (!title) { toast('Dê um título ao defeito.', 'error'); return; }
    const failure_reason_id = document.getElementById('def-reason').value;
    if (!failure_reason_id) { toast('Selecione o motivo da falha.', 'error'); return; }

    const btn = document.getElementById('def-save');
    setLoading(btn, true);

    const { error } = await supabase.from('defects').update({
      title,
      description: cardEditor.getHTML(),
      status: document.getElementById('def-status').value,
      severity: document.getElementById('def-severity').value,
      priority: document.getElementById('def-priority').value,
      failure_reason_id,
      dev_contact_id: document.getElementById('def-dev').value || null,
      po_contact_id: document.getElementById('def-po').value || null,
      updated_at: new Date().toISOString(),
    }).eq('id', defect.id);

    setLoading(btn, false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Defeito atualizado!');
    editingDefectId = null;
    renderDefectDetail(container, defect.id);
  });
}

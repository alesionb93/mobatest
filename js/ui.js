// ============================================================
// UI HELPERS
// ============================================================

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function toast(message, type = 'success') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.2s ease';
    setTimeout(() => el.remove(), 200);
  }, 3200);
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ' às ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) return '—';
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM ? `${h}h ${remM}m` : `${h}h`;
}

export function formatElapsed(fromIso, toIso) {
  if (!fromIso) return '—';
  const from = new Date(fromIso).getTime();
  const to = toIso ? new Date(toIso).getTime() : Date.now();
  const totalSeconds = Math.max(0, Math.floor((to - from) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function timeAgo(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 2592000) return `há ${Math.floor(diff / 86400)} d`;
  return formatDate(iso);
}

const STATUS_LABELS = {
  passed: 'Passou', failed: 'Falhou', blocked: 'Bloqueado', skipped: 'Pulado', untested: 'Não testado',
  pre_existing: 'Pré-existente',
  open: 'Aberto', in_progress: 'Em andamento', resolved: 'Resolvido', closed: 'Fechado',
  active: 'Ativo', completed: 'Concluído', cancelled: 'Cancelado', draft: 'Rascunho', deprecated: 'Descontinuado',
  low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica',
  minor: 'Menor', normal: 'Normal', major: 'Maior',
  manual: 'Manual', automated: 'Automatizado', to_automate: 'A automatizar',
  functional: 'Funcional', regression: 'Regressão', smoke: 'Smoke', integration: 'Integração',
  e2e: 'E2E', performance: 'Performance', security: 'Segurança', usability: 'Usabilidade', other: 'Outro',
};

export function statusLabel(key) {
  return STATUS_LABELS[key] || key;
}

export function badge(status, extraLabel) {
  const label = extraLabel || statusLabel(status);
  return `<span class="badge badge-${status}">${escapeHtml(label)}</span>`;
}

export function historyStrip(results = []) {
  const last = results.slice(-8);
  if (!last.length) return '<span class="text-muted" style="font-size:12px;">sem histórico</span>';
  return `<span class="history-strip">${last.map(s => `<span class="history-tick ${s}" title="${statusLabel(s)}"></span>`).join('')}</span>`;
}

export function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ------------------------------------------------------------
// MODAL
// ------------------------------------------------------------
export function openModal({ title, bodyHtml, footerHtml, size = '', closeOnOverlayClick = true }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal ${size === 'lg' ? 'modal-lg' : ''}">
        <div class="modal-header">
          <h3>${escapeHtml(title)}</h3>
          <button class="modal-close" id="modal-close-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>
    </div>
  `;
  const overlay = document.getElementById('modal-overlay');
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && closeOnOverlayClick) closeModal();
  });
  document.addEventListener('keydown', escHandler);
  return overlay;
}

function escHandler(e) {
  if (e.key === 'Escape') closeModal();
}

export function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
  document.removeEventListener('keydown', escHandler);
}

export function confirmDialog(message, onConfirm) {
  openModal({
    title: 'Confirmar ação',
    bodyHtml: `<p style="color: var(--text-secondary); margin:0;">${escapeHtml(message)}</p>`,
    footerHtml: `
      <button class="btn" id="confirm-cancel">Cancelar</button>
      <button class="btn btn-danger" id="confirm-ok">Confirmar</button>
    `,
  });
  document.getElementById('confirm-cancel').addEventListener('click', closeModal);
  document.getElementById('confirm-ok').addEventListener('click', () => {
    closeModal();
    onConfirm();
  });
}

export function setLoading(buttonEl, loading, loadingText = 'Salvando...') {
  if (!buttonEl) return;
  if (loading) {
    buttonEl.dataset.originalText = buttonEl.innerHTML;
    buttonEl.innerHTML = `<span class="spinner"></span> ${loadingText}`;
    buttonEl.disabled = true;
  } else {
    buttonEl.innerHTML = buttonEl.dataset.originalText || buttonEl.innerHTML;
    buttonEl.disabled = false;
  }
}

// ------------------------------------------------------------
// DRAWER (painel lateral estilo Jira/Qase — lista continua visível)
// ------------------------------------------------------------
function drawerEscHandler(e) {
  if (e.key === 'Escape') closeDrawer();
}

let activeDrawerOnClose = null;

export function openDrawer({ eyebrow, title, headerActions, tabs, activeTab, bodyHtmlByTab, footerHtml, width, onClose }) {
  activeDrawerOnClose = onClose || null;
  const root = document.getElementById('modal-root');
  const tabsHtml = tabs
    ? `<div class="drawer-tabs">${tabs.map((t) => `<div class="tab drawer-tab ${t.key === activeTab ? 'active' : ''}" data-tab="${t.key}">${escapeHtml(t.label)}</div>`).join('')}</div>`
    : '';
  const bodySections = tabs
    ? tabs.map((t) => `<div class="drawer-tab-panel" data-tab-panel="${t.key}" ${t.key === activeTab ? '' : 'style="display:none;"'}>${bodyHtmlByTab[t.key] || ''}</div>`).join('')
    : bodyHtmlByTab;

  root.innerHTML = `
    <div class="drawer-overlay" id="drawer-overlay">
      <div class="drawer-panel" style="width:${width || '560px'};">
        <div class="drawer-header">
          <div class="drawer-header-text">
            ${eyebrow ? `<div class="drawer-eyebrow">${eyebrow}</div>` : ''}
            <div class="drawer-title-row">${title}</div>
          </div>
          <div class="drawer-header-actions">
            ${headerActions || ''}
            <button class="modal-close" id="drawer-close-btn" title="Fechar (Esc)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        ${tabsHtml}
        <div class="drawer-body">${bodySections}</div>
        ${footerHtml ? `<div class="drawer-footer">${footerHtml}</div>` : ''}
      </div>
    </div>
  `;

  const overlay = document.getElementById('drawer-overlay');
  document.getElementById('drawer-close-btn').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDrawer();
  });
  document.addEventListener('keydown', drawerEscHandler);

  if (tabs) {
    overlay.querySelectorAll('.drawer-tab').forEach((tabEl) => {
      tabEl.addEventListener('click', () => {
        overlay.querySelectorAll('.drawer-tab').forEach((t) => t.classList.remove('active'));
        tabEl.classList.add('active');
        overlay.querySelectorAll('.drawer-tab-panel').forEach((p) => {
          p.style.display = p.dataset.tabPanel === tabEl.dataset.tab ? '' : 'none';
        });
      });
    });
  }

  return overlay;
}

export function closeDrawer() {
  document.getElementById('modal-root').innerHTML = '';
  document.removeEventListener('keydown', drawerEscHandler);
  if (activeDrawerOnClose) {
    const cb = activeDrawerOnClose;
    activeDrawerOnClose = null;
    cb();
  }
}

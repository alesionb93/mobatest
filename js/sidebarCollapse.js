// ============================================================
// BARRA LATERAL COLAPSÁVEL — modo compacto (só ícones)
// ------------------------------------------------------------
// Útil para ganhar espaço em tela. Preferência salva em
// localStorage e restaurada nas próximas visitas.
// ============================================================

const STORAGE_KEY = 'testly_sidebar_collapsed';

function isCollapsed() {
  return document.body.classList.contains('sidebar-collapsed');
}

function applyLabel() {
  const collapsed = isCollapsed();
  const label = document.querySelector('#sidebar-collapse-toggle .sidebar-text');
  if (label) label.textContent = collapsed ? 'Expandir menu' : 'Colapsar menu';
  const toggle = document.getElementById('sidebar-collapse-toggle');
  if (toggle) toggle.title = collapsed ? 'Expandir menu' : 'Colapsar menu';
}

function setCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch (e) { /* ignorado */ }
  applyLabel();
}

export function initSidebarCollapse() {
  let saved = '0';
  try { saved = localStorage.getItem(STORAGE_KEY) || '0'; } catch (e) { /* ignorado */ }
  setCollapsed(saved === '1');

  document.getElementById('sidebar-collapse-toggle')?.addEventListener('click', () => {
    setCollapsed(!isCollapsed());
  });
}

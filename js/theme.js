// ============================================================
// TEMA — claro (Veiser, padrão) / escuro (identidade original)
// ------------------------------------------------------------
// A preferência é salva em localStorage e já aplicada por um
// script inline no <head> (evita "flash" do tema errado ao
// carregar a página). Este módulo só cuida da interação (clique
// nos botões) e mantém os textos/ícones sincronizados.
// ============================================================

const STORAGE_KEY = 'testly_theme';

function isDark() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function applyLabels() {
  const dark = isDark();
  document.querySelectorAll('.theme-toggle-label').forEach((el) => {
    el.textContent = dark ? 'Modo claro' : 'Modo escuro';
  });
}

function setTheme(dark) {
  if (dark) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  try { localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light'); } catch (e) { /* ignorado */ }
  applyLabels();
}

function toggleTheme() {
  setTheme(!isDark());
}

export function initThemeToggle() {
  applyLabels();
  document.getElementById('theme-toggle-auth')?.addEventListener('click', toggleTheme);
  document.getElementById('theme-toggle-sidebar')?.addEventListener('click', toggleTheme);
}

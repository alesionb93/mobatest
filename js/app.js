import { initAuthUI } from './auth.js';
import { loadProjects, projects } from './state.js';
import { initRouter, refreshCurrentRoute } from './router.js';
import { openProjectSwitcher, openCreateProjectModal } from './modules/projects.js';
import { USE_MOCK_BACKEND } from './config.js';
import { initThemeToggle } from './theme.js';
import { initSidebarCollapse } from './sidebarCollapse.js';
import { initGlobalSearch } from './globalSearch.js';

async function bootstrapApp() {
  await loadProjects();

  if (projects.length === 0) {
    // Primeiro acesso: incentiva a criação do primeiro projeto
    openCreateProjectModal(() => {
      initRouter();
    });
  } else {
    initRouter();
  }

  document.getElementById('project-switcher').addEventListener('click', openProjectSwitcher);
  initGlobalSearch();

  window.addEventListener('project-switched', () => {
    refreshCurrentRoute();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initSidebarCollapse();
  if (USE_MOCK_BACKEND) {
    document.getElementById('mock-mode-hint').classList.remove('hidden');
    document.getElementById('login-email').value = 'demo@testly.local';
    document.getElementById('login-password').value = 'demo123';
  }
  initAuthUI(bootstrapApp);
});

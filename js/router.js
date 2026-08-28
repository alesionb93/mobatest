import { renderDashboardPage } from './modules/dashboard.js';
import { renderTestCasesPage } from './modules/testCases.js';
import { renderTestPlansPage } from './modules/testPlans.js';
import { renderTestRunsPage } from './modules/testRuns.js';
import { renderDefectsPage } from './modules/defects.js';
import { renderReportsPage } from './modules/reports.js';
import { renderProjectsPage } from './modules/projects.js';
import { renderTeamPage } from './modules/team.js';
import { renderRegistriesPage } from './modules/registries.js';
import { renderJiraPage } from './modules/jira.js';

const routes = {
  dashboard: { title: 'Dashboard', subtitle: 'Visão geral da qualidade do seu projeto', render: renderDashboardPage },
  'test-cases': { title: 'Casos de teste', subtitle: 'Organize e mantenha seu repositório de testes', render: renderTestCasesPage },
  'test-plans': { title: 'Planos de teste', subtitle: 'Agrupe casos de teste em ciclos planejados', render: renderTestPlansPage },
  'test-runs': { title: 'Execuções', subtitle: 'Execute testes e registre resultados', render: renderTestRunsPage },
  defects: { title: 'Defeitos', subtitle: 'Acompanhe bugs encontrados durante os testes', render: renderDefectsPage },
  reports: { title: 'Relatórios', subtitle: 'Análises e tendências de qualidade', render: renderReportsPage },
  projects: { title: 'Projetos', subtitle: 'Gerencie os projetos da sua conta', render: renderProjectsPage },
  team: { title: 'Equipe', subtitle: 'Membros com acesso a este projeto', render: renderTeamPage },
  registries: { title: 'Cadastros', subtitle: 'Motivos de falha e contatos de Dev/PO', render: renderRegistriesPage },
  jira: { title: 'Jira', subtitle: 'Cards que chegaram em "Para teste"', render: renderJiraPage },
};

let currentRoute = 'dashboard';
let currentSubId = null;

export function initRouter() {
  window.addEventListener('hashchange', handleHashChange);
  document.querySelectorAll('.nav-item[data-route]').forEach((el) => {
    el.addEventListener('click', () => {
      window.location.hash = '#' + el.dataset.route;
    });
  });
  handleHashChange();
}

function handleHashChange() {
  const raw = window.location.hash.replace('#', '') || 'dashboard';
  const slashIndex = raw.indexOf('/');
  const base = slashIndex === -1 ? raw : raw.slice(0, slashIndex);
  const rest = slashIndex === -1 ? null : raw.slice(slashIndex + 1);
  const route = routes[base] ? base : 'dashboard';
  navigateTo(route, rest);
}

export function navigateTo(route, subId) {
  currentRoute = route;
  currentSubId = subId || null;
  const config = routes[route];
  if (!config) return;

  // Reseta o marcador de "coluna lateral fixa" (usado pelo detalhe de
  // execução); só é reativado se a própria página precisar dele.
  document.body.classList.remove('has-run-sidebar');

  document.getElementById('page-title').textContent = config.title;
  document.getElementById('page-subtitle').textContent = config.subtitle;

  document.querySelectorAll('.nav-item[data-route]').forEach((el) => {
    el.classList.toggle('active', el.dataset.route === route);
  });

  const container = document.getElementById('content');
  config.render(container, currentSubId);
}

export function refreshCurrentRoute() {
  navigateTo(currentRoute, currentSubId);
}

// Atualiza a URL para refletir "onde" o usuário está (ex: dentro de qual
// execução), sem disparar hashchange (evita loop de re-render). Assim, se
// o navegador descartar a aba em segundo plano e recarregar do zero, a
// página volta exatamente de onde a pessoa saiu, em vez de voltar pra lista.
export function setRouteSubId(route, subId) {
  currentSubId = subId || null;
  const newHash = '#' + route + (subId ? '/' + subId : '');
  if (window.location.hash !== newHash) {
    history.replaceState(null, '', newHash);
  }
}

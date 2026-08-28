import { supabase } from './supabaseClient.js';

export let projects = [];
export let currentProject = null;

const listeners = [];
export function onProjectChange(fn) {
  listeners.push(fn);
}
function notify() {
  listeners.forEach((fn) => fn(currentProject));
}

// Alguns navegadores/configurações bloqueiam localStorage (ex: modo privado
// restrito, políticas corporativas). Essas funções nunca lançam erro.
function safeGetStorage(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function safeSetStorage(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* ignorado de propósito */ }
}

export async function loadProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) {
    console.error(error);
    return [];
  }
  projects = data || [];

  const savedId = safeGetStorage('testly_current_project');
  const saved = projects.find((p) => p.id === savedId);
  currentProject = saved || projects[0] || null;

  updateSwitcherUI();
  notify();
  return projects;
}

export function setCurrentProject(projectId) {
  const found = projects.find((p) => p.id === projectId);
  if (!found) return;
  currentProject = found;
  safeSetStorage('testly_current_project', projectId);
  updateSwitcherUI();
  notify();
}

function updateSwitcherUI() {
  const nameEl = document.getElementById('current-project-name');
  const badgeEl = document.getElementById('project-switcher-badge');
  if (nameEl) nameEl.textContent = currentProject ? currentProject.name : 'Nenhum projeto';
  if (badgeEl) badgeEl.textContent = currentProject ? (currentProject.code || currentProject.name).slice(0, 2).toUpperCase() : '—';
}

export async function createProject({ name, code, description }) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('projects')
    .insert({ name, code, description, owner_id: userData.user.id })
    .select()
    .single();
  if (error) throw error;
  await loadProjects();
  setCurrentProject(data.id);
  return data;
}

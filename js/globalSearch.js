import { supabase } from './supabaseClient.js';
import { currentProject } from './state.js';
import { escapeHtml } from './ui.js';

let debounceTimer = null;

export function initGlobalSearch() {
  const input = document.getElementById('global-search-input');
  const resultsBox = document.getElementById('global-search-results');
  if (!input || !resultsBox) return;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const term = input.value.trim();
    if (term.length < 2) { resultsBox.classList.add('hidden'); return; }
    debounceTimer = setTimeout(() => runSearch(term, resultsBox), 300);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2 && resultsBox.innerHTML) resultsBox.classList.remove('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.global-search-wrap')) resultsBox.classList.add('hidden');
  });
}

async function runSearch(term, resultsBox) {
  if (!currentProject) return;

  resultsBox.innerHTML = `<div class="flex" style="justify-content:center; padding:16px;"><span class="spinner"></span></div>`;
  resultsBox.classList.remove('hidden');

  const like = `%${term}%`;
  const [{ data: cases }, { data: defects }, { data: runs }] = await Promise.all([
    supabase.from('test_cases').select('id, seq, title').eq('project_id', currentProject.id).ilike('title', like).limit(5),
    supabase.from('defects').select('id, seq, title').eq('project_id', currentProject.id).ilike('title', like).limit(5),
    supabase.from('test_runs').select('id, seq, title').eq('project_id', currentProject.id).ilike('title', like).limit(5),
  ]);

  const groups = [
    { label: 'Casos de teste', icon: '✔', items: cases || [], go: (id) => { window.location.hash = `#test-cases/${id}`; } },
    { label: 'Defeitos', icon: '🐞', items: defects || [], go: (id) => { window.location.hash = `#defects/${id}`; } },
    { label: 'Execuções', icon: '▶', items: runs || [], go: (id) => { window.location.hash = `#test-runs/${id}`; } },
  ].filter((g) => g.items.length > 0);

  if (groups.length === 0) {
    resultsBox.innerHTML = `<div class="global-search-empty">Nenhum resultado para "${escapeHtml(term)}".</div>`;
    return;
  }

  resultsBox.innerHTML = groups.map((g) => `
    <div class="global-search-group">
      <div class="global-search-group-label">${g.label}</div>
      ${g.items.map((item) => `
        <div class="global-search-result" data-group="${g.label}" data-id="${item.id}">
          <span class="text-muted" style="font-size:11px;">${currentProject.code}-${g.label === 'Defeitos' ? 'B' : ''}${item.seq}</span>
          <span>${escapeHtml(item.title)}</span>
        </div>
      `).join('')}
    </div>
  `).join('');

  resultsBox.querySelectorAll('.global-search-result').forEach((el) => {
    const group = groups.find((g) => g.label === el.dataset.group);
    el.addEventListener('click', () => {
      group.go(el.dataset.id);
      resultsBox.classList.add('hidden');
      document.getElementById('global-search-input').value = '';
    });
  });
}

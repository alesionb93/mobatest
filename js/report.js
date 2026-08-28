import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { escapeHtml, badge, formatDateTime, formatDuration } from './ui.js';

const root = document.getElementById('report-root');

function showMessage(title, body) {
  root.innerHTML = `
    <div class="card" style="text-align:center; padding:50px 30px;">
      <h2 style="margin-bottom:10px;">${escapeHtml(title)}</h2>
      <p class="text-secondary" style="margin:0;">${escapeHtml(body)}</p>
    </div>
  `;
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div.textContent || '';
}

async function main() {
  if (SUPABASE_URL.includes('COLE_AQUI') || SUPABASE_ANON_KEY.includes('COLE_AQUI')) {
    showMessage('Relatório indisponível', 'Este Mobatest ainda não foi conectado a um banco Supabase real, então links públicos não funcionam em modo demonstração.');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (!token) {
    showMessage('Link inválido', 'Esse link de relatório está incompleto ou incorreto.');
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client.rpc('get_public_report', { p_token: token });

  if (error || !data || !data.run) {
    showMessage('Relatório não encontrado', 'Esse link é inválido ou o link público desta execução foi desativado pelo autor.');
    return;
  }

  renderReport(data);
}

function buildSuiteMap(suites) {
  const byId = {};
  suites.forEach((s) => { byId[s.id] = s; });
  return byId;
}

function groupCasesBySuite(cases, suites) {
  const suiteMap = buildSuiteMap(suites);
  const bySuite = {};
  cases.forEach((c) => {
    const key = c.suite_id || 'none';
    (bySuite[key] = bySuite[key] || []).push(c);
  });
  Object.values(bySuite).forEach((arr) => arr.sort((a, b) => (a.seq || 0) - (b.seq || 0)));

  const groups = [];
  Object.keys(bySuite).forEach((key) => {
    if (key === 'none') return;
    const suite = suiteMap[key];
    groups.push({ title: suite ? suite.title : 'Suíte', cases: bySuite[key] });
  });
  if (bySuite.none) groups.push({ title: 'Sem suíte', cases: bySuite.none });
  return groups;
}

function renderReport(data) {
  const { run, cases, suites, defects } = data;
  const groups = groupCasesBySuite(cases || [], suites || []);

  const total = (cases || []).length || 1;
  const executed = (cases || []).filter((c) => c.status && c.status !== 'untested').length;
  const pct = Math.round((executed / total) * 100);
  const failed = (cases || []).filter((c) => c.status === 'failed').length;

  root.innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <div class="flex" style="justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
        <div>
          <div class="text-muted" style="font-size:12px; margin-bottom:4px;">${escapeHtml(run.project_name || '')} (${escapeHtml(run.project_code || '')})</div>
          <h1 style="font-size:20px;">${escapeHtml(run.title)}</h1>
          <div class="text-muted" style="font-size:12.5px; margin-top:4px;">${escapeHtml(run.environment || 'Sem ambiente')} · Criada em ${formatDateTime(run.created_at)}</div>
        </div>
        <div class="flex gap-10" style="align-items:center;">
          ${badge(run.status)}
          <div style="text-align:center;">
            <div style="font-family:var(--font-display); font-size:22px; font-weight:800;">${pct}%</div>
            <div class="text-muted" style="font-size:11px;">${executed} de ${(cases || []).length}</div>
          </div>
        </div>
      </div>
      ${failed > 0 ? `<div class="mt-16" style="color:var(--st-failed); font-weight:600; font-size:13px;">${failed} caso(s) com falha</div>` : ''}
      ${run.report_notes ? `
        <div class="mt-16" style="background:var(--bg-elevated); border-left:3px solid var(--accent-2); padding:10px 14px; border-radius:0 8px 8px 0;">
          <div class="drawer-section-label" style="margin-bottom:4px;">Observações</div>
          <div style="font-size:13px; white-space:pre-wrap;">${escapeHtml(run.report_notes)}</div>
        </div>
      ` : ''}
    </div>

    ${(defects || []).length > 0 ? `
      <div class="card" style="margin-bottom:20px;">
        <h3 style="font-size:14px; margin-bottom:12px;">Defeitos encontrados</h3>
        <table>
          <thead><tr><th>ID</th><th>Título</th><th>Severidade</th><th>Status</th></tr></thead>
          <tbody>
            ${defects.map((d) => `
              <tr>
                <td><span class="id-badge">${escapeHtml(run.project_code || '')}-B${d.seq}</span></td>
                <td style="font-weight:600;">${escapeHtml(d.title)}</td>
                <td>${badge(d.severity)}</td>
                <td>${badge(d.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}

    <div class="card" style="padding:0;">
      <table>
        <thead><tr><th>ID</th><th>Caso de teste</th><th>Prioridade</th><th>Status</th><th>Duração</th></tr></thead>
        <tbody>
          ${groups.map((g) => `
            <tr>
              <td colspan="5" style="font-weight:700; color:var(--text-secondary); background:var(--bg-elevated); font-size:12.5px;">
                ${escapeHtml(g.title)} <span class="text-muted" style="font-weight:400;">(${g.cases.length})</span>
              </td>
            </tr>
            ${g.cases.map((c) => `
              <tr>
                <td><span class="id-badge">${escapeHtml(run.project_code || '')}-${c.seq}</span></td>
                <td style="font-weight:600;">${escapeHtml(c.title)}</td>
                <td>${badge(c.priority)}</td>
                <td>${badge(c.status)}</td>
                <td class="text-muted mono">${formatDuration(c.duration_seconds)}</td>
              </tr>
              ${c.comment ? `
                <tr>
                  <td></td>
                  <td colspan="4" style="padding-top:0;">
                    <div style="background:var(--bg-hover); border-left:3px solid var(--accent-2); padding:6px 12px; border-radius:0 6px 6px 0; font-size:12.5px; color:var(--text-secondary);">
                      ${escapeHtml(stripHtml(c.comment))}
                    </div>
                  </td>
                </tr>
              ` : ''}
            `).join('')}
          `).join('')}
        </tbody>
      </table>
    </div>

    <p class="text-muted" style="text-align:center; font-size:12px; margin-top:24px;">
      Gerado pelo Mobatest — este é um link somente leitura, sem acesso ao restante da conta.
    </p>
  `;
}

main();

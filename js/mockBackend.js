// ============================================================
// MOCK BACKEND — banco de dados em memória (não persiste nada)
// ------------------------------------------------------------
// Implementa a mesma "forma" de chamadas do supabase-js
// (from().select().eq().order()...) o suficiente para o app
// funcionar sem precisar de um Supabase real configurado.
//
// Tudo aqui vive só na memória da aba do navegador: ao dar F5,
// reseta para os dados de exemplo (seed) abaixo.
// ============================================================

function uid() {
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const db = {
  profiles: [], projects: [], project_members: [], test_suites: [],
  test_cases: [], test_plans: [], test_plan_cases: [], test_runs: [],
  test_run_cases: [], defects: [], failure_reasons: [], contacts: [],
  attachments: [], cancellation_reasons: [], defect_comments: [], jira_queue_items: [],
};

const mockUsers = []; // { id, email, password, full_name }
const mockStorageFiles = {}; // "bucket/path" -> File (só em memória, some ao recarregar)
const mockBlobUrls = {}; // "bucket/path" -> URL de blob gerada
let session = null;
const authListeners = [];

// ------------------------------------------------------------
// DADOS DE EXEMPLO (seed)
// ------------------------------------------------------------
function seed() {
  const now = new Date().toISOString();
  const userId = 'demo-user';
  mockUsers.push({ id: userId, email: 'demo@testly.local', password: 'demo123', full_name: 'Usuário Demo' });
  db.profiles.push({ id: userId, full_name: 'Usuário Demo', email: 'demo@testly.local', avatar_url: null, created_at: now });

  ['Bug funcional', 'Problema Pré-existente', 'Gap de regra / Documentação', 'Falta de Evidências / Orientações'].forEach((label) => {
    db.failure_reasons.push({ id: uid(), label, is_active: true, created_at: now });
  });
  ['Ambiente indisponível ou instável', 'Bloqueada por dependência (build, deploy, feature não pronta)', 'Escopo alterado — não é mais necessária', 'Duplicada de outra execução', 'Criada por engano'].forEach((label) => {
    db.cancellation_reasons.push({ id: uid(), label, is_active: true, created_at: now });
  });
  db.contacts.push({ id: uid(), name: 'Dev Exemplo', email: 'dev@empresa.com', kind: 'dev', is_active: true, created_at: now });
  db.contacts.push({ id: uid(), name: 'PO Exemplo', email: 'po@empresa.com', kind: 'po', is_active: true, created_at: now });

  const projectId = 'demo-project';
  db.projects.push({ id: projectId, name: 'App Mobile Banking', code: 'DEMO', description: 'Projeto de demonstração pré-carregado.', owner_id: userId, created_at: now });
  db.project_members.push({ project_id: projectId, user_id: userId, role: 'owner', is_active: true, created_at: now });

  db.jira_queue_items.push({
    id: uid(), project_id: projectId, jira_key: 'MOB-10035',
    title: 'Cadastro de Exemplos da IA (aba "Exemplos da IA" em Administração)', issue_type: 'Story',
    description_html: `
      <p><strong>Como</strong></p>
      <p>Como administrador(a) do Veiser Dados, quero cadastrar, visualizar, editar e remover exemplos de perguntas e respostas em SQL na aba "Exemplos da IA", garantindo que apenas consultas SQL válidas sejam salvas, para que o Veiser IA use esses pares como referência confiável ao traduzir perguntas em linguagem natural para consultas SQL.</p>
      <hr>
      <p><strong>Contexto de Negócio</strong></p>
      <p>O Veiser IA traduz perguntas dos usuários em consultas SQL para gerar respostas nos dashboards. Para melhorar a precisão dessas traduções, a administração precisa manter uma base de exemplos (pares pergunta / consulta SQL) usada como referência pela IA. Hoje essa manutenção ainda não existe como funcionalidade dentro do produto; a aba "Exemplos da IA", dentro de Administração, deve permitir que a equipe cadastre, edite, busque e remova esses exemplos, tornando o aperfeiçoamento da IA um processo contínuo, feito pela própria equipe, sem depender de ajuste manual fora do produto. Como a consulta SQL é digitada manualmente, o sistema precisa validar essa consulta e impedir o salvamento quando ela for inválida ou malformada — caso contrário, a base de referência da IA seria comprometida por exemplos que nem sequer executam corretamente.</p>
      <hr>
      <p><strong>Cenários de Uso</strong></p>
      <p><strong>Cenário 1 — Visualizar exemplos cadastrados</strong></p>
      <p>Dado que o usuário administrador acessa Administração > Exemplos da IA,<br>
      Quando a tela carregar,<br>
      Então o sistema deve listar todos os exemplos já cadastrados, com pergunta e consulta SQL correspondente.</p>
      <p><strong>Cenário 2 — Cadastrar novo exemplo com SQL válido</strong></p>
      <p>Dado que o usuário preencheu uma pergunta e uma consulta SQL válida,<br>
      Quando ele clicar em "Salvar",<br>
      Então o exemplo deve ser adicionado à base de referência da IA.</p>
      <p><strong>Cenário 3 — Impedir salvamento de SQL inválido</strong></p>
      <p>Dado que a consulta SQL digitada está malformada,<br>
      Quando o usuário tentar salvar,<br>
      Então o sistema deve exibir um erro e impedir o salvamento até a consulta ser corrigida.</p>
    `,
    subtasks: [
      { key: 'MOB-10037', title: '[FE] Layout e Integração', status: 'Concluído' },
      { key: 'MOB-10038', title: '[CRUD] Cadastro de Exemplos da IA (Queries SQL)', status: 'Concluído' },
      { key: 'MOB-10090', title: 'Estado real diverge do estado visual', status: 'Concluído' },
    ],
    reporter_name: 'Ana Ferreira (PO)',
    assignee_name: 'Rafael Souza (Dev)',
    priority: 'Alta',
    labels: 'admin, ia, sql',
    jira_url: 'https://suaempresa.atlassian.net/browse/MOB-10035',
    status_entered_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    claimed_by: null, claimed_at: null, created_test_case_id: null, created_at: now,
  });


  const suiteAuthId = uid();
  const suitePayId = uid();
  db.test_suites.push({ id: suiteAuthId, project_id: projectId, parent_suite_id: null, title: 'Autenticação', description: '', position: 0, created_at: now });
  db.test_suites.push({ id: suitePayId, project_id: projectId, parent_suite_id: null, title: 'Pagamentos', description: '', position: 1, created_at: now });

  function addCase(suiteId, seq, title, priority, type, automation_status, extra = {}) {
    const id = uid();
    db.test_cases.push({
      id, seq, project_id: projectId, suite_id: suiteId, title,
      description: extra.description || '',
      preconditions: extra.preconditions || 'Usuário possui conta ativa no aplicativo.',
      repro_steps: extra.repro_steps || '',
      postconditions: extra.postconditions || '<p><strong>Dado que</strong></p><p><strong>Quando</strong></p><p><strong>Então</strong></p>',
      priority, severity: 'normal', type, status: 'active', automation_status,
      tags: [], position: seq, created_by: userId, created_at: now, updated_at: now,
    });
    return id;
  }

  const c1 = addCase(suiteAuthId, 1, 'Login com credenciais válidas', 'high', 'functional', 'automated', {
    description: '<p>Valida que um usuário com credenciais corretas consegue autenticar no aplicativo.</p>',
    preconditions: 'Usuário possui conta ativa e confirmada.',
    repro_steps: '<ol><li>Abra o app</li><li>Insira usuário e senha válidos</li><li>Clique em "Acessar"</li></ol>',
    postconditions: '<p><strong>Dado que</strong> estou na tela de login</p><p><strong>Quando</strong> insiro usuário e senha válidos e clico em "Acessar"</p><p><strong>Então</strong> devo ser redirecionado para a Home autenticado</p>',
  });
  const c2 = addCase(suiteAuthId, 2, 'Login com senha incorreta', 'medium', 'functional', 'manual');
  const c3 = addCase(suiteAuthId, 3, 'Recuperação de senha por e-mail', 'medium', 'functional', 'to_automate');
  const c4 = addCase(suitePayId, 4, 'Transferência PIX entre contas', 'critical', 'e2e', 'manual');
  const c5 = addCase(suitePayId, 5, 'Pagamento de boleto com valor inválido', 'high', 'functional', 'manual');

  const planId = uid();
  db.test_plans.push({ id: planId, project_id: projectId, title: 'Ciclo de regressão — Release 1.0', description: 'Casos críticos para o primeiro release.', created_by: userId, created_at: now });
  [c1, c4, c5].forEach((tcId) => db.test_plan_cases.push({ test_plan_id: planId, test_case_id: tcId }));

  const runId = uid();
  db.test_runs.push({ id: runId, seq: 1, project_id: projectId, test_plan_id: planId, title: 'Regressão Release 1.0', environment: 'Staging', status: 'active', is_public: false, report_token: uid(), report_notes: '', created_by: userId, created_at: now, completed_at: null });

  function addRunCase(tcId, status, executedAgoMinutes) {
    db.test_run_cases.push({
      id: uid(), test_run_id: runId, test_case_id: tcId, status,
      comment: null,
      executed_by: status !== 'untested' ? userId : null,
      executed_at: status !== 'untested' ? new Date(Date.now() - executedAgoMinutes * 60000).toISOString() : null,
    });
  }
  addRunCase(c1, 'passed', 130);
  addRunCase(c2, 'passed', 115);
  addRunCase(c3, 'failed', 90);
  addRunCase(c4, 'passed', 60);
  addRunCase(c5, 'untested', 0);

  db.defects.push({
    id: uid(), seq: 1, project_id: projectId,
    title: 'Falha em: Recuperação de senha por e-mail',
    description: 'O e-mail de recuperação não chega em contas com domínio corporativo. Reproduzido 3 vezes em Staging.',
    severity: 'major', priority: 'high', status: 'open',
    test_run_case_id: null, test_case_id: c3, reporter_id: userId, assignee_id: null,
    created_at: now, updated_at: now,
  });
}
seed();

// ------------------------------------------------------------
// AUTH
// ------------------------------------------------------------
function notifyAuth(event) {
  authListeners.forEach((cb) => cb(event, session));
}

const auth = {
  async getSession() {
    return { data: { session } };
  },
  async getUser() {
    return { data: { user: session ? session.user : null } };
  },
  onAuthStateChange(cb) {
    authListeners.push(cb);
    return { data: { subscription: { unsubscribe() {} } } };
  },
  async signInWithPassword({ email, password }) {
    const u = mockUsers.find((u) => u.email === email && u.password === password);
    if (!u) return { error: { message: 'Invalid login credentials' } };
    session = { user: { id: u.id, email: u.email } };
    notifyAuth('SIGNED_IN');
    return { error: null };
  },
  async signUp({ email, password, options }) {
    if (mockUsers.find((u) => u.email === email)) {
      return { error: { message: 'User already registered' } };
    }
    const id = uid();
    const full_name = (options && options.data && options.data.full_name) || email;
    mockUsers.push({ id, email, password, full_name });
    db.profiles.push({ id, full_name, email, avatar_url: null, created_at: new Date().toISOString() });
    // Em modo demonstração, loga automaticamente (não há e-mail de confirmação real)
    session = { user: { id, email } };
    notifyAuth('SIGNED_IN');
    return { error: null };
  },
  async signOut() {
    session = null;
    notifyAuth('SIGNED_OUT');
  },
  async resetPasswordForEmail(email) {
    // Modo demonstração não envia e-mail de verdade — só avisa e segue.
    return { error: null };
  },
  async updateUser({ password }) {
    if (!session) return { error: { message: 'Nenhuma sessão ativa.' } };
    const u = mockUsers.find((u) => u.id === session.user.id);
    if (u) u.password = password;
    return { error: null };
  },
};

// ------------------------------------------------------------
// QUERY BUILDER (imita from().select().eq().order()...)
// ------------------------------------------------------------
function applyFilters(rows, filters) {
  return rows.filter((row) =>
    filters.every(([col, val, op]) => {
      if (col.indexOf('.') !== -1) {
        const [relTable, relCol] = col.split('.');
        if (relTable === 'test_runs') {
          const parent = db.test_runs.find((r) => r.id === row.test_run_id);
          return parent && parent[relCol] === val;
        }
        return true;
      }
      if (op === 'in') return Array.isArray(val) && val.indexOf(row[col]) !== -1;
      if (op === 'ilike') {
        const pattern = String(val).replace(/%/g, '').toLowerCase();
        return String(row[col] || '').toLowerCase().indexOf(pattern) !== -1;
      }
      return row[col] === val;
    })
  );
}

function embed(table, row, selectStr) {
  const out = Object.assign({}, row);
  if (table === 'test_plans' && /test_plan_cases/.test(selectStr)) {
    out.test_plan_cases = db.test_plan_cases
      .filter((tpc) => tpc.test_plan_id === row.id)
      .map((tpc) => ({ test_case_id: tpc.test_case_id }));
  }
  if (table === 'test_runs' && /test_run_cases/.test(selectStr)) {
    out.test_run_cases = db.test_run_cases
      .filter((rc) => rc.test_run_id === row.id)
      .map((rc) => ({ status: rc.status }));
  }
  if (table === 'test_run_cases' && /test_cases\(/.test(selectStr)) {
    out.test_cases = db.test_cases.find((tc) => tc.id === row.test_case_id) || null;
  }
  if (table === 'test_run_cases' && /test_runs\(/.test(selectStr)) {
    out.test_runs = db.test_runs.find((r) => r.id === row.test_run_id) || null;
  }
  if (table === 'defects' && /test_cases\(/.test(selectStr)) {
    out.test_cases = db.test_cases.find((tc) => tc.id === row.test_case_id) || null;
  }
  if (table === 'project_members' && /profiles\(/.test(selectStr)) {
    out.profiles = db.profiles.find((p) => p.id === row.user_id) || null;
  }
  return out;
}

function sortRows(rows, orderKeys) {
  if (!orderKeys || orderKeys.length === 0) return rows;
  return rows.slice().sort((a, b) => {
    for (const { col, opts } of orderKeys) {
      const asc = opts.ascending !== false;
      const nullsFirst = !!opts.nullsFirst;
      const av = a[col], bv = b[col];
      const aNull = av === null || av === undefined;
      const bNull = bv === null || bv === undefined;
      if (aNull && bNull) continue;
      if (aNull) return nullsFirst ? -1 : 1;
      if (bNull) return nullsFirst ? 1 : -1;
      if (av < bv) return asc ? -1 : 1;
      if (av > bv) return asc ? 1 : -1;
      // empatou nesta chave — passa pra próxima (ordenação secundária)
    }
    return 0;
  });
}

function nextSeq(table, projectId) {
  const rows = db[table].filter((r) => r.project_id === projectId);
  return rows.length ? Math.max.apply(null, rows.map((r) => r.seq || 0)) + 1 : 1;
}

function MockQuery(table) {
  this.table = table;
  this.filters = [];
  this.selectStr = '*';
  this.orderKeys = [];
  this.insertPayload = null;
  this.updatePayload = null;
  this.deleteFlag = false;
  this.singleMode = null;
}
MockQuery.prototype.select = function (str) { if (str) this.selectStr = str; return this; };
MockQuery.prototype.eq = function (col, val) { this.filters.push([col, val]); return this; };
MockQuery.prototype.in = function (col, vals) { this.filters.push([col, vals, 'in']); return this; };
MockQuery.prototype.ilike = function (col, val) { this.filters.push([col, val, 'ilike']); return this; };
MockQuery.prototype.order = function (col, opts) { this.orderKeys.push({ col, opts: opts || {} }); return this; };
MockQuery.prototype.limit = function (n) { this.limitCount = n; return this; };
MockQuery.prototype.insert = function (payload) { this.insertPayload = Array.isArray(payload) ? payload : [payload]; return this; };
MockQuery.prototype.update = function (payload) { this.updatePayload = payload; return this; };
MockQuery.prototype.delete = function () { this.deleteFlag = true; return this; };
MockQuery.prototype.single = function () { this.singleMode = 'single'; return this; };
MockQuery.prototype.maybeSingle = function () { this.singleMode = 'maybeSingle'; return this; };
MockQuery.prototype.then = function (resolve) {
  // Simula latência mínima de rede para não parecer "instantâneo demais"
  setTimeout(() => {
    try { resolve(this._execute()); } catch (e) { resolve({ data: null, error: { message: e.message } }); }
  }, 120);
};
MockQuery.prototype._execute = function () {
  const table = this.table;

  if (this.insertPayload) {
    if (table === 'failure_reasons' || table === 'cancellation_reasons') {
      const dup = this.insertPayload.find((p) =>
        db[table].some((r) => r.label.toLowerCase() === (p.label || '').toLowerCase()));
      if (dup) return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
    }
    const created = this.insertPayload.map((payload) => {
      const row = Object.assign({ id: uid(), created_at: new Date().toISOString() }, payload);
      if (table === 'test_cases' || table === 'test_runs' || table === 'defects') {
        row.seq = nextSeq(table, payload.project_id);
      }
      if (table === 'test_cases') {
        row.updated_at = row.updated_at || row.created_at;
        row.status = row.status || 'active';
        row.description = row.description || '';
        row.preconditions = row.preconditions || '';
        row.repro_steps = row.repro_steps || '';
        row.postconditions = row.postconditions || '';
      }
      if (table === 'test_run_cases') {
        row.status = row.status || 'untested';
        row.comment = row.comment ?? null;
        row.executed_by = row.executed_by ?? null;
        row.executed_at = row.executed_at ?? null;
        row.duration_seconds = row.duration_seconds ?? null;
        row.assignee_id = row.assignee_id ?? null;
      }
      if (table === 'test_runs') {
        row.status = row.status || 'active';
        row.is_public = row.is_public ?? false;
        row.report_token = row.report_token || uid();
        row.report_notes = row.report_notes || '';
      }
      if (table === 'project_members') {
        row.is_active = row.is_active ?? true;
      }
      if (table === 'failure_reasons' || table === 'contacts' || table === 'cancellation_reasons') {
        row.is_active = row.is_active ?? true;
      }
      if (table === 'defects' && (row.status === 'resolved' || row.status === 'closed')) {
        row.resolved_at = row.resolved_at || new Date().toISOString();
      }
      db[table].push(row);
      if (table === 'projects') {
        db.project_members.push({ project_id: row.id, user_id: row.owner_id, role: 'owner', is_active: true, created_at: row.created_at });
      }
      return row;
    });
    return { data: this.singleMode ? created[0] : created, error: null };
  }

  if (this.updatePayload) {
    const matches = applyFilters(db[table], this.filters);
    matches.forEach((row) => {
      if (table === 'defects' && 'status' in this.updatePayload) {
        const wasResolved = row.status === 'resolved' || row.status === 'closed';
        const willBeResolved = this.updatePayload.status === 'resolved' || this.updatePayload.status === 'closed';
        if (willBeResolved && !wasResolved) this.updatePayload.resolved_at = new Date().toISOString();
        else if (!willBeResolved) this.updatePayload.resolved_at = null;
      }
      Object.assign(row, this.updatePayload);
    });
    return { data: this.singleMode ? matches[0] || null : matches, error: null };
  }

  if (this.deleteFlag) {
    const matches = applyFilters(db[table], this.filters);
    if (table === 'failure_reasons' && matches.some((r) => db.defects.some((d) => d.failure_reason_id === r.id))) {
      return { data: null, error: { message: 'violates foreign key constraint (em uso por algum defeito)' } };
    }
    if (table === 'contacts' && matches.some((c) => db.defects.some((d) => d.dev_contact_id === c.id || d.po_contact_id === c.id))) {
      return { data: null, error: { message: 'violates foreign key constraint (em uso por algum defeito)' } };
    }
    if (table === 'cancellation_reasons' && matches.some((r) => db.test_runs.some((run) => run.cancellation_reason_id === r.id))) {
      return { data: null, error: { message: 'violates foreign key constraint (em uso por alguma execução)' } };
    }
    db[table] = db[table].filter((row) => matches.indexOf(row) === -1);
    return { data: matches, error: null };
  }

  // SELECT
  let baseRows = db[table];
  if (table === 'projects') {
    const myIds = db.project_members
      .filter((m) => m.user_id === (session && session.user.id) && m.is_active !== false)
      .map((m) => m.project_id);
    baseRows = baseRows.filter((p) => myIds.indexOf(p.id) !== -1);
  }
  if (table === 'project_members') {
    const myProjectIds = db.project_members
      .filter((m) => m.user_id === (session && session.user.id) && m.is_active !== false)
      .map((m) => m.project_id);
    baseRows = baseRows.filter((m) => myProjectIds.indexOf(m.project_id) !== -1);
  }

  let rows = applyFilters(baseRows, this.filters);
  rows = sortRows(rows, this.orderKeys);
  if (this.limitCount) rows = rows.slice(0, this.limitCount);
  rows = rows.map((row) => embed(table, row, this.selectStr));

  if (this.singleMode === 'single') {
    return { data: rows[0] || null, error: rows[0] ? null : { message: 'Row not found' } };
  }
  if (this.singleMode === 'maybeSingle') {
    return { data: rows[0] || null, error: null };
  }
  return { data: rows, error: null };
};

function from(table) {
  if (!db[table]) db[table] = [];
  return new MockQuery(table);
}

export function createMockSupabaseClient() {
  return {
    auth,
    from,
    async rpc(fnName, params) {
      if (fnName === 'find_user_by_email') {
        const email = (params?.p_email || '').toLowerCase();
        const profile = db.profiles.find((p) => (p.email || '').toLowerCase() === email);
        return { data: profile ? [{ id: profile.id, full_name: profile.full_name }] : [], error: null };
      }
      if (fnName === 'get_public_report') {
        const run = db.test_runs.find((r) => r.report_token === params?.p_token && r.is_public);
        if (!run) return { data: null, error: { message: 'Relatório não encontrado ou não é público.' } };
        const runCases = db.test_run_cases.filter((rc) => rc.test_run_id === run.id).map((rc) => ({
          ...rc,
          test_cases: db.test_cases.find((tc) => tc.id === rc.test_case_id) || null,
        }));
        return { data: { run, run_cases: runCases }, error: null };
      }
      return { data: null, error: { message: `RPC "${fnName}" não implementada no modo demonstração.` } };
    },
    storage: {
      from(bucket) {
        return {
          async upload(path, file) {
            mockStorageFiles[`${bucket}/${path}`] = file;
            return { data: { path }, error: null };
          },
          async createSignedUrl(path, expiresIn) {
            const file = mockStorageFiles[`${bucket}/${path}`];
            if (!file) return { data: null, error: { message: 'Arquivo não encontrado (modo demonstração — some ao recarregar a página).' } };
            // Reaproveita a mesma URL de blob enquanto a página não recarrega
            if (!mockBlobUrls[`${bucket}/${path}`]) mockBlobUrls[`${bucket}/${path}`] = URL.createObjectURL(file);
            return { data: { signedUrl: mockBlobUrls[`${bucket}/${path}`] }, error: null };
          },
          async remove(paths) {
            paths.forEach((p) => {
              delete mockStorageFiles[`${bucket}/${p}`];
              if (mockBlobUrls[`${bucket}/${p}`]) { URL.revokeObjectURL(mockBlobUrls[`${bucket}/${p}`]); delete mockBlobUrls[`${bucket}/${p}`]; }
            });
            return { data: null, error: null };
          },
        };
      },
    },
  };
}

// Exposto para depuração manual no console do navegador, se precisar
if (typeof window !== 'undefined') window.__testlyMockDb = db;

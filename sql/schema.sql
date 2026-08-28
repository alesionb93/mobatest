-- ============================================================
-- QASE CLONE - SCHEMA SUPABASE (Postgres)
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- (Project > SQL Editor > New query > cole tudo > Run)
-- ============================================================

-- Extensão para gerar UUIDs
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- PROFILES (espelha auth.users com dados extras)
-- ------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- Cria o profile automaticamente quando um usuário se cadastra
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ------------------------------------------------------------
-- PROJECTS
-- ------------------------------------------------------------
create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  code text not null, -- prefixo curto, ex: "PROJ" usado nos IDs (PROJ-1, PROJ-2...)
  description text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id),
  -- Chave estrangeira extra (redundante com a de auth.users acima, mas
  -- necessária): o PostgREST só resolve a busca aninhada profiles(...)
  -- quando existe uma FK direta entre as duas tabelas.
  constraint project_members_user_id_profiles_fkey foreign key (user_id) references profiles(id) on delete cascade
);

-- Ao criar um projeto, o criador vira membro "owner" automaticamente
create or replace function handle_new_project()
returns trigger as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_project_created on projects;
create trigger on_project_created
  after insert on projects
  for each row execute procedure handle_new_project();

-- ------------------------------------------------------------
-- TEST SUITES (pastas/hierarquia de casos de teste)
-- ------------------------------------------------------------
create table if not exists test_suites (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  parent_suite_id uuid references test_suites(id) on delete cascade,
  title text not null,
  description text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- TEST CASES
-- ------------------------------------------------------------
create table if not exists test_cases (
  id uuid primary key default uuid_generate_v4(),
  seq int not null, -- número sequencial por projeto, ex: 1, 2, 3...
  project_id uuid not null references projects(id) on delete cascade,
  suite_id uuid references test_suites(id) on delete set null,
  title text not null,
  description text not null default '',
  preconditions text,
  postconditions text not null default '',
  repro_steps text not null default '',
  steps jsonb not null default '[]'::jsonb, -- [{action, expected}]
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  severity text not null default 'normal' check (severity in ('minor','normal','major','critical')),
  type text not null default 'functional' check (type in ('functional','regression','smoke','integration','e2e','performance','security','usability','other')),
  status text not null default 'active' check (status in ('active','draft','deprecated')),
  automation_status text not null default 'manual' check (automation_status in ('manual','automated','to_automate')),
  tags text[] not null default '{}',
  position int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_test_cases_project on test_cases(project_id);
create index if not exists idx_test_cases_suite on test_cases(suite_id);

-- Sequência amigável por projeto (PROJ-1, PROJ-2...)
create or replace function set_test_case_seq()
returns trigger as $$
begin
  select coalesce(max(seq), 0) + 1 into new.seq
  from test_cases where project_id = new.project_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_test_case_seq on test_cases;
create trigger trg_test_case_seq
  before insert on test_cases
  for each row execute procedure set_test_case_seq();

-- ------------------------------------------------------------
-- TEST PLANS
-- ------------------------------------------------------------
create table if not exists test_plans (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists test_plan_cases (
  test_plan_id uuid not null references test_plans(id) on delete cascade,
  test_case_id uuid not null references test_cases(id) on delete cascade,
  primary key (test_plan_id, test_case_id)
);

-- ------------------------------------------------------------
-- TEST RUNS (execuções)
-- ------------------------------------------------------------
create table if not exists cancellation_reasons (
  id uuid primary key default uuid_generate_v4(),
  label text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists test_runs (
  id uuid primary key default uuid_generate_v4(),
  seq int not null,
  project_id uuid not null references projects(id) on delete cascade,
  test_plan_id uuid references test_plans(id) on delete set null,
  title text not null,
  environment text,
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  is_public boolean not null default false,
  report_token uuid not null default uuid_generate_v4(),
  report_notes text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  cancellation_reason_id uuid references cancellation_reasons(id)
);

create or replace function set_test_run_seq()
returns trigger as $$
begin
  select coalesce(max(seq), 0) + 1 into new.seq
  from test_runs where project_id = new.project_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_test_run_seq on test_runs;
create trigger trg_test_run_seq
  before insert on test_runs
  for each row execute procedure set_test_run_seq();

-- Resultado de cada caso dentro de uma execução
create table if not exists test_run_cases (
  id uuid primary key default uuid_generate_v4(),
  test_run_id uuid not null references test_runs(id) on delete cascade,
  test_case_id uuid not null references test_cases(id) on delete cascade,
  status text not null default 'untested' check (status in ('untested','passed','failed','blocked','skipped','pre_existing')),
  comment text,
  duration_seconds integer,
  executed_by uuid references auth.users(id),
  executed_at timestamptz,
  assignee_id uuid references auth.users(id),
  unique (test_run_id, test_case_id)
);

create index if not exists idx_trc_run on test_run_cases(test_run_id);

-- ------------------------------------------------------------
-- DEFECTS (bugs)
-- ------------------------------------------------------------
-- Motivos de falha — lista única para toda a conta (não por projeto).
create table if not exists failure_reasons (
  id uuid primary key default uuid_generate_v4(),
  label text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Contatos de Dev/PO — agenda simples, sem login e sem acesso ao sistema.
create table if not exists contacts (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text,
  kind text not null check (kind in ('dev', 'po')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists defects (
  id uuid primary key default uuid_generate_v4(),
  seq int not null,
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  severity text not null default 'normal' check (severity in ('minor','normal','major','critical')),
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  test_run_case_id uuid references test_run_cases(id) on delete set null,
  test_case_id uuid references test_cases(id) on delete set null,
  reporter_id uuid references auth.users(id),
  assignee_id uuid references auth.users(id),
  failure_reason_id uuid references failure_reasons(id),
  dev_contact_id uuid references contacts(id),
  po_contact_id uuid references contacts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists attachments (
  id uuid primary key default uuid_generate_v4(),
  defect_id uuid not null references defects(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  file_type text not null,
  file_size bigint not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists defect_comments (
  id uuid primary key default uuid_generate_v4(),
  defect_id uuid not null references defects(id) on delete cascade,
  user_id uuid references auth.users(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists jira_queue_items (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  jira_key text not null,
  title text not null,
  issue_type text default 'Story',
  jira_url text,
  entered_status_at timestamptz not null default now(),
  assigned_to uuid references auth.users(id),
  test_case_id uuid references test_cases(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, jira_key)
);

create or replace function set_defect_seq()
returns trigger as $$
begin
  select coalesce(max(seq), 0) + 1 into new.seq
  from defects where project_id = new.project_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_defect_seq on defects;
create trigger trg_defect_seq
  before insert on defects
  for each row execute procedure set_defect_seq();

create or replace function set_defect_resolved_at()
returns trigger as $$
begin
  if new.status in ('resolved', 'closed') and (old.status is null or old.status not in ('resolved', 'closed')) then
    new.resolved_at = now();
  elsif new.status not in ('resolved', 'closed') then
    new.resolved_at = null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_defect_resolved_at_update on defects;
create trigger trg_defect_resolved_at_update before update on defects
  for each row execute procedure set_defect_resolved_at();

drop trigger if exists trg_defect_resolved_at_insert on defects;
create trigger trg_defect_resolved_at_insert before insert on defects
  for each row execute procedure set_defect_resolved_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- Regra geral: usuário só acessa dados de projetos onde é membro
-- ============================================================

alter table profiles enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table test_suites enable row level security;
alter table test_cases enable row level security;
alter table test_plans enable row level security;
alter table test_plan_cases enable row level security;
alter table test_runs enable row level security;
alter table test_run_cases enable row level security;
alter table defects enable row level security;
alter table failure_reasons enable row level security;
alter table cancellation_reasons enable row level security;
alter table attachments enable row level security;
alter table defect_comments enable row level security;
alter table jira_queue_items enable row level security;
alter table contacts enable row level security;

-- Helper: usuário é membro do projeto?
create or replace function is_project_member(pid uuid)
returns boolean as $$
  select exists (
    select 1 from project_members
    where project_id = pid and user_id = auth.uid() and is_active = true
  );
$$ language sql security definer stable;

-- PROFILES
-- Permite ver o próprio perfil, ou o de quem compartilha algum projeto
-- com você (necessário pra nomes de colegas aparecerem corretamente
-- em execuções, atribuições, etc.)
create policy "profiles: leitura própria ou de colegas de projeto" on profiles for select using (
  auth.uid() = id
  or exists (
    select 1 from project_members pm_eu
    join project_members pm_colega on pm_colega.project_id = pm_eu.project_id
    where pm_eu.user_id = auth.uid() and pm_colega.user_id = profiles.id
  )
);
create policy "profiles: update próprio" on profiles for update using (auth.uid() = id);

-- Busca um usuário pelo e-mail, usada só na hora de convidar pra um
-- projeto (nesse momento, convidador e convidado ainda não compartilham
-- projeto nenhum, então a política de SELECT acima ainda não liberaria
-- a busca — por isso esta função roda como SECURITY DEFINER, mas só
-- devolve id + nome, nunca a lista inteira de usuários).
create or replace function find_user_by_email(p_email text)
returns table(id uuid, full_name text) as $$
  select id, full_name from profiles where email = p_email limit 1;
$$ language sql security definer stable;

grant execute on function find_user_by_email(text) to authenticated;

-- PROJECTS
-- A cláusula "or owner_id = auth.uid()" é necessária por causa de uma
-- particularidade do Postgres: ao criar um projeto com ".select()"
-- encadeado, o retorno (RETURNING) também precisa passar pela política
-- de SELECT — mas o trigger que popula project_members roda DEPOIS do
-- INSERT. Sem essa cláusula extra, o dono do projeto não consegue ver
-- a própria linha recém-criada nesse instante, e o Postgres devolve um
-- erro de RLS mesmo com a política de INSERT correta.
create policy "projects: select se membro" on projects for select using (is_project_member(id) or owner_id = auth.uid());
create policy "projects: insert autenticado" on projects for insert with check (auth.uid() = owner_id);
create policy "projects: update se membro" on projects for update using (is_project_member(id));
create policy "projects: delete se owner" on projects for delete using (owner_id = auth.uid());

-- PROJECT_MEMBERS
-- Observação: a inserção do "owner" ao criar um projeto acontece via trigger
-- (handle_new_project), que roda como SECURITY DEFINER e não passa por RLS.
-- Aqui só liberamos convites feitos por quem já é membro do projeto.
create policy "members: select se membro" on project_members for select using (is_project_member(project_id));
create policy "members: insert se membro" on project_members for insert with check (is_project_member(project_id));
create policy "members: delete se membro" on project_members for delete using (is_project_member(project_id));

-- TEST SUITES
create policy "suites: all se membro" on test_suites for all using (is_project_member(project_id)) with check (is_project_member(project_id));

-- TEST CASES
create policy "cases: all se membro" on test_cases for all using (is_project_member(project_id)) with check (is_project_member(project_id));

-- TEST PLANS
create policy "plans: all se membro" on test_plans for all using (is_project_member(project_id)) with check (is_project_member(project_id));

-- TEST PLAN CASES
create policy "plan_cases: all se membro" on test_plan_cases for all using (
  exists (select 1 from test_plans p where p.id = test_plan_id and is_project_member(p.project_id))
) with check (
  exists (select 1 from test_plans p where p.id = test_plan_id and is_project_member(p.project_id))
);

-- TEST RUNS
create policy "runs: all se membro" on test_runs for all using (is_project_member(project_id)) with check (is_project_member(project_id));

-- TEST RUN CASES
create policy "run_cases: all se membro" on test_run_cases for all using (
  exists (select 1 from test_runs r where r.id = test_run_id and is_project_member(r.project_id))
) with check (
  exists (select 1 from test_runs r where r.id = test_run_id and is_project_member(r.project_id))
);

-- DEFECTS
create policy "defects: all se membro" on defects for all using (is_project_member(project_id)) with check (is_project_member(project_id));

-- MOTIVOS DE FALHA E CONTATOS (Dev/PO) — leitura livre pra quem está
-- logado (precisa pra preencher os dropdowns), gestão só pra quem é
-- admin/dono de algum projeto.
create or replace function is_admin_anywhere()
returns boolean as $$
  select exists (
    select 1 from project_members
    where user_id = auth.uid() and role in ('owner', 'admin') and is_active = true
  );
$$ language sql security definer stable;

create policy "failure_reasons: leitura autenticada" on failure_reasons for select using (auth.uid() is not null);
create policy "failure_reasons: insert se admin" on failure_reasons for insert with check (is_admin_anywhere());
create policy "failure_reasons: update se admin" on failure_reasons for update using (is_admin_anywhere());
create policy "failure_reasons: delete se admin" on failure_reasons for delete using (is_admin_anywhere());

create policy "contacts: leitura autenticada" on contacts for select using (auth.uid() is not null);
create policy "contacts: insert se admin" on contacts for insert with check (is_admin_anywhere());
create policy "contacts: update se admin" on contacts for update using (is_admin_anywhere());
create policy "contacts: delete se admin" on contacts for delete using (is_admin_anywhere());

insert into failure_reasons (label) values
  ('Bug funcional'),
  ('Problema Pré-existente'),
  ('Gap de regra / Documentação'),
  ('Falta de Evidências / Orientações')
on conflict (label) do nothing;

-- ATTACHMENTS
create policy "attachments: acesso de membros do projeto do defeito" on attachments for all
using (exists (select 1 from defects d where d.id = attachments.defect_id and is_project_member(d.project_id)))
with check (exists (select 1 from defects d where d.id = attachments.defect_id and is_project_member(d.project_id)));

-- DEFECT_COMMENTS
create policy "defect_comments: leitura de membros do projeto" on defect_comments for select
using (exists (select 1 from defects d where d.id = defect_comments.defect_id and is_project_member(d.project_id)));

create policy "defect_comments: inserir se membro do projeto" on defect_comments for insert
with check (
  exists (select 1 from defects d where d.id = defect_comments.defect_id and is_project_member(d.project_id))
  and user_id = auth.uid()
);

create policy "defect_comments: excluir próprio comentário" on defect_comments for delete
using (user_id = auth.uid());

-- JIRA_QUEUE_ITEMS
create policy "jira_queue_items: acesso de membros do projeto" on jira_queue_items for all
using (is_project_member(project_id))
with check (is_project_member(project_id));

insert into jira_queue_items (project_id, jira_key, title, issue_type, entered_status_at, jira_url)
select id, 'WA-234', 'Implementar login via biometria (Touch ID / Face ID)', 'Story', now() - interval '3 hours', 'https://suaempresa.atlassian.net/browse/WA-234'
from projects
limit 1
on conflict (project_id, jira_key) do nothing;

-- CANCELLATION_REASONS
create policy "cancellation_reasons: leitura autenticada" on cancellation_reasons for select using (auth.uid() is not null);
create policy "cancellation_reasons: insert se admin" on cancellation_reasons for insert with check (is_admin_anywhere());
create policy "cancellation_reasons: update se admin" on cancellation_reasons for update using (is_admin_anywhere());
create policy "cancellation_reasons: delete se admin" on cancellation_reasons for delete using (is_admin_anywhere());

insert into cancellation_reasons (label) values
  ('Ambiente indisponível ou instável'),
  ('Bloqueada por dependência (build, deploy, feature não pronta)'),
  ('Escopo alterado — não é mais necessária'),
  ('Duplicada de outra execução'),
  ('Criada por engano')
on conflict (label) do nothing;

-- STORAGE — bucket privado pras evidências de defeito
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence', 'evidence', false, 157286400,
  array['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','video/quicktime','application/pdf','text/plain','text/csv']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "evidence: leitura de membros do projeto" on storage.objects for select
using (bucket_id = 'evidence' and is_project_member((storage.foldername(name))[1]::uuid));

create policy "evidence: upload de membros do projeto" on storage.objects for insert
with check (bucket_id = 'evidence' and is_project_member((storage.foldername(name))[1]::uuid));

create policy "evidence: exclusão de membros do projeto" on storage.objects for delete
using (bucket_id = 'evidence' and is_project_member((storage.foldername(name))[1]::uuid));

-- ------------------------------------------------------------
-- RELATÓRIO PÚBLICO — via função SECURITY DEFINER, não via RLS
-- aberta. Isso evita que qualquer pessoa com a anon key (pública
-- no navegador) consiga listar todas as execuções públicas do
-- projeto: só quem sabe o token exato (o link) recebe dados.
-- ------------------------------------------------------------
create or replace function get_public_report(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  select json_build_object(
    'run', json_build_object(
      'id', r.id, 'title', r.title, 'environment', r.environment,
      'status', r.status, 'created_at', r.created_at, 'completed_at', r.completed_at,
      'report_notes', r.report_notes, 'project_code', p.code, 'project_name', p.name
    ),
    'cases', coalesce((
      select json_agg(json_build_object(
        'id', rc.id, 'status', rc.status, 'comment', rc.comment,
        'duration_seconds', rc.duration_seconds, 'executed_at', rc.executed_at,
        'case_id', tc.id, 'seq', tc.seq, 'title', tc.title, 'priority', tc.priority,
        'suite_id', tc.suite_id
      ))
      from test_run_cases rc
      join test_cases tc on tc.id = rc.test_case_id
      where rc.test_run_id = r.id
    ), '[]'::json),
    'suites', coalesce((
      select json_agg(json_build_object('id', s.id, 'title', s.title, 'parent_suite_id', s.parent_suite_id))
      from test_suites s
      where s.project_id = r.project_id
    ), '[]'::json),
    'defects', coalesce((
      select json_agg(json_build_object(
        'seq', d.seq, 'title', d.title, 'severity', d.severity,
        'status', d.status, 'test_run_case_id', d.test_run_case_id
      ))
      from defects d
      join test_run_cases rc2 on rc2.id = d.test_run_case_id
      where rc2.test_run_id = r.id
    ), '[]'::json)
  ) into result
  from test_runs r
  join projects p on p.id = r.project_id
  where r.report_token = p_token and r.is_public = true;

  return result;
end;
$$;

grant execute on function get_public_report(uuid) to anon, authenticated;

-- ============================================================
-- FILA DO JIRA — cards que entraram em "Para teste"
-- ============================================================
create table if not exists jira_queue_items (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  jira_key text not null,
  title text not null,
  issue_type text,
  description text,
  description_html text,
  acceptance_criteria text,
  reporter_name text,
  assignee_name text,
  priority text,
  labels text,
  jira_url text,
  subtasks jsonb not null default '[]'::jsonb,
  status_entered_at timestamptz not null default now(),
  claimed_by uuid references auth.users(id),
  claimed_at timestamptz,
  created_test_case_id uuid references test_cases(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table jira_queue_items enable row level security;

create policy "jira_queue_items: acesso de membros do projeto" on jira_queue_items for all
using (is_project_member(project_id))
with check (is_project_member(project_id));

-- ============================================================
-- FIM DO SCHEMA
-- ============================================================

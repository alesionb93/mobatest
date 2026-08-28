-- ============================================================
-- Fila do Jira — protótipo (estrutura pronta pra integração
-- futura via webhook; por enquanto só com 1 card de exemplo)
-- ============================================================
-- Rode este arquivo no SQL Editor do seu projeto Supabase.

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

alter table jira_queue_items enable row level security;

create policy "jira_queue_items: acesso de membros do projeto" on jira_queue_items for all
using (is_project_member(project_id))
with check (is_project_member(project_id));

-- Card de exemplo, só pra apresentação (entra no primeiro projeto que
-- encontrar — ajuste o "where" se quiser mirar um projeto específico).
insert into jira_queue_items (project_id, jira_key, title, issue_type, entered_status_at, jira_url)
select id, 'WA-234', 'Implementar login via biometria (Touch ID / Face ID)', 'Story', now() - interval '3 hours', 'https://suaempresa.atlassian.net/browse/WA-234'
from projects
limit 1
on conflict (project_id, jira_key) do nothing;

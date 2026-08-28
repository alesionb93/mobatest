-- ============================================================
-- Fila do Jira — cards que entraram em "Para teste"
-- ============================================================
-- Rode este arquivo no SQL Editor do seu projeto Supabase.
--
-- Esta tabela guarda os itens que, no futuro, o webhook do Jira vai
-- inserir automaticamente quando um card mudar pro status "Para teste".
-- Por enquanto, sem o webhook configurado, você pode inserir itens
-- manualmente aqui (o SQL de exemplo no final já cria um card fictício
-- pra você apresentar a ideia).

create table if not exists jira_queue_items (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  jira_key text not null,
  title text not null,
  issue_type text,
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

-- Card fictício pra apresentar a ideia — troque o project_id abaixo pelo
-- id do seu projeto (rode "select id, name from projects;" pra achar).
-- Se preferir, apague esta linha e insira você mesmo pela própria tela.
insert into jira_queue_items (project_id, jira_key, title, issue_type, status_entered_at)
select id, 'MOB-482', 'Permitir login com biometria no app', 'Story', now() - interval '3 hours'
from projects
order by created_at
limit 1;

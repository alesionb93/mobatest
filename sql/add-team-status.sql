-- ============================================================
-- Página "Equipe" — status ativo/inativo, última atividade
-- ============================================================
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase
-- (depois de já ter rodado o add-project-invites.sql).

-- 1) Permite desativar o acesso de alguém sem removê-lo do projeto
-- (fica na lista, mas perde acesso até ser reativado).
alter table project_members add column if not exists is_active boolean not null default true;

-- 2) Guarda quando cada pessoa usou o app pela última vez.
alter table profiles add column if not exists last_seen_at timestamptz;

-- 3) A checagem de "é membro do projeto" passa a exigir também que o
-- acesso esteja ativo — assim, desativar alguém aqui realmente bloqueia
-- o acesso dela (não é só cosmético na lista).
create or replace function is_project_member(pid uuid)
returns boolean as $$
  select exists (
    select 1 from project_members
    where project_id = pid and user_id = auth.uid() and is_active = true
  );
$$ language sql security definer stable;

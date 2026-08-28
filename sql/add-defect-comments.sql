-- ============================================================
-- Comentários em defeitos
-- ============================================================
-- Rode este arquivo no SQL Editor do seu projeto Supabase.

create table if not exists defect_comments (
  id uuid primary key default uuid_generate_v4(),
  defect_id uuid not null references defects(id) on delete cascade,
  user_id uuid references auth.users(id),
  body text not null,
  created_at timestamptz not null default now()
);

alter table defect_comments enable row level security;

-- Qualquer membro do projeto (dono do defeito) pode ler e comentar.
create policy "defect_comments: leitura de membros do projeto" on defect_comments for select
using (exists (select 1 from defects d where d.id = defect_comments.defect_id and is_project_member(d.project_id)));

create policy "defect_comments: inserir se membro do projeto" on defect_comments for insert
with check (
  exists (select 1 from defects d where d.id = defect_comments.defect_id and is_project_member(d.project_id))
  and user_id = auth.uid()
);

-- Só o próprio autor pode apagar o comentário dele.
create policy "defect_comments: excluir próprio comentário" on defect_comments for delete
using (user_id = auth.uid());

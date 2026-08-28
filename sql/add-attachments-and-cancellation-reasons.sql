-- ============================================================
-- Evidências de verdade (Storage) + motivos de cancelamento
-- ============================================================
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase.

-- 1) Bucket de armazenamento pras evidências (fotos/vídeos/arquivos).
-- Privado (não público) — só é acessível via link temporário gerado na
-- hora, dentro da aplicação. Limite de 150MB por arquivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence', 'evidence', false, 157286400,
  array['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','video/quicktime','application/pdf','text/plain','text/csv']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2) Tabela que guarda a REFERÊNCIA de cada arquivo (o arquivo em si
-- mora no Storage, não no banco).
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

alter table attachments enable row level security;
create policy "attachments: acesso de membros do projeto do defeito" on attachments for all
using (exists (select 1 from defects d where d.id = attachments.defect_id and is_project_member(d.project_id)))
with check (exists (select 1 from defects d where d.id = attachments.defect_id and is_project_member(d.project_id)));

-- 3) Políticas do Storage: só membros do projeto (identificado pela
-- primeira pasta do caminho do arquivo, ex: "{project_id}/...") podem
-- subir, ver ou apagar evidências.
create policy "evidence: leitura de membros do projeto" on storage.objects for select
using (bucket_id = 'evidence' and is_project_member((storage.foldername(name))[1]::uuid));

create policy "evidence: upload de membros do projeto" on storage.objects for insert
with check (bucket_id = 'evidence' and is_project_member((storage.foldername(name))[1]::uuid));

create policy "evidence: exclusão de membros do projeto" on storage.objects for delete
using (bucket_id = 'evidence' and is_project_member((storage.foldername(name))[1]::uuid));

-- 4) Motivos de cancelamento de execução — mesmo padrão dos motivos de
-- falha de defeito (lista única pra conta toda, só admin/dono edita).
create table if not exists cancellation_reasons (
  id uuid primary key default uuid_generate_v4(),
  label text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table test_runs add column if not exists cancellation_reason_id uuid references cancellation_reasons(id);

alter table cancellation_reasons enable row level security;
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

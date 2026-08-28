-- ============================================================
-- Motivo da falha + Dev/PO responsável nos defeitos
-- ============================================================
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase.

-- 1) Motivos de falha — lista única para toda a conta (não por projeto).
create table if not exists failure_reasons (
  id uuid primary key default uuid_generate_v4(),
  label text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2) Contatos de Dev/PO — agenda simples, SEM login e SEM acesso ao
-- sistema. É só um cadastro informativo pra aparecer nos dropdowns do
-- defeito. Se um dia alguém dessa lista precisar de fato usar o
-- Mobatest, convide-o normalmente pela tela de Equipe (são cadastros
-- independentes, um não interfere no outro).
create table if not exists contacts (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text,
  kind text not null check (kind in ('dev', 'po')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3) Novos campos no defeito.
alter table defects add column if not exists failure_reason_id uuid references failure_reasons(id);
alter table defects add column if not exists dev_contact_id uuid references contacts(id);
alter table defects add column if not exists po_contact_id uuid references contacts(id);

-- 4) Segurança: qualquer pessoa logada pode LER as duas listas (precisa
-- pra preencher os dropdowns), mas só quem é admin/dono de algum
-- projeto pode cadastrar, editar ou remover itens delas.
alter table failure_reasons enable row level security;
alter table contacts enable row level security;

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

-- 5) Pré-cadastra os motivos que você já definiu.
insert into failure_reasons (label) values
  ('Bug funcional'),
  ('Problema Pré-existente'),
  ('Gap de regra / Documentação'),
  ('Falta de Evidências / Orientações')
on conflict (label) do nothing;

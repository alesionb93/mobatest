-- ============================================================
-- Convite de membros para um projeto
-- ============================================================
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase.

-- 1) Guarda o e-mail no perfil (necessário pra poder convidar por e-mail).
alter table profiles add column if not exists email text;

-- Preenche o e-mail de quem já tem conta hoje, puxando de auth.users
-- (só funciona rodando com privilégio de owner do banco, como no SQL Editor).
update profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- Passa a preencher o e-mail automaticamente pra contas novas também.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email);
  return new;
end;
$$ language plpgsql security definer;

-- 2) Corrige a leitura de perfis: hoje cada pessoa só enxerga o PRÓPRIO
-- perfil, então nomes de colegas apareceriam em branco em toda a
-- aplicação (executor de teste, responsável, quem criou a execução...).
-- Passa a permitir ver o perfil de quem compartilha pelo menos um
-- projeto com você.
drop policy if exists "profiles: leitura própria" on profiles;
create policy "profiles: leitura própria ou de colegas de projeto" on profiles for select using (
  auth.uid() = id
  or exists (
    select 1 from project_members pm_eu
    join project_members pm_colega on pm_colega.project_id = pm_eu.project_id
    where pm_eu.user_id = auth.uid() and pm_colega.user_id = profiles.id
  )
);

-- 3) Função de busca por e-mail, usada só na hora de convidar.
-- É SECURITY DEFINER (ignora RLS) porque, nesse momento, quem convida e
-- quem está sendo convidado ainda NÃO compartilham nenhum projeto — a
-- política acima (item 2) não liberaria a busca ainda. Por segurança,
-- devolve só o essencial (id e nome), nunca a lista inteira de usuários.
create or replace function find_user_by_email(p_email text)
returns table(id uuid, full_name text) as $$
  select id, full_name from profiles where email = p_email limit 1;
$$ language sql security definer stable;

grant execute on function find_user_by_email(text) to authenticated;

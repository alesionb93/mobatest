-- ============================================================
-- Corrige "Could not find a relationship between project_members
-- and profiles" na tela de Equipe
-- ============================================================

-- 1) Cria o perfil que está faltando para qualquer user_id que já
-- exista em project_members mas não tenha uma linha em profiles
-- (puxando o e-mail direto de auth.users).
insert into public.profiles (id, full_name, email)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', u.email), u.email
from auth.users u
where u.id in (select user_id from project_members)
  and u.id not in (select id from profiles)
on conflict (id) do nothing;

-- 2) Agora sim, adiciona a chave estrangeira.
alter table project_members
  add constraint project_members_user_id_profiles_fkey
  foreign key (user_id) references profiles(id) on delete cascade;

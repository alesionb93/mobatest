-- ============================================================
-- Fila do Jira — campos adicionais pra tela de detalhe
-- ============================================================
-- Rode este arquivo no SQL Editor do seu projeto Supabase
-- (depois de já ter rodado o add-jira-queue.sql).

alter table jira_queue_items add column if not exists description text;
alter table jira_queue_items add column if not exists acceptance_criteria text;
alter table jira_queue_items add column if not exists reporter_name text;
alter table jira_queue_items add column if not exists assignee_name text;
alter table jira_queue_items add column if not exists priority text;
alter table jira_queue_items add column if not exists labels text;
alter table jira_queue_items add column if not exists jira_url text;

-- Enriquece o card fictício já inserido, se existir.
update jira_queue_items
set
  description = 'Como usuário do app, quero conseguir entrar usando a biometria do celular (digital ou reconhecimento facial), pra não precisar digitar usuário e senha toda vez que abrir o aplicativo.',
  acceptance_criteria = 'Dado que o usuário já fez login pelo menos uma vez com usuário e senha
Quando ele reabrir o app com a biometria habilitada no aparelho
Então deve ser possível entrar usando digital ou Face ID, sem digitar a senha

Dado que a biometria falha (digital não reconhecida)
Quando o usuário tentar novamente 3 vezes
Então o app deve oferecer a opção de entrar com usuário e senha normalmente',
  reporter_name = 'Ana Ferreira (PO)',
  assignee_name = 'Rafael Souza (Dev)',
  priority = 'Alta',
  labels = 'mobile, autenticação, ux',
  jira_url = 'https://suaempresa.atlassian.net/browse/MOB-482'
where jira_key = 'MOB-482' or jira_key = 'DEMO-482';

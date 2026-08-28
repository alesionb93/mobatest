-- ============================================================
-- Fila do Jira — descrição em HTML único + subtarefas
-- ============================================================
-- Rode este arquivo no SQL Editor do seu projeto Supabase
-- (depois de já ter rodado add-jira-queue.sql e add-jira-queue-details.sql).
--
-- A "Descrição" do Jira vem inteira em UM bloco de HTML só (com os
-- próprios títulos internos como "Como", "Contexto de Negócio", etc.
-- já formatados) — é assim que a API do Jira entrega quando pedimos o
-- campo "renderizado" (renderedFields). Por isso trocamos os campos
-- separados de antes por um único "description_html".

alter table jira_queue_items add column if not exists description_html text;
alter table jira_queue_items add column if not exists subtasks jsonb not null default '[]'::jsonb;

-- ============================================================
-- Corrige erro ao marcar um caso como "Pré-existente" numa execução
-- ============================================================
-- Rode este arquivo no SQL Editor do seu projeto Supabase.
--
-- O status "pre_existing" já é usado pela aplicação há um bom tempo,
-- mas a restrição (check constraint) da tabela test_run_cases no seu
-- banco ainda não foi atualizada pra permitir esse valor — por isso o
-- erro "violates check constraint test_run_cases_status_check".

alter table test_run_cases drop constraint if exists test_run_cases_status_check;
alter table test_run_cases add constraint test_run_cases_status_check
  check (status in ('untested', 'passed', 'failed', 'blocked', 'skipped', 'pre_existing'));

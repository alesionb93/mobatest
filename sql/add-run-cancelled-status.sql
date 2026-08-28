-- ============================================================
-- Permite cancelar uma execução (além de concluir ou excluir)
-- ============================================================
-- Rode este arquivo no SQL Editor do seu projeto Supabase.

alter table test_runs drop constraint if exists test_runs_status_check;
alter table test_runs add constraint test_runs_status_check check (status in ('active', 'completed', 'cancelled'));

-- ============================================================
-- Métricas: tempo de resolução de defeito
-- ============================================================
-- Rode este arquivo no SQL Editor do seu projeto Supabase.

-- Guarda automaticamente quando um defeito passou a Resolvido/Fechado
-- pela primeira vez (usado na métrica "Tempo médio de resolução").
alter table defects add column if not exists resolved_at timestamptz;

create or replace function set_defect_resolved_at()
returns trigger as $$
begin
  if new.status in ('resolved', 'closed') and (old.status is null or old.status not in ('resolved', 'closed')) then
    new.resolved_at = now();
  elsif new.status not in ('resolved', 'closed') then
    new.resolved_at = null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_defect_resolved_at_update on defects;
create trigger trg_defect_resolved_at_update before update on defects
  for each row execute procedure set_defect_resolved_at();

drop trigger if exists trg_defect_resolved_at_insert on defects;
create trigger trg_defect_resolved_at_insert before insert on defects
  for each row execute procedure set_defect_resolved_at();

-- Nota: o campo "Ambiente" das execuções passa a ser um dropdown fixo
-- (Homologação / Produção / Outro) direto na interface — não precisa de
-- migração de banco pra isso, já que a coluna já é texto livre. Execuções
-- antigas com texto livre continuam funcionando normalmente, só não
-- entram no filtro "Produção" da métrica de defeitos escapados a menos
-- que você edite o ambiente delas.

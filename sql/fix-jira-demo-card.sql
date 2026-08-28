-- ============================================================
-- Preenche o card de exemplo da fila do Jira (descrição + subtarefas)
-- ============================================================
-- Rode este arquivo no SQL Editor do seu projeto Supabase
-- (depois de já ter rodado add-jira-subtasks.sql).
--
-- A migração anterior só criou as colunas novas (description_html,
-- subtasks) — não preencheu o card de exemplo já existente no seu
-- banco, por isso as subtarefas não apareciam. Este script atualiza o
-- card de exemplo que você já tem (não importa qual chave ele tinha
-- antes); se por algum motivo você não tiver nenhum card ainda, ele
-- cria um novo automaticamente no seu primeiro projeto.

-- Garante que todas as colunas existem, não importa quais migrações
-- anteriores você já rodou ou pulou.
alter table jira_queue_items add column if not exists description text;
alter table jira_queue_items add column if not exists acceptance_criteria text;
alter table jira_queue_items add column if not exists reporter_name text;
alter table jira_queue_items add column if not exists assignee_name text;
alter table jira_queue_items add column if not exists priority text;
alter table jira_queue_items add column if not exists labels text;
alter table jira_queue_items add column if not exists jira_url text;
alter table jira_queue_items add column if not exists description_html text;
alter table jira_queue_items add column if not exists subtasks jsonb not null default '[]'::jsonb;

do $$
declare
  affected int;
  target_project uuid;
  v_description_html text := '
    <p><strong>Como</strong></p>
    <p>Como administrador(a) do Veiser Dados, quero cadastrar, visualizar, editar e remover exemplos de perguntas e respostas em SQL na aba "Exemplos da IA", garantindo que apenas consultas SQL válidas sejam salvas, para que o Veiser IA use esses pares como referência confiável ao traduzir perguntas em linguagem natural para consultas SQL.</p>
    <hr>
    <p><strong>Contexto de Negócio</strong></p>
    <p>O Veiser IA traduz perguntas dos usuários em consultas SQL para gerar respostas nos dashboards. Para melhorar a precisão dessas traduções, a administração precisa manter uma base de exemplos (pares pergunta / consulta SQL) usada como referência pela IA. Hoje essa manutenção ainda não existe como funcionalidade dentro do produto; a aba "Exemplos da IA", dentro de Administração, deve permitir que a equipe cadastre, edite, busque e remova esses exemplos, tornando o aperfeiçoamento da IA um processo contínuo, feito pela própria equipe, sem depender de ajuste manual fora do produto. Como a consulta SQL é digitada manualmente, o sistema precisa validar essa consulta e impedir o salvamento quando ela for inválida ou malformada — caso contrário, a base de referência da IA seria comprometida por exemplos que nem sequer executam corretamente.</p>
    <hr>
    <p><strong>Cenários de Uso</strong></p>
    <p><strong>Cenário 1 — Visualizar exemplos cadastrados</strong></p>
    <p>Dado que o usuário administrador acessa Administração > Exemplos da IA,<br>
    Quando a tela carregar,<br>
    Então o sistema deve listar todos os exemplos já cadastrados, com pergunta e consulta SQL correspondente.</p>
    <p><strong>Cenário 2 — Cadastrar novo exemplo com SQL válido</strong></p>
    <p>Dado que o usuário preencheu uma pergunta e uma consulta SQL válida,<br>
    Quando ele clicar em "Salvar",<br>
    Então o exemplo deve ser adicionado à base de referência da IA.</p>
    <p><strong>Cenário 3 — Impedir salvamento de SQL inválido</strong></p>
    <p>Dado que a consulta SQL digitada está malformada,<br>
    Quando o usuário tentar salvar,<br>
    Então o sistema deve exibir um erro e impedir o salvamento até a consulta ser corrigida.</p>
  ';
  v_subtasks jsonb := '[
    {"key": "MOB-10037", "title": "[FE] Layout e Integração", "status": "Concluído"},
    {"key": "MOB-10038", "title": "[CRUD] Cadastro de Exemplos da IA (Queries SQL)", "status": "Concluído"},
    {"key": "MOB-10090", "title": "Estado real diverge do estado visual", "status": "Concluído"}
  ]'::jsonb;
begin
  update jira_queue_items
  set
    jira_key = 'MOB-10035',
    title = 'Cadastro de Exemplos da IA (aba "Exemplos da IA" em Administração)',
    issue_type = 'Story',
    description_html = v_description_html,
    subtasks = v_subtasks,
    reporter_name = 'Ana Ferreira (PO)',
    assignee_name = 'Rafael Souza (Dev)',
    priority = 'Alta',
    labels = 'admin, ia, sql',
    jira_url = 'https://suaempresa.atlassian.net/browse/MOB-10035'
  where id = (
    select id from jira_queue_items
    where created_test_case_id is null
    order by created_at
    limit 1
  );

  get diagnostics affected = row_count;

  if affected = 0 then
    select id into target_project from projects order by created_at limit 1;
    if target_project is not null then
      insert into jira_queue_items (
        project_id, jira_key, title, issue_type, description_html, subtasks,
        reporter_name, assignee_name, priority, labels, jira_url, status_entered_at
      ) values (
        target_project, 'MOB-10035', 'Cadastro de Exemplos da IA (aba "Exemplos da IA" em Administração)', 'Story',
        v_description_html, v_subtasks,
        'Ana Ferreira (PO)', 'Rafael Souza (Dev)', 'Alta', 'admin, ia, sql',
        'https://suaempresa.atlassian.net/browse/MOB-10035', now() - interval '3 hours'
      );
    end if;
  end if;
end $$;

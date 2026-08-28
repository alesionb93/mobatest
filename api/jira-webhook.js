// ============================================================
// Webhook do Jira → Fila do Mobatest
// ============================================================
// Recebe o aviso do Jira quando um card muda de status, e — só
// quando a mudança for PARA o status monitorado (ex: "Para teste") —
// grava (ou atualiza) o item correspondente na tabela
// jira_queue_items do Supabase.
//
// Configuração necessária (Vercel → Project Settings → Environment
// Variables), tudo como variável de ambiente, NUNCA no código nem no
// js/config.js (esses são só pro app do navegador, que roda no
// computador da pessoa — segredo nenhum pode ir lá):
//
//   SUPABASE_URL                URL do seu projeto Supabase (mesma do js/config.js)
//   SUPABASE_SERVICE_ROLE_KEY   A chave "service_role" (Supabase → Project Settings → API).
//                               Diferente da "anon" key: essa ignora as regras de RLS,
//                               por isso é OBRIGATÓRIO que só exista aqui no servidor.
//   JIRA_WEBHOOK_SECRET         Uma senha inventada por você (ex: gere uma string
//                               aleatória). Vai na URL do webhook lá no Jira, como
//                               ?secret=essa-senha — impede que qualquer um na internet
//                               chame essa URL e grave lixo na sua fila.
//   JIRA_TARGET_STATUS          O nome exato do status que deve disparar a entrada na
//                               fila (ex: "Para teste"). Se não definir, usa esse valor
//                               como padrão.
//   JIRA_PROJECT_MAP            Um JSON mapeando a CHAVE do projeto no Jira pro ID do
//                               projeto no Mobatest. Ex: {"MOB":"a1b2c3d4-..."}
//                               (rode "select id, name, code from projects;" no Supabase
//                               pra achar o id certo).
//   JIRA_BASE_URL               Ex: https://suaempresa.atlassian.net (sem barra no final)
//   JIRA_EMAIL                  E-mail da conta usada para gerar o token de API do Jira
//   JIRA_API_TOKEN              Token de API do Jira (Conta do Jira → Segurança →
//                               Criar e gerenciar tokens de API). Usado só pra buscar a
//                               descrição já formatada (renderedFields) — o webhook em
//                               si não manda isso pronto.

import { createClient } from '@supabase/supabase-js';

function mapProjectKeyToId(jiraProjectKey) {
  try {
    const map = JSON.parse(process.env.JIRA_PROJECT_MAP || '{}');
    return map[jiraProjectKey] || null;
  } catch (e) {
    return null;
  }
}

async function fetchRenderedDescription(issueKey) {
  const base = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!base || !email || !token) return null;

  try {
    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    const res = await fetch(`${base}/rest/api/3/issue/${issueKey}?expand=renderedFields`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.renderedFields?.description || null;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido — o Jira deve chamar isso via POST.' });
  }

  // Segurança: exige a senha combinada, enviada como ?secret=... na
  // própria URL do webhook configurada lá no Jira.
  const secret = req.query.secret;
  if (!secret || secret !== process.env.JIRA_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  const body = req.body || {};
  const issue = body.issue;
  if (!issue) {
    return res.status(400).json({ error: 'Payload sem o campo "issue" — não parece ser um webhook de card do Jira.' });
  }

  // Só processa quando o changelog mostrar uma mudança de STATUS para
  // o valor monitorado — evita reprocessar em qualquer edição do card
  // (mudança de descrição, comentário, etc.).
  const targetStatus = process.env.JIRA_TARGET_STATUS || 'Para teste';
  const statusChange = (body.changelog?.items || []).find((item) => item.field === 'status');
  if (!statusChange || statusChange.toString !== targetStatus) {
    return res.status(200).json({ ignored: true, reason: 'Não é uma transição para o status monitorado.' });
  }

  const jiraProjectKey = issue.fields?.project?.key;
  const projectId = mapProjectKeyToId(jiraProjectKey);
  if (!projectId) {
    return res.status(200).json({ ignored: true, reason: `Projeto do Jira "${jiraProjectKey}" não está mapeado em JIRA_PROJECT_MAP.` });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Configuração do servidor incompleta (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes).' });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const descriptionHtml = await fetchRenderedDescription(issue.key);

  const subtasks = (issue.fields?.subtasks || []).map((st) => ({
    key: st.key,
    title: st.fields?.summary || '',
    status: st.fields?.status?.name || '',
  }));

  const payload = {
    project_id: projectId,
    jira_key: issue.key,
    title: issue.fields?.summary || '(sem título)',
    issue_type: issue.fields?.issuetype?.name || null,
    description_html: descriptionHtml,
    subtasks,
    reporter_name: issue.fields?.reporter?.displayName || null,
    assignee_name: issue.fields?.assignee?.displayName || null,
    priority: issue.fields?.priority?.name || null,
    labels: (issue.fields?.labels || []).join(', '),
    jira_url: `${process.env.JIRA_BASE_URL || ''}/browse/${issue.key}`,
    status_entered_at: new Date().toISOString(),
  };

  // Evita duplicar: se esse card já está na fila (reentrada no mesmo
  // status, ou reenvio do mesmo webhook), atualiza em vez de duplicar.
  const { data: existing, error: findError } = await supabase
    .from('jira_queue_items')
    .select('id')
    .eq('project_id', projectId)
    .eq('jira_key', issue.key)
    .maybeSingle();

  if (findError) {
    return res.status(500).json({ error: findError.message });
  }

  const { error: writeError } = existing
    ? await supabase.from('jira_queue_items').update(payload).eq('id', existing.id)
    : await supabase.from('jira_queue_items').insert(payload);

  if (writeError) {
    return res.status(500).json({ error: writeError.message });
  }

  return res.status(200).json({ ok: true, jira_key: issue.key });
}

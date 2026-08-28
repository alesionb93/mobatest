# Configurando o webhook do Jira → Mobatest

O endpoint já está pronto no código (`api/jira-webhook.js`). Falta só
configurar variáveis de ambiente na Vercel e, quando tiver o admin do
Jira, cadastrar o webhook lá. Nada disso mexe no restante do site.

---

## 1. Configurar as variáveis de ambiente na Vercel

No painel do seu projeto na Vercel: **Settings → Environment Variables**.
Adicione cada uma abaixo (marque para os três ambientes: Production,
Preview e Development).

⚠️ **Nunca coloque nada disso no `js/config.js`** — esse arquivo vai pro
navegador de qualquer pessoa que abrir o site. As variáveis abaixo ficam
só no servidor da Vercel, invisíveis pro público.

| Variável | O que é | Onde conseguir |
|---|---|---|
| `SUPABASE_URL` | URL do seu projeto Supabase | Mesma que já está no `js/config.js` |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave que ignora as regras de RLS (diferente da "anon" key) | Supabase → Project Settings → API → "service_role" (secret) |
| `JIRA_WEBHOOK_SECRET` | Uma senha inventada por você | Qualquer texto aleatório forte (ex: gere em https://1password.com/password-generator/) |
| `JIRA_TARGET_STATUS` | Nome exato do status que deve entrar na fila | Ex: `Para teste` (copie exatamente como aparece no board do Jira, com acento) |
| `JIRA_PROJECT_MAP` | Liga a chave do projeto no Jira ao projeto no Mobatest | Ex: `{"MOB":"a1b2c3d4-e5f6-..."}` — rode `select id, name, code from projects;` no SQL Editor do Supabase pra achar o id |
| `JIRA_BASE_URL` | Endereço do seu Jira | Ex: `https://suaempresa.atlassian.net` (sem barra no final) |
| `JIRA_EMAIL` | E-mail usado para gerar o token de API | O e-mail da conta Jira que vai gerar o token abaixo |
| `JIRA_API_TOKEN` | Token de API do Jira | Conta do Jira → **Segurança** → **Criar e gerenciar tokens de API** → Criar token |

Depois de salvar as variáveis, force um novo deploy (Deployments → "..." →
Redeploy) pra elas passarem a valer.

---

## 2. Cadastrar o webhook no Jira (quando tiver o admin)

No Jira: **Configurações → Sistema → Webhooks** (ou **Automação**, se
preferir usar uma regra de automação do Jira em vez de um webhook
"cru" — funciona igual, só muda onde se cadastra).

- **URL**: `https://SEU-SITE.vercel.app/api/jira-webhook?secret=A-MESMA-SENHA-DE-JIRA_WEBHOOK_SECRET`
- **Eventos**: marque "Issue updated" (atualização de issue)
- **JQL de filtro** (opcional, mas recomendado): algo como `status = "Para teste"` — assim o Jira já filtra antes de nos avisar, e nosso endpoint só recebe o que interessa

---

## 3. Testar sem esperar o Jira de verdade

Dá pra simular uma chamada do Jira via terminal, pra conferir se o
endpoint está respondendo antes mesmo de ter o admin:

```bash
curl -X POST "https://SEU-SITE.vercel.app/api/jira-webhook?secret=SUA_SENHA" \
  -H "Content-Type: application/json" \
  -d '{
    "issue": {
      "key": "MOB-999",
      "fields": {
        "summary": "Teste do webhook",
        "issuetype": { "name": "Story" },
        "project": { "key": "MOB" },
        "subtasks": []
      }
    },
    "changelog": {
      "items": [{ "field": "status", "toString": "Para teste" }]
    }
  }'
```

Se estiver tudo certo, a resposta deve ser `{"ok":true,"jira_key":"MOB-999"}`
e um novo card deve aparecer na fila do Jira dentro do Mobatest.

---

## Sobre o mapeamento de projeto (`JIRA_PROJECT_MAP`)

Se vocês tiverem só um board/projeto no Jira que interessa, é só um par
chave-valor. Se tiverem mais de um, dá pra mapear vários:

```json
{"MOB": "id-do-projeto-mobile-no-mobatest", "WEB": "id-do-projeto-web-no-mobatest"}
```

Qualquer card de um projeto do Jira que não estiver nesse mapa é
simplesmente ignorado (não dá erro, só não entra na fila).

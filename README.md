# Testly — Test Management System

Ferramenta de gerenciamento de testes (alternativa gratuita ao Qase.io), construída com **HTML + CSS + JavaScript puro** (sem framework, sem build step) e **Supabase** como backend.

## Funcionalidades do MVP

- ✅ Autenticação (login/cadastro por e-mail e senha)
- ✅ Múltiplos projetos
- ✅ Casos de teste organizados em suítes hierárquicas, com passos, prioridade, tipo e status de automação
- ✅ Planos de teste (agrupar casos em ciclos)
- ✅ Execuções de teste (test runs) com registro de resultado por caso (passou / falhou / bloqueado / pulado)
- ✅ Gerenciamento de defeitos (bugs), com vínculo direto a um caso/execução que falhou
- ✅ Dashboard e relatórios com gráficos (Chart.js)
- ✅ Histórico visual de execuções por caso de teste ("faixa de histórico")

---

## 1. Configurar o Supabase (gratuito)

1. Crie uma conta em [supabase.com](https://supabase.com) e um novo projeto.
2. Vá em **SQL Editor** → **New query**, cole todo o conteúdo do arquivo [`sql/schema.sql`](sql/schema.sql) e clique em **Run**.
   - Isso cria todas as tabelas, relacionamentos, triggers e políticas de segurança (Row Level Security).
3. Vá em **Project Settings → API** e copie:
   - `Project URL`
   - `anon public` key
4. (Opcional, recomendado para testar rápido) Vá em **Authentication → Providers → Email** e desative a opção **"Confirm email"**, assim você consegue criar conta e logar na hora, sem precisar confirmar e-mail. Em produção, deixe ativado.

## 2. Configurar o projeto local

Abra `js/config.js` e cole suas credenciais:

```js
export const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
export const SUPABASE_ANON_KEY = "sua-anon-key-aqui";
```

> A `anon key` é pública por padrão (é usada no navegador) — a segurança real é garantida pelas políticas de Row Level Security que já estão no `schema.sql`, então isso é seguro.

## 3. Rodar localmente

Como o projeto usa módulos ES (`import`/`export`), você precisa servir os arquivos por HTTP (não pode abrir o `index.html` direto com duplo clique, o navegador bloqueia `import` em `file://`).

**Opção recomendada — script incluído, sem dependências (`server.js`):**

```bash
node server.js
# ou, para escolher outra porta:
node server.js 3000
```

Depois acesse `http://localhost:5500` (ou a porta escolhida). Só precisa ter Node.js instalado — nenhuma extensão do editor, nenhum pacote do npm.

**Outras opções**, caso prefira:

```bash
# Com Python (já vem instalado na maioria dos sistemas)
python3 -m http.server 5500

# Com Node, via npx (baixa um pacote na hora)
npx serve .

# Extensão "Live Server" do VS Code (se disponível no seu ambiente)
```

## 4. Deploy no Vercel (gratuito)

**Opção A — via site (mais simples):**
1. Crie uma conta em [vercel.com](https://vercel.com).
2. Clique em **Add New → Project → Deploy without Git** (ou arraste a pasta do projeto).
3. Como é um site estático (sem build), o Vercel vai publicar direto.

**Opção B — via Git (recomendado a longo prazo):**
1. Suba esta pasta para um repositório no GitHub.
2. No Vercel, clique em **Add New → Project → Import Git Repository**.
3. Framework preset: **Other** (não precisa de build command nem output directory — é HTML/CSS/JS puro).
4. Deploy.

> ⚠️ Não coloque a `anon key` do Supabase como "variável de ambiente secreta" no Vercel esperando escondê-la — como o código roda 100% no navegador, ela sempre ficará visível no JS entregue ao cliente. Isso é normal e esperado para a `anon key`; a segurança fica por conta do RLS no banco.

---

## Estrutura do projeto

```
qase-clone/
├── index.html              # Shell da aplicação (SPA)
├── css/style.css           # Design system completo
├── js/
│   ├── config.js           # Credenciais do Supabase (edite aqui)
│   ├── supabaseClient.js   # Inicialização do cliente Supabase
│   ├── auth.js             # Login, cadastro, sessão
│   ├── state.js            # Estado global de projetos
│   ├── ui.js                # Helpers de UI (toast, modal, badges...)
│   ├── router.js            # Roteador SPA (hash routing)
│   ├── app.js                # Ponto de entrada
│   └── modules/
│       ├── dashboard.js
│       ├── testCases.js
│       ├── testPlans.js
│       ├── testRuns.js
│       ├── defects.js
│       ├── projects.js
│       └── reports.js
└── sql/schema.sql          # Schema completo do banco (rode no Supabase)
```

## Próximos passos sugeridos (pós-MVP)

- Convite de membros para projetos (a tabela `project_members` já suporta isso)
- Anexar screenshots/arquivos aos defeitos (Supabase Storage)
- Comentários em execuções e defeitos
- Integração com GitHub/Jira via webhooks
- Exportar relatórios em PDF
- Importar casos de teste via CSV

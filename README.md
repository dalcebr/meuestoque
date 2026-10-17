# Estoque da Loja — versão para vender acessos

Sistema de estoque, vendas, clientes, relatórios e catálogo online para lojas,
agora **multi-loja**: cada cliente que paga recebe uma loja isolada, com login
próprio, equipe, validade e catálogo público em `seudominio.com.br/c/nome-da-loja`.

- **Front-end:** Vite + TypeScript (a interface original foi mantida em `public/legacy/estoque.js`)
- **Banco, login e fotos:** Supabase (Postgres com RLS, Auth e Storage)
- **Hospedagem e API:** Cloudflare Pages + Pages Functions (TypeScript)
- **Código e CI:** GitHub + GitHub Actions

---

## Sumário

1. [Como funciona](#como-funciona)
2. [Passo a passo para colocar no ar](#passo-a-passo-para-colocar-no-ar)
3. [Como vender um acesso](#como-vender-um-acesso)
4. [Renovação automática por pagamento](#renovação-automática-por-pagamento)
5. [Rodar no seu computador](#rodar-no-seu-computador)
6. [Estrutura do projeto](#estrutura-do-projeto)
7. [Segurança](#segurança)
8. [Limitações conhecidas e próximos passos](#limitações-conhecidas-e-próximos-passos)

---

## Como funciona

| Quem | Onde | O que faz |
|---|---|---|
| **Você** (administrador da plataforma) | `/admin/` | Cria lojas e o login do dono, escolhe plano, validade, bloqueia, renova, exclui e vê o histórico. |
| **Dono da loja** | `/app/` e `/conta/` | Usa o sistema completo, cadastra a equipe (dentro do limite do plano), muda o endereço do catálogo e faz backup. |
| **Funcionário** | `/app/` | Vê só as telas que o dono liberou (ex.: Vendedor = Início, Produtos, Vendas, Clientes e Catálogo). |
| **Cliente final da loja** | `/c/nome-da-loja` | Vê o catálogo sem login, monta o carrinho e envia o pedido pelo WhatsApp. Custos nunca saem do servidor. |

**Vencimento:** quando a validade passa (ou você bloqueia), o próprio banco de dados
recusa leitura e gravação daquela loja. O dono vê uma tela "Acesso vencido" com
botão para renovar pelo seu WhatsApp, e o catálogo público sai do ar. **Os dados
não são apagados** — ao renovar, tudo volta como estava. Nos últimos 7 dias o dono
vê um aviso no topo do sistema.

**Vários aparelhos:** cada produto, venda, cliente e movimentação é gravado como um
registro separado, e o sistema envia só o que mudou. Se outra pessoa alterar algo,
aparece "Os dados foram alterados em outro aparelho — Atualizar agora". Se a internet
cair, aparece "Sem conexão. Tentando salvar de novo…" e o sistema tenta até conseguir.

---

## Passo a passo para colocar no ar

Tempo estimado: 30 a 40 minutos. Você vai precisar de contas (gratuitas para começar)
no **GitHub**, no **Supabase** e na **Cloudflare**.

### 1. Supabase — criar o banco

1. Em [supabase.com](https://supabase.com), crie um projeto. Região sugerida: **South America (São Paulo)**.
2. Abra **SQL Editor → New query**, cole **todo** o conteúdo de
   `supabase/migrations/20260101000000_init.sql` e clique em **Run**.
   Isso cria as tabelas, as regras de segurança (RLS), o bucket de fotos e o tempo real.
   Pode rodar de novo sem problema, se precisar.
3. **Desligue o cadastro público** (só você cria acessos):
   **Authentication → Sign In / Providers → Email** → desative **Allow new users to sign up**.
   Mantenha o provedor Email habilitado.
4. **URLs de autenticação:** em **Authentication → URL Configuration**:
   - **Site URL:** `https://seudominio.com.br` (ou o endereço `*.pages.dev` da Cloudflare, por enquanto)
   - **Redirect URLs:** adicione `https://seudominio.com.br/redefinir-senha/`
5. **E-mail (recomendado):** o envio padrão do Supabase tem limite baixo de mensagens por hora.
   Para "Esqueci minha senha" funcionar bem, configure um SMTP em
   **Authentication → Emails → SMTP Settings** (Resend, Brevo, Amazon SES…).
   Sem isso, você ainda pode gerar senha nova pelo painel de administrador.
6. **Crie o seu usuário de administrador:**
   **Authentication → Users → Add user → Create new user**, com seu e-mail e senha,
   marcando **Auto Confirm User**. Depois, no SQL Editor, rode
   `supabase/scripts/primeiro_admin.sql` trocando o e-mail pelo seu.
7. **Copie as chaves** em **Project Settings → API Keys** (ou **API**):
   - **Project URL** → `https://xxxx.supabase.co`
   - Chave **pública** (`anon` ou `sb_publishable_…`)
   - Chave **secreta** (`service_role` ou `sb_secret_…`) — **nunca** coloque essa no front

### 2. GitHub — subir o código

```bash
cd estoque-saas
git init
git add .
git commit -m "Estoque da Loja SaaS"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/estoque-da-loja.git
git push -u origin main
```

Crie o repositório como **privado** no GitHub antes do `push`. O workflow
`.github/workflows/ci.yml` vai checar tipos e o build a cada push.

### 3. Cloudflare Pages — publicar

1. No painel da Cloudflare: **Workers & Pages → Create → Pages → Connect to Git** e escolha o repositório.
2. Configuração do build:
   - **Framework preset:** None
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. Em **Settings → Variables and Secrets**, cadastre (em **Production** e também em **Preview**):

   | Nome | Tipo | Valor |
   |---|---|---|
   | `VITE_SUPABASE_URL` | Texto | URL do projeto Supabase |
   | `VITE_SUPABASE_ANON_KEY` | Texto | chave **pública** |
   | `VITE_APP_NAME` | Texto | nome do seu produto (ex.: `Estoque da Loja`) |
   | `VITE_SALES_WHATSAPP` | Texto | seu WhatsApp de vendas, só números (ex.: `5511999999999`) |
   | `SUPABASE_URL` | Texto | a mesma URL do Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | chave **secreta** |
   | `WEBHOOK_SECRET` | **Secret** | um texto aleatório com 32+ caracteres (opcional, para renovação automática) |

   > As variáveis `VITE_*` entram no código do navegador **no momento do build**.
   > Se mudar alguma, faça um novo deploy (**Deployments → Retry deployment**).

4. Em **Settings → Runtime → Compatibility flags**, confirme que existe `nodejs_compat`
   (o `wrangler.toml` já pede isso).
5. **Domínio próprio:** **Custom domains → Set up a custom domain**. Depois, volte ao
   Supabase e ajuste a **Site URL** e o **Redirect URL** (passo 1.4).

### 4. Primeiro teste

1. Acesse `https://seudominio.com.br/` e entre com seu usuário de administrador → você cai em `/admin/`.
2. Clique em **Nova loja**, crie uma loja de teste com o seu próprio e-mail secundário.
3. Em uma janela anônima, entre com o login do dono: o sistema pede para criar uma senha pessoal e abre o estoque.
4. Cadastre um produto com foto, abra **Catálogo → Acessar catálogo online** e confira em outro aparelho.

---

## Como vender um acesso

1. Cliente fecha negócio com você (WhatsApp, Instagram, indicação…).
2. Em `/admin/` → **Nova loja**: nome da loja, endereço do catálogo, nome, e-mail e
   WhatsApp do dono, plano e validade (atalhos **+7 dias (teste)**, **+30 dias**, **+90 dias**, **+1 ano**).
3. A tela mostra a **senha provisória uma única vez** → **Enviar no WhatsApp** já manda
   endereço, e-mail, senha e link do catálogo para o cliente.
4. Para renovar, use **+30 dias** na lista ou **Editar** para outra data. A validade é
   somada a partir da data atual de vencimento (ou de hoje, se já venceu).
5. Inadimplente: **Editar → Situação: Bloqueada**. Desistiu de vez: **Excluir loja**
   (apaga dados, fotos e logins da equipe; exige digitar o endereço da loja).

**Planos:** edite `src/shared/plans.ts` para mudar nomes, limite de usuários e preço
exibido. O limite de usuários é aplicado no servidor quando o dono adiciona alguém.

**Consultas úteis** (vencendo, vencidas, espaço por loja): `supabase/scripts/consultas_uteis.sql`.

---

## Renovação automática por pagamento

Quando um pagamento é aprovado, chame:

```http
POST https://seudominio.com.br/api/webhooks/renovar
Authorization: Bearer SEU_WEBHOOK_SECRET
Content-Type: application/json

{ "slug": "nome-da-loja", "days": 30 }
```

Campos opcionais: `"email"` do dono (no lugar de `slug`), `"plan"`, `"maxUsers"` e
`"unblock"` (padrão `true`: desbloqueia a loja).

Como os gateways (Mercado Pago, Asaas, Stripe, Pagar.me…) enviam formatos diferentes,
o caminho mais simples é uma automação no **n8n/Make/Zapier**: "pagamento aprovado" →
requisição HTTP acima. Teste com:

```bash
curl -X POST https://seudominio.com.br/api/webhooks/renovar \
  -H "Authorization: Bearer SEU_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"slug":"nome-da-loja","days":30}'
```

---

## Rodar no seu computador

Requisitos: Node.js 20+.

```bash
npm install
cp .env.example .env            # preencha com as chaves do Supabase
cp .dev.vars.example .dev.vars  # chaves do servidor (para as APIs)

npm run dev                     # interface em http://localhost:5173
```

As telas de login, estoque, catálogo e conta funcionam com `npm run dev`. As APIs
(`/api/...` — painel de administrador e equipe) rodam nas Cloudflare Functions; para
testá-las localmente:

```bash
npm run build
npm run preview:cf              # tudo em http://localhost:8788
```

Outros comandos:

```bash
npm run typecheck   # checa os tipos do front e das Functions
npm run check       # typecheck + build (o mesmo que o CI faz)
npm run deploy      # deploy manual com wrangler (opcional; o Git já publica sozinho)
```

---

## Estrutura do projeto

```
├── index.html                  Login
├── app/index.html              Sistema da loja (interface original)
├── conta/index.html            Conta, equipe, endereço do catálogo e backup
├── admin/index.html            Painel do administrador da plataforma
├── assinatura/index.html       Tela de acesso vencido/bloqueado
├── redefinir-senha/index.html  Criar senha nova (link do e-mail)
├── public/
│   ├── legacy/estoque.js       Lógica original do sistema (JS), com ajustes marcados [SaaS]
│   ├── _headers                Cabeçalhos de segurança e cache (Cloudflare)
│   └── robots.txt
├── src/                        TypeScript do front
│   ├── app/bridge.ts           Ponte: login, assinatura, permissões, gravação na nuvem
│   ├── app/records.ts          Sincronização registro a registro + upload de fotos
│   ├── shared/                 Supabase, sessão, planos, permissões, tipos, UI
│   ├── login/ conta/ admin/ assinatura/ reset/
│   └── styles/base.css
├── functions/                  Cloudflare Pages Functions (TypeScript)
│   ├── api/admin/stores/…      Criar, listar, alterar, excluir lojas; senha do dono
│   ├── api/admin/audit.ts      Histórico
│   ├── api/team/…              Equipe da loja (somente o dono)
│   ├── api/webhooks/renovar.ts Renovação automática
│   ├── c/[slug].ts             Catálogo público com prévia de link (WhatsApp/Instagram)
│   └── _lib/                   Supabase admin, validação, respostas
├── supabase/
│   ├── migrations/…_init.sql   Esquema completo (rodar uma vez)
│   └── scripts/                Primeiro admin e consultas úteis
├── .github/workflows/ci.yml
├── wrangler.toml  vite.config.ts  tsconfig.json  package.json
└── .env.example  .dev.vars.example
```

### Por que a interface original continua em JavaScript

O sistema original tem cerca de 150 KB de lógica já testada (variações, vendas,
pedidos pelo WhatsApp, relatórios, editor de fotos, catálogo). Reescrever tudo de uma
vez em TypeScript traria risco alto de quebrar algo que já funciona. Por isso:

- tudo o que é **novo e sensível** (login, assinatura, gravação, permissões, servidor) é TypeScript;
- a interface original recebeu **ajustes pontuais**, listados no topo de
  `public/legacy/estoque.js`;
- dá para migrar a interface para TypeScript aos poucos, tela por tela, sem pressa.

---

## Segurança

- **Isolamento entre lojas** é garantido no banco (Row Level Security): um usuário só
  lê e grava registros e fotos da loja da qual é membro, e só enquanto ela estiver liberada.
- A **chave secreta** do Supabase fica só nas Cloudflare Functions.
- Criar lojas, mudar validade, bloquear e gerenciar equipe passam pelo servidor, que
  confere se quem chama é administrador da plataforma ou dono da loja.
- O **catálogo público** usa uma função do banco que remove custos (`cost` e o custo de
  cada variação) antes de responder.
- Senhas provisórias aparecem uma única vez e exigem troca no primeiro acesso.
- Cadastro público desligado (passo 1.3): ninguém cria conta sozinho.
- Ações administrativas ficam registradas no **Histórico**.

---

## Limitações conhecidas e próximos passos

- **Permissões de funcionário valem na interface.** O vendedor não vê o menu Relatórios,
  por exemplo, mas, tecnicamente, qualquer membro de uma loja ativa consegue gravar dados
  dessa loja pela API. Para separar no banco (ex.: só quem tem "Catálogo" altera o catálogo),
  adicione políticas por coleção em `store_records`.
- **Edição simultânea do mesmo item:** se duas pessoas alterarem o *mesmo* produto ao
  mesmo tempo, vale a última gravação. Itens diferentes não se afetam.
- **Dados da versão antiga** (salvos no navegador, IndexedDB) não migram sozinhos. Para
  clientes que já usavam, cadastre de novo ou monte um arquivo no formato do backup
  (`/conta/` → Baixar backup mostra o formato) e use **Restaurar backup**.
- **Tamanho:** o plano gratuito do Supabase tem limites de banco (500 MB), Storage (1 GB)
  e pausa projetos inativos. Para clientes pagantes, use o plano Pro.
- **Cobrança integrada:** hoje a renovação é manual ou por webhook. Um próximo passo
  natural é um checkout próprio (Mercado Pago/Stripe) que cria a loja sozinho.
- **Termos de uso e privacidade (LGPD):** você passa a guardar dados de clientes das
  lojas. Publique termos de uso e política de privacidade antes de vender. O backup em
  JSON atende pedidos de portabilidade.

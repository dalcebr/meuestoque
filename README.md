# Estoque da Loja — versão para vender acessos

Sistema de estoque, vendas, clientes, relatórios e catálogo online para lojas,
agora **multi-loja**: cada cliente que paga recebe uma loja isolada, com login
próprio, equipe, validade e catálogo público em `seudominio.com.br/c/nome-da-loja`.

- **Front-end:** Vite + TypeScript (a interface original foi mantida em `public/legacy/estoque.js`)
- **Banco e login:** Supabase (Postgres com RLS e Auth)
- **Fotos:** Cloudflare R2 (enviadas e apagadas pelas Pages Functions, que conferem a loja)
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
2. Abra **SQL Editor → New query** e rode, **nesta ordem**, cada arquivo de
   `supabase/migrations/` (cole o conteúdo inteiro e clique em **Run**):
   1. `20260101000000_init.sql` — tabelas, regras de segurança (RLS) e tempo real
   2. `20260201000000_limite_produtos_e_catalogo.sql` — limite de produtos e seção inicial padrão do catálogo
   3. `20260301000000_limite_fotos.sql` — limite de fotos por produto

   Todos podem ser rodados de novo sem problema. (Eles ainda criam o bucket `store-media`
   do Supabase Storage, da versão antiga; numa instalação nova ele fica vazio e não é usado.)
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

### 3. Cloudflare R2 — criar o bucket das fotos

1. No painel da Cloudflare: **R2 Object Storage** → ative o R2 (pede cartão, mas o
   plano gratuito cobre 10 GB e não cobra saída de dados).
2. **Create bucket** com o nome **`estoque-fotos`** (o mesmo do `wrangler.toml`).
   Localização: automática.
   Ou pelo terminal: `npx wrangler r2 bucket create estoque-fotos`.
3. **Não** precisa deixar o bucket público: por padrão as fotos são entregues pelo
   próprio site em `https://seudominio.com.br/media/...`.
4. *(Opcional, recomendado com muito tráfego no catálogo)* Ligue um domínio ao bucket
   para as fotos não passarem pelas Functions:
   **bucket → Settings → Public access → Custom Domains → Connect domain**
   (ex.: `fotos.seudominio.com.br`). Depois, em **Settings → CORS Policy**, cole o conteúdo
   de `r2-cors.json` (trocando o seu domínio) — o editor de fotos precisa disso para
   reabrir fotos já salvas. Por fim, cadastre `MEDIA_PUBLIC_URL` no passo 4.

### 4. Cloudflare Pages — publicar

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
   | `MEDIA_PUBLIC_URL` | Texto | *(opcional)* domínio público do bucket, ex.: `https://fotos.seudominio.com.br` |

   > As variáveis `VITE_*` entram no código do navegador **no momento do build**.
   > Se mudar alguma, faça um novo deploy (**Deployments → Retry deployment**).

4. Em **Settings → Bindings → Add → R2 bucket**, crie o binding:
   **Variable name** `MEDIA` → bucket `estoque-fotos` (em **Production** e **Preview**).
   O `wrangler.toml` já declara isso; se o painel mostrar o binding, está pronto.
   Sem ele, o envio de fotos responde "Servidor sem o bucket R2".
5. Em **Settings → Runtime → Compatibility flags**, confirme que existe `nodejs_compat`
   (o `wrangler.toml` já pede isso).
6. **Domínio próprio:** **Custom domains → Set up a custom domain**. Depois, volte ao
   Supabase e ajuste a **Site URL** e o **Redirect URL** (passo 1.4).

### 5. Primeiro teste

1. Acesse `https://seudominio.com.br/` e entre com seu usuário de administrador → você cai em `/admin/`.
2. Clique em **Nova loja**, crie uma loja de teste com o seu próprio e-mail secundário.
3. Em uma janela anônima, entre com o login do dono: o sistema pede para criar uma senha pessoal e abre o estoque.
4. Cadastre um produto com foto, abra **Catálogo → Acessar catálogo online** e confira em outro aparelho.
5. Em **R2 → estoque-fotos → Objects** a foto aparece em `<id-da-loja>/img/…`.

### Já usava a versão com Supabase Storage? Migre as fotos

As fotos antigas continuam aparecendo (os endereços do Supabase seguem válidos), mas
para concentrar tudo no R2 rode a migração **uma vez**, do seu computador:

1. **R2 → Manage R2 API Tokens → Create API token** com permissão **Object Read & Write**
   só no bucket `estoque-fotos`. Anote *Access Key ID*, *Secret Access Key* e o *Account ID*.
2. `cp .migracao.env.example .migracao.env` e preencha (ele não vai para o Git).
   Em `MEDIA_BASE_URL` use `https://seudominio.com.br/media` (ou o seu `MEDIA_PUBLIC_URL`).
3. Faça deploy desta versão **antes** (para `/media/` já existir).
4. Simule: `npm run migrar:fotos` — mostra o que seria copiado, sem gravar nada.
5. Migre: `npm run migrar:fotos -- --aplicar`. Pode rodar de novo à vontade: o que já foi
   migrado é pulado. Prefira um horário de pouco uso (os aparelhos abertos verão
   "Os dados foram alterados em outro aparelho").
6. Confira o sistema e o catálogo. Só então, se quiser, apague os arquivos do bucket
   `store-media` em **Supabase → Storage**.

Requer Node.js 20.6+.

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
   (apaga dados, fotos no R2 — e no Storage antigo, se houver — e logins da equipe;
   exige digitar o endereço da loja).

**Planos e limites:** edite `src/shared/plans.ts` para mudar nomes, preço exibido,
limite de usuários, limite de produtos (`maxProducts: null` = sem limite) e fotos por produto (`maxPhotos`, de 1 a 50). Ao escolher
um plano no painel, os limites dele são preenchidos, e você pode ajustá-los só para
aquela loja. Os dois limites são aplicados no servidor:

- **Usuários:** checado quando o dono adiciona alguém à equipe.
- **Produtos:** o sistema avisa na hora de cadastrar ("Seu plano permite até N produtos")
  e o banco recusa produtos além do limite, mesmo vindos de outro aparelho ou de backup.
  Editar, vender e excluir produtos continua liberado mesmo acima do limite (por exemplo,
  se você reduzir o limite de uma loja que já tem mais produtos).

- **Fotos por produto:** o cadastro mostra "3 de 5" e some o botão de adicionar no limite;
  o banco recusa produto com mais fotos que o plano. Se você reduzir o limite, produtos
  antigos com mais fotos continuam editáveis, só não ganham fotos novas.

O dono acompanha o uso em **Conta** ("Produtos: 80 de 100", "Fotos por produto: até 5")
e você vê na lista de lojas.

### Foto por variação

No cadastro do produto, cada opção de variação (ex.: Cor → Azul) tem o campo
**Foto desta opção**, que lista as fotos do produto. No catálogo, quando o cliente
toca na opção, a foto ligada a ela vira a foto principal, e o carrinho mostra essa foto.
Ao trocar a foto principal ou remover uma foto, as ligações se ajustam sozinhas.

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

Campos opcionais: `"email"` do dono (no lugar de `slug`), `"plan"`, `"maxUsers"`,
`"maxProducts"` (número, ou `null` para sem limite), `"maxPhotos"` (1 a 50) e `"unblock"` (padrão `true`:
desbloqueia a loja).

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

As telas de login, catálogo e conta funcionam com `npm run dev`. As APIs
(`/api/...` — envio de fotos, painel de administrador e equipe) e a entrega das fotos
(`/media/...`) rodam nas Cloudflare Functions; para testar com fotos, use:

```bash
npm run build
npm run preview:cf              # tudo em http://localhost:8788
```

O `wrangler pages dev` cria um R2 **local** (em `.wrangler/`) automaticamente, então
as fotos de teste não vão para o bucket de produção.

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
│   ├── app/records.ts          Sincronização registro a registro + envio de fotos (R2)
│   ├── shared/                 Supabase, sessão, planos, permissões, tipos, UI
│   ├── login/ conta/ admin/ assinatura/ reset/
│   └── styles/base.css
├── functions/                  Cloudflare Pages Functions (TypeScript)
│   ├── api/media/[storeId].ts  Envia (PUT) e apaga (DELETE) fotos no R2
│   ├── media/[[path]].ts       Entrega as fotos do R2 em /media/...
│   ├── api/admin/stores/…      Criar, listar, alterar, excluir lojas; senha do dono
│   ├── api/admin/audit.ts      Histórico
│   ├── api/team/…              Equipe da loja (somente o dono)
│   ├── api/webhooks/renovar.ts Renovação automática
│   ├── c/[slug].ts             Catálogo público com prévia de link (WhatsApp/Instagram)
│   └── _lib/                   Supabase admin, R2, validação, respostas
├── supabase/
│   ├── migrations/…_init.sql   Esquema completo (rodar uma vez)
│   └── scripts/                Primeiro admin e consultas úteis
├── scripts/migrar-fotos-r2.mjs Migração única das fotos do Supabase Storage para o R2
├── r2-cors.json                CORS para o domínio público do bucket (opcional)
├── .github/workflows/ci.yml
├── wrangler.toml  vite.config.ts  tsconfig.json  package.json
└── .env.example  .dev.vars.example  .migracao.env.example
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
  lê e grava registros da loja da qual é membro, e só enquanto ela estiver liberada.
- **Fotos (R2):** o navegador nunca fala direto com o bucket. O envio e a remoção passam
  por `/api/media/<loja>`, que valida o login no Supabase e aplica a **mesma regra do RLS**
  (membro de loja liberada e dentro da validade). O servidor gera o nome do arquivo, aceita
  só JPG/PNG/WebP de até 10 MB conferindo os bytes do arquivo (não só o tipo declarado) e só
  apaga arquivos da própria loja. As fotos são públicas para leitura, como antes, porque o
  catálogo é público; os nomes são aleatórios (UUID), impossíveis de adivinhar.
- A **chave secreta** do Supabase e o acesso ao R2 ficam só nas Cloudflare Functions.
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
- **Tamanho:** o plano gratuito do Supabase tem limite de banco (500 MB) e pausa projetos
  inativos — para clientes pagantes, use o plano Pro. As fotos no R2 têm 10 GB grátis
  e depois ~US$ 0,015/GB/mês, sem cobrança de tráfego.
- **Fotos servidas por /media/:** cada foto vista conta como uma requisição das Functions
  (100 mil/dia no plano gratuito; o cache do navegador e da Cloudflare reduz muito isso).
  Com catálogos muito acessados, ligue um domínio público ao bucket (passo 3.4).
- **Cobrança integrada:** hoje a renovação é manual ou por webhook. Um próximo passo
  natural é um checkout próprio (Mercado Pago/Stripe) que cria a loja sozinho.
- **Termos de uso e privacidade (LGPD):** você passa a guardar dados de clientes das
  lojas. Publique termos de uso e política de privacidade antes de vender. O backup em
  JSON atende pedidos de portabilidade.

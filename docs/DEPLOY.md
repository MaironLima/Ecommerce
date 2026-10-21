# Deploy

API + Postgres + Caddy na VPS Oracle via Docker Compose; front na Vercel.

```
navegador ──► https://seu-projeto.vercel.app        (Vercel, front-end/)
          └─► https://minhaloja.duckdns.org ──► caddy:443 ──► api:3002 ──► db:5432
```

## 1. Oracle (uma vez)

O Caddy precisa das portas **80 e 443** (Let's Encrypt). A 3002 fica só na rede interna do Docker.

- Security List / NSG da VCN: liberar TCP 80 e 443 (e UDP 443 para HTTP/3).
- Imagens Ubuntu da Oracle têm regras no iptables que bloqueiam tudo além do 22:

```bash
sudo iptables -I INPUT 6 -p tcp -m multiport --dports 80,443 -j ACCEPT
sudo iptables -I INPUT 6 -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

- DuckDNS: subdomínio apontando para o IP público da VPS.

## 2. VPS

```bash
# antes, configure o SSH do GitHub na VPS (seção 5, passo 4)
git clone git@github.com:MaironLima/Ecommerce.git ~/Ecommerce && cd ~/Ecommerce
cp .env.production.example .env   # preencher (openssl rand -hex 32 para os segredos)
docker compose up -d --build
docker compose logs -f api
```

As migrations rodam sozinhas a cada start do container `api`.

Dados de demonstração (opcional; cria usuários com a senha padrão do seed, troque-a depois):

```bash
docker compose exec api npm run seed
```

Atualizar: `git pull && docker compose up -d --build`.

Volumes: `pgdata` (banco), `uploads` (imagens), `logs`, `caddy_data` (certificados).

## 3. Vercel

- Root Directory: `front-end` (Vite é detectado sozinho; `vercel.json` cuida das rotas do SPA).
- Variáveis de ambiente:
  - `VITE_API_URL=https://minhaloja.duckdns.org`
  - `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...`
- O domínio final da Vercel vai em `FRONTEND_URL` no `.env` da VPS (o CORS aceita só essa origem; URLs de preview ficam bloqueadas).

## 4. Stripe

A loja roda **só em modo de teste**, inclusive em produção: a API não sobe com uma chave `sk_live_`. Com `pk_test_`, o checkout mostra o painel com os cartões de teste (4242 4242 4242 4242 etc.).

No Dashboard, com **Test mode** ligado:
- Developers → API keys: `pk_test_...` (Vercel) e `sk_test_...` (`.env` da VPS).
- Developers → Webhooks → Add endpoint: `https://minhaloja.duckdns.org/webhooks/stripe`, eventos `payment_intent.succeeded`, `payment_intent.payment_failed` e `charge.refunded` → copiar o `whsec_...` para `STRIPE_WEBHOOK_SECRET`.

Sem webhook o pagamento ainda funciona (o status do pedido é conferido no Stripe quando é consultado), mas com ele o pedido vira PAID na hora.

## Cookies

Em produção o refresh token usa `SameSite=None; Secure`, porque front e API estão em sites diferentes. Navegadores que bloqueiam cookies de terceiros (Safari, modo anônimo) podem perder a sessão ao recarregar a página. Para resolver de vez, use um domínio próprio para os dois (ex.: `loja.com` + `api.loja.com`).

## 5. CI/CD (GitHub Actions)

`.github/workflows/ci.yml`:

- **test**: roda em todo push e PR, com as mesmas etapas do `npm run test:all` (types → unit → integration → smoke → e2e → load) + build do front.
- **deploy**: roda só em push na `main` e só se `test` passou. Entra na VPS por SSH e roda `git pull --ff-only && docker compose up -d --build`.

### Passo a passo (uma vez)

1. **Chave SSH só para o deploy** (no seu PC):

   ```bash
   ssh-keygen -t ed25519 -f gh-deploy -N "" -C "github-actions"
   ```

2. **Autorizar a chave na VPS**: adicione o conteúdo de `gh-deploy.pub` em `~/.ssh/authorized_keys` do usuário da VPS (ex.: `ubuntu`).

3. **Usuário sem sudo para o Docker** (na VPS): `sudo usermod -aG docker ubuntu` e depois saia e entre de novo.

4. **Pasta da VPS ligada ao GitHub por SSH** (para `pull` do deploy e para você também poder fazer commit/push de lá). Na VPS:

   ```bash
   ssh-keygen -t ed25519 -C "vps-oracle" -f ~/.ssh/github -N ""
   cat ~/.ssh/github.pub
   ```

   Cadastre a chave pública em **um** destes lugares:
   - GitHub → repo **Ecommerce** → Settings → Deploy keys → Add deploy key, marcando **Allow write access**. A chave vale só para este repo (recomendado).
   - Ou GitHub → seu perfil → Settings → SSH and GPG keys, que dá acesso a todos os seus repos.

   Faça o git usar essa chave para o github.com:

   ```bash
   cat >> ~/.ssh/config <<'CFG'
   Host github.com
     IdentityFile ~/.ssh/github
     IdentitiesOnly yes
   CFG
   chmod 600 ~/.ssh/config
   ssh -T git@github.com   # deve responder "Hi MaironLima/Ecommerce!" ou "Hi MaironLima!"
   ```

   Clone já via SSH (ou, se já clonou por HTTPS, troque o remote):

   ```bash
   git clone git@github.com:MaironLima/Ecommerce.git ~/Ecommerce
   # ou, dentro da pasta existente:
   git remote set-url origin git@github.com:MaironLima/Ecommerce.git
   ```

   Identidade dos commits feitos na VPS:

   ```bash
   git config --global user.name "MaironLima"
   git config --global user.email "seu-email-do-github"
   ```

   > Ao commitar na VPS, sempre dê `git push` logo depois. O deploy roda `git pull --ff-only`, que falha se a pasta tiver commits não enviados ou arquivos alterados sem commit. O push dispara o CI, e quando o deploy rodar a pasta já está atualizada.

5. **Secrets no GitHub**, em Settings → Secrets and variables → Actions → New repository secret:

   | Secret | Valor |
   |---|---|
   | `VPS_HOST` | IP público da VPS (ou o domínio do DuckDNS) |
   | `VPS_USER` | `ubuntu` |
   | `VPS_SSH_KEY` | conteúdo inteiro de `gh-deploy` (a chave privada) |
   | `VPS_APP_DIR` | `/home/ubuntu/Ecommerce` |

6. Apague `gh-deploy` do seu PC depois de colar no secret.

7. **Proteja a `main`** (opcional, recomendado): Settings → Branches → exigir que o check `test` passe antes do merge.

Teste: faça um push na `main` e acompanhe em **Actions**. O job `deploy` só aparece depois que `test` termina com sucesso.

**Vercel**: a integração Git da Vercel faz o deploy do front sozinha a cada push, sem esperar os testes. Se quiser que ela espere, desligue o auto-deploy e chame um Deploy Hook da Vercel no fim do job `deploy`.

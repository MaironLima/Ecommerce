# Plano de Finalização — Etapas 10 a 15

Base: **Plano Etapas Desenvolvimento.pdf** (requisitos) + **Full Industry-grade Scope.pdf** (funcionalidades).
Ponto de partida: etapa 10 em andamento (reviews com CRUD básico, e-mails de checkout soltos no service).

Regra geral: **manter a identidade visual atual** — Tailwind + shadcn, tokens de `global.css`
(`global-btn`, `global-card`, `global-card-hover`, `global-input`, `global-card-error`), roxo primário,
fonte Inter, Lucide, dark mode via `ModeToggle`, `UniversalBreadcrum`, container `max-w-7xl`.
Nenhuma página nova introduz cores ou componentes fora desse vocabulário.

---

## 0. Pré-requisitos encontrados (corrigidos antes de tudo)

| Problema | Decisão |
|---|---|
| Banco local com 7 migrations pendentes; migration `20260424…` falhava (`gin_trgm_ops` sem extensão) | Adicionado `CREATE EXTENSION IF NOT EXISTS pg_trgm` na migration; banco sincronizado. |
| `search.sql` aplicado manualmente (trigger do `search_vector`) | Vira migration — clone novo funciona só com `prisma migrate deploy`. Idioma `english` (o mesmo usado nas queries; antes trigger=portuguese, query=english). |
| `Cart.user_id @unique` no schema mas sem migration (drift) | Entra na migration nova. |
| Testes quebravam sem `STRIPE_SECRET_KEY` | Stripe recebe placeholder quando a chave falta (endpoints de pagamento continuam falhando de forma explícita). |
| `node_modules` incompleto | `npm install` nos dois projetos. |

## 1. Etapa 10 — Backend: Reviews + Notificações

**Reviews**
- **Só quem comprou avalia**: exige pedido `PAID` do usuário contendo variante do produto → `403 NOT_A_BUYER`.
- **Uma review por usuário/produto**: constraint `@@unique([product_id, user_id])` → `409`.
- `rating` inteiro 1–5; `comment` opcional (o schema do banco já era opcional).
- Listagem pública mostra só reviews **aprovadas** (`moderated = true`); admin vê a fila pendente.
- Delete: dono **ou** admin. Aprovar: admin. Edição pelo usuário: **não** (apaga e reenvia) — evita reabrir moderação.
- Bugs corrigidos: `reviewValidationService`/`reviewDeleteService` eram chamados sem `await` (erros sumiam e a resposta saía antes da escrita).
- Novo `GET /product/:id/review/eligibility` → o front sabe se mostra o formulário.

**Notificações** (opcional do escopo → implementado e-mail + tabela `Notification`; **WebSocket não**)
- Um helper `notify(userId, type, message, email?)`: grava a notificação e envia e-mail; **falha de SMTP nunca quebra o fluxo** (antes, um e-mail falho derrubava o checkout).
- Disparos: pedido criado, pagamento confirmado, review aprovada.
- Pagamento confirmado agora tem **um único ponto**: `finalizeOrderAsPaid` (webhook, confirm e status-poll passam por ele) → sem e-mail duplicado, webhook não duplica lógica.
- Endpoints: `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`.
- Links dos e-mails usam `FRONTEND_URL` (antes apontavam para `localhost:3000`).

## 2. Etapa 11 — Frontend: Reviews + Perfil

- **ProductPage**: média de estrelas no topo; formulário (estrelas clicáveis, título, comentário) aparece só se elegível; mensagem "aguardando moderação" após envio.
- **/profile** (layout de abas no estilo do sidebar existente):
  - **Pedidos** — reaproveita a `OrdersPage` existente (sem duplicar código).
  - **Dados pessoais** — editar nome, trocar senha (senha atual exigida).
  - **Endereços** — CRUD; o modelo `Address` só tinha `id/user_id` → migration com `label, street, number, complement, district, city, state, zip_code, country`.
  - **Notificações** — lista + marcar como lida.
  - Logout.
- **Checkout** passa a usar endereço salvo (select) → `shipping_address` do pedido (o escopo diz "Address: usado no checkout").
- **Header**: ícone de perfil vai para `/profile` se logado; botão **Admin** aparece para ADMIN/SUPERADMIN; badge de notificações não lidas; **busca do header passa a funcionar** (antes só dava `preventDefault`).
- Role no front: decodificada do JWT apenas para a UI; quem decide é sempre o backend.

## 3. Etapa 12 — Backend: Analytics Admin

`GET /admin/analytics` (uma chamada, SQL agregado via `pg` pool já existente):

| Métrica | Fonte |
|---|---|
| Receita total, nº pedidos pagos, AOV | `orders` PAID |
| Vendas por dia (30 d) e por mês (12 m) | `date_trunc` |
| Produtos mais vendidos (top 5) | `order_item` × PAID |
| Estoque baixo (≤ 5) | `product_variant` |
| Nº de usuários | `user` |
| Receita por categoria | join `product_category` |
| Taxa de conversão do checkout | pedidos PAID ÷ pedidos criados |
| Pageviews | **pulado** (opcional; exigiria tracking) |

Outros endpoints admin: `GET /admin/users`, `PATCH /admin/users/:id/role` (**só SUPERADMIN** → demonstra os 3 níveis do RBAC), `GET /admin/orders?status=`, `GET /admin/audit`. Rate limit dedicado em `/admin`.

## 4. Etapa 13 — Frontend: Dashboard Admin

- Rota `/admin/*` com guard de role, layout com o **mesmo `Sidebar` shadcn** da home.
- **Dashboard**: cards de KPI (`global-card`) + Recharts (área: vendas/dia; barras: vendas/mês, receita/categoria; lista top produtos e estoque baixo). Cores dos gráficos = tokens `--chart-1..5` já definidos no tema.
- **Produtos**: tabela + criar/editar (multipart com imagens, endpoint existente) + excluir + gerenciar variantes.
- **Pedidos**: tabela com filtro de status (badges com o `ORDER_STATUS_STYLES` existente).
- **Usuários**: tabela + troca de role (SUPERADMIN).
- **Reviews**: fila de moderação (aprovar/excluir).
- Nova dependência: `recharts` (exigida pelo plano).

## 5. Etapa 14 — Logging, Auditoria, Testes

- **Logs estruturados**: Winston em JSON + arquivos `logs/app.log` e `logs/error.log`; `morgan` removido (duplicava o `requestLogger`).
- **Error handler global** + 404 JSON.
- **Health check**: `GET /health` verifica o banco (mantém `/ping`).
- **AuditLog**: modelo novo (`actor_id, action, entity_type, entity_id, metadata, created_at`); gravado em toda mutação admin (produto, variante, review, role).
- **Segurança**: cookie do refresh vira `httpOnly + sameSite=lax (+ secure em produção)`; login com erro → `401` (não `500`); front envia `Bearer <token>` (antes o `requireAdmin` rejeitava o header cru → todo endpoint admin dava 401 pelo front).
- **Testes**: vitest — regra "só quem comprou avalia", unicidade, RBAC das rotas admin (401/403), cálculo do analytics. Os testes existentes continuam.
- Limpeza: módulos vazios (`recommendations`, `websocket`, `search`, `stock/controllers…`) e `validate.ts` (middleware nunca usado) removidos; `console.log` de debug removidos.

## 6. Etapa 15 — Deploy local + scripts

- `package.json` na raiz: `npm run setup` (instala tudo + migrate + seed), `npm run dev` (back + front juntos), `npm run build`, `npm run start`.
- Backend: `build` = typecheck; `start` = `tsx` com `NODE_ENV=production` (o projeto usa imports sem extensão + `moduleResolution: bundler`, que o `tsc` não emite rodável — `tsx` evita reescrever todos os imports).
- Frontend: `vite build` + `vite preview` na porta 5173 (mantém o CORS atual).
- **Seed** (`prisma/seed.ts`, já referenciado no `prisma.config.ts`): SUPERADMIN, ADMIN e CUSTOMER; categorias; produtos com variantes e **imagens geradas pelo próprio sharp** (sem arquivos externos); pedidos pagos e reviews → dashboard nasce com dados.
- `.env.example` completo (Stripe, `FRONTEND_URL`, `NODE_ENV`) e README reescrito.

## Decisões tomadas durante a execução

- **Excluir produto já vendido** → `409 PRODUCT_HAS_ORDERS` (o histórico de pedidos aponta para a variante). Para tirar do catálogo, zera-se o estoque. "Excluir todos" pula os vendidos.
- **Performance**: rotas `/admin/*` carregadas sob demanda → bundle inicial de 1013 kB para 595 kB (Recharts só baixa para admin).
- **Responsivo**: no mobile o sidebar do admin vira uma barra de abas horizontal; busca do header encolhe; botão "Orders" do header some < md (fica no perfil).
- **Removidos**: rota de debug `/m` (`Buttons.tsx`), `ApiTeste.tsx`, `search.sql` (virou migration), `.env.example` da raiz (agora um por projeto), `morgan`, `ts-node`, `rimraf`.
- **Checkout exige endereço salvo**; sem endereço, a tela leva para o perfil.

## Status

Etapas 10–15 implementadas. Verificado: 27 testes de API passando, build completo, fluxos no navegador
(dashboard admin, review com moderação, perfil/endereços, busca, 403 para cliente no admin).
**Não verificado**: pagamento Stripe de ponta a ponta (o `.env` local não tem chaves Stripe) e envio real de e-mail (SMTP).

## Fora do escopo (decidido)

- **WebSocket** e **recomendações**: opcionais no escopo e ausentes do roadmap de requisitos.
- **Pageviews**: opcional.
- Editar review: substituído por apagar/reenviar.

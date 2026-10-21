# Roteiro de Teste Manual — equivalente ao E2E completo

Este roteiro permite testar **todas as funcionalidades da loja na mão**, cobrindo o que a suíte automática
(`npm run test:smoke` + `npm run test:e2e`) cobre e algumas verificações a mais que só um humano faz bem (visual,
responsividade, DevTools).

Cada caso traz **Passos** e **Resultado esperado**. Marque `[x]` ao passar. Se algo falhar, anote o
**Request ID** do erro: ele aparece no header `X-Request-Id` (DevTools → Network) e permite achar tudo em `/admin/logs`.

---

## 0. Preparar o ambiente

### Opção A — ambiente isolado (recomendado, idêntico ao E2E)

Usa um banco **separado** (`<seu banco>-test`), recriado e populado do zero. Seus dados de desenvolvimento não são tocados.

Terminal 1 — API em `:3100` com banco de teste novo (leva ~40 s para preparar):

```bash
npm run e2e:server --prefix back-end
```

Terminal 2 — site em `:5174` apontando para essa API.

PowerShell:

```powershell
$env:VITE_API_URL="http://localhost:3100"; npx --prefix front-end vite front-end --port 5174
```

Git Bash:

```bash
VITE_API_URL=http://localhost:3100 npx --prefix front-end vite front-end --port 5174
```

Abra **http://localhost:5174**. Para recomeçar do zero, pare e rode o Terminal 1 de novo.

> Nesse modo e-mail e Stripe ficam desligados de propósito (como no E2E), e o rate limit de login fica alto para não
> atrapalhar. O teste de rate limit (seção P) é feito na opção B.

### Opção B — ambiente de desenvolvimento

```bash
npm run dev
```

Site em **http://localhost:5173**, API em `:3000`, usando seu banco de dev e o seu `.env` (Stripe e SMTP, se configurados).
Use esta opção para testar **pagamento real de teste (seção F2)**, **recuperação de senha por e-mail (B9)** e **rate limit (P4)**.

### Contas (criadas pelo seed, só para teste local)

Senha de todas: `Password123!`

| E-mail | Papel | Para que serve no roteiro |
|---|---|---|
| `superadmin@store.com` | SUPERADMIN | Troca de papéis, log de acesso |
| `admin@store.com` | ADMIN | Dashboard, produtos, moderação |
| `customer@store.com` | CUSTOMER (Jane) | Compras, reviews, perfil |
| `john@store.com` | CUSTOMER (John) | Cliente "não comprador" de alguns produtos |

### Massa de dados do seed (para saber o resultado esperado)

| Produto | Categoria | Quem comprou (PAID) | Review já existente |
|---|---|---|---|
| Aurora Wireless Headphones | electronics | Jane | Jane ★5 "Amazing sound" (aprovada) |
| Pulse Smartwatch | electronics | John | John ★3 "Good, not great" (**pendente**) |
| Nimbus Mechanical Keyboard | electronics | Jane | — |
| Classic Cotton T-Shirt | clothing | John | John ★4 "Comfy shirt" (aprovada) |
| Trail Runner Sneakers | clothing | Jane | — |
| Ceramic Pour-Over Coffee Set | home | John | — |
| Linen Throw Blanket | home | Jane | Jane ★5 "So cozy" (aprovada) |
| The Pragmatic Builder | books | John | — |

Outros dados do seed:
- **Estoque baixo (≤ 5):** Keyboard switch *brown* = 0 (esgotado), Book *hardcover* = 1, T-Shirt *L* = 2, Smartwatch *44mm* = 3, Headphones *white* = 4, Blanket *clay* = 5.
- **Pedidos:** 22 PAID, 1 PENDING (Jane) e 1 CANCELLED (John), distribuídos nos últimos ~5 meses.
- **Jane** tem 1 endereço ("Home", Av. Paulista) e 1 notificação não lida.

---

## A. Smoke — a loja está de pé?  *(≙ `smoke.spec.ts`)*

| # | Passos | Resultado esperado | OK |
|---|---|---|---|
| A1 | Abra `http://localhost:3100/health` (ou `:3000` na opção B) | JSON `{"status":"ok","database":"up",...}`; em DevTools, a resposta tem o header `X-Request-Id` | [ ] |
| A2 | Abra a home | Header roxo com logo, busca, tema, carrinho e **Sign in**; grade de produtos com preço no formato `$ 34.90` | [ ] |
| A3 | Busque `headphones` no header e tecle Enter | URL fica `/?q=headphones`; aparece **Aurora Wireless Headphones** | [ ] |
| A4 | Abra a página do Aurora Wireless Headphones | Título, preço, seções **Variants**, **Description** e **Reviews**; review "Amazing sound" visível | [ ] |
| A5 | Deslogado, acesse `/admin` | Redireciona para `/auth/login` | [ ] |
| A6 | Acesse `/qualquer-coisa` | Página **Error 404** | [ ] |
| A7 | Clique no ícone de tema → **Dark** | Site inteiro fica escuro; recarregue: continua escuro | [ ] |

---

## B. Conta: cadastro, login, sessão  *(≙ flows: registro, credenciais erradas)*

| # | Passos | Resultado esperado | OK |
|---|---|---|---|
| B1 | **Sign in** → **Sign Up**. Preencha nome, um e-mail novo, senha `secret123` duas vezes → **Create Account** | Vai para a home logado; o botão Sign in vira o ícone de conta | [ ] |
| B2 | Abra o menu de conta | Mostra seu nome + Profile, My orders, Notifications, Log out (**sem** "Admin dashboard") | [ ] |
| B3 | Recarregue a página (F5) | Continua logado e o nome continua no menu | [ ] |
| B4 | Menu → **Log out** | Volta para a home com o botão **Sign in** | [ ] |
| B5 | Cadastre de novo com o **mesmo e-mail** | Mensagem de erro (e-mail já em uso); nenhuma conta criada | [ ] |
| B6 | Cadastro com nome de 2 letras / e-mail inválido / senha de 5 caracteres | Mensagem de validação, conta não criada | [ ] |
| B7 | Login com `customer@store.com` e senha errada | Alerta **"Something's going wrong."** e continua em `/auth/login` | [ ] |
| B8 | Login com e-mail inexistente | **Mesmo** alerta do B7 (a API não revela se o e-mail existe) | [ ] |
| B9 | *(Opção B, SMTP configurado)* **Forgot your password?** → informe seu e-mail → digite o código recebido → defina nova senha | Código chega por e-mail; senha trocada; login com a nova senha funciona | [ ] |

> ⚠️ **Comportamento conhecido:** no cadastro, se "Confirm Password" for diferente da senha, nada acontece na tela
> (nenhuma conta é criada, mas também não aparece mensagem). Registre se for corrigido.

---

## C. Catálogo e busca

| # | Passos | Resultado esperado | OK |
|---|---|---|---|
| C1 | Na sidebar, clique em cada categoria (Books, Clothing, Electronics, Home) | Só produtos daquela categoria (Electronics = 3 produtos) | [ ] |
| C2 | **Ascending Price** / **Descending Price** / **Most Recent** | Ordem muda de acordo (mais barato: T-Shirt $ 24.90; mais caro: Headphones $ 199.90) | [ ] |
| C3 | Busque `headphnes` (com erro de digitação) | Ainda encontra o Aurora Wireless Headphones | [ ] |
| C4 | Busque `xyzxyz` | "No products found for "xyzxyz"." | [ ] |
| C5 | Paginação: com 8 produtos | Só a página 1; **Next** desabilitado | [ ] |
| C6 | Abra o **Nimbus Mechanical Keyboard** | Variante *brown* aparece riscada/apagada e não é selecionável (Stock 0); *red* selecionável | [ ] |
| C7 | Abra o **Pulse Smartwatch** | Variante *44mm* mostra "Stock: 3" em vermelho (≤ 5) | [ ] |
| C8 | Clique nas miniaturas de imagem | A imagem principal troca | [ ] |
| C9 | Breadcrumb da página de produto → **Products** | Volta para a home | [ ] |

---

## D. Carrinho e reserva de estoque  *(≙ flows: carrinho)*

| # | Passos | Resultado esperado | OK |
|---|---|---|---|
| D1 | Deslogado, em um produto, clique **Add to cart** | Vai para o login; após entrar como Jane, **volta para o produto** | [ ] |
| D2 | Logada como Jane, abra **Linen Throw Blanket** (*sage*, estoque 7) → **Add to cart** | "Added to cart!"; badge do carrinho mostra **1** | [ ] |
| D3 | Recarregue a página do produto | Estoque da variante caiu de 7 para **6** (o carrinho já reserva) | [ ] |
| D4 | Abra o carrinho; use **+** algumas vezes | Quantidade e total sobem; estoque na página do produto cai na mesma medida | [ ] |
| D5 | Tente chegar a uma quantidade maior que o estoque | A quantidade **não passa** do disponível (a API responde `409 OUT_OF_STOCK`, visível em DevTools → Network) ⚠️ | [ ] |
| D6 | Desmarque o item (checkbox) | Botão **Checkout** fica desabilitado | [ ] |
| D7 | **Remove from cart** | Item some, badge some, estoque volta ao valor original | [ ] |
| D7b | *(continuação)* Recarregue o carrinho vazio | "Your cart is empty." | [ ] |
| D8 | *(Opcional, demora)* Adicione um item e espere **15 min** sem pagar | O cron devolve o estoque reservado (confira em `/admin/logs` o evento das reservas) | [ ] |

> ⚠️ **Comportamento conhecido (D5):** ao passar do estoque no carrinho, a tela não mostra mensagem; só a quantidade
> deixa de subir. A proteção contra vender além do estoque funciona (API + banco), mas falta o aviso na interface.

---

## E. Perfil  *(≙ flows: perfil, endereços, notificações)*

Logada como Jane, menu de conta → **Profile**.

| # | Passos | Resultado esperado | OK |
|---|---|---|---|
| E1 | Aba **Personal data**: troque o nome → **Save** | "Saved!"; o novo nome aparece no menu de conta | [ ] |
| E2 | E-mail e papel | E-mail desabilitado (não editável); papel **CUSTOMER** | [ ] |
| E3 | **Change password** com a senha atual errada | "Current password is incorrect" | [ ] |
| E4 | Nova senha igual à atual | "Cannot be the same password as the previous one" | [ ] |
| E5 | Aba **Addresses** → **Add address**, preencha só o obrigatório (*) → **Save address** | Endereço aparece formatado, ex.: `Av. Rio Branco, 1 · Rio de Janeiro/RJ · 20040-002` | [ ] |
| E6 | Tente salvar com **City** vazio | O formulário não envia (campo obrigatório) | [ ] |
| E7 | **Editar** (lápis) e **Excluir** (lixeira) um endereço | Alterações refletem na lista | [ ] |
| E8 | Header mostra o sino com badge (1 não lida) → aba **Notifications** → **Mark all as read** | Botão fica desabilitado; recarregue: badge do sino sumiu | [ ] |
| E9 | Aba **Orders** | Pedidos de Jane com status coloridos; itens PAID têm o link **★ Review** | [ ] |
| E10 | Menu lateral → **Log out** | Volta para a home deslogado | [ ] |

---

## F. Checkout e pedidos

### F1. Sem pagamento configurado (opção A)

| # | Passos | Resultado esperado | OK |
|---|---|---|---|
| F1.1 | Jane: remova todos os endereços no perfil; adicione um item e clique **Checkout** | Tela "Add a shipping address before paying." com botão **Add address** | [ ] |
| F1.2 | Cadastre um endereço e volte ao checkout | Card **Ship to** com o endereço; pedido `#xxxxxxxx` e total | [ ] |
| F1.3 | Com 2+ endereços | **Ship to** vira um select para escolher | [ ] |
| F1.4 | Sem chave Stripe | Mensagem de erro do Stripe no lugar do formulário de cartão (esperado nesse modo) | [ ] |

### F2. Pagamento de teste (opção B, com chaves Stripe de teste no `.env`)

| # | Passos | Resultado esperado | OK |
|---|---|---|---|
| F2.1 | Checkout → cartão `4242 4242 4242 4242`, validade futura, qualquer CVC → **Pay** | Vai para `/orders?paid=...` com aviso verde "Payment received"; pedido **PAID** | [ ] |
| F2.2 | Depois do pagamento | Carrinho vazio; estoque reduzido em definitivo; notificação "Payment confirmed..." no sino | [ ] |
| F2.3 | Cartão recusado `4000 0000 0000 0002` | Mensagem de recusa; pedido continua PENDING | [ ] |
| F2.4 | Recarregue a página de checkout várias vezes | Continua **o mesmo** número de pedido (não duplica) | [ ] |
| F2.5 | Em **Orders**, pedido PENDING → **Resume checkout** | Volta para o checkout com os mesmos itens | [ ] |
| F2.6 | Se SMTP configurado | E-mails "Checkout Order Registered" e "Order Purchase Confirmed" chegam | [ ] |

---

## G. Reviews  *(≙ flows: review do comprador, não comprador)*

| # | Passos | Resultado esperado | OK |
|---|---|---|---|
| G1 | Deslogado, abra qualquer produto | Na seção Reviews: "**Log in** to review this product." | [ ] |
| G2 | Jane → **Trail Runner Sneakers** (comprou, ainda não avaliou) | Formulário **Write a review** com estrelas | [ ] |
| G3 | Escolha 4 estrelas, título "Great grip on trails", comentário → **Submit review** | "Thanks! Your review is awaiting moderation."; a review **não** aparece na lista pública | [ ] |
| G4 | Recarregue o mesmo produto | Continua a mensagem de moderação (não deixa avaliar de novo) | [ ] |
| G5 | Jane → **Aurora Wireless Headphones** (já avaliou e foi aprovada) | "You already reviewed this product. Thank you!" | [ ] |
| G6 | Jane → **Pulse Smartwatch** (não comprou) | "Only customers who bought this product can review it." | [ ] |
| G7 | John → **Linen Throw Blanket** (não comprou) | Mesma mensagem do G6 | [ ] |
| G8 | John → **Pulse Smartwatch** (review pendente do seed) | "Thanks! Your review is awaiting moderation." | [ ] |
| G9 | Produtos com reviews aprovadas | Média de estrelas abaixo do título (ex.: "5.0 · 1 review") e na seção Reviews | [ ] |

---

## H. Controle de acesso (RBAC)  *(≙ flows: cliente bloqueado no admin)*

| # | Passos | Resultado esperado | OK |
|---|---|---|---|
| H1 | Jane acessa `/admin` | "403 — You don't have access to the admin area." | [ ] |
| H2 | Jane abre o menu de conta | **Não** tem "Admin dashboard" | [ ] |
| H3 | Deslogado acessa `/admin/logs` → faz login como admin | Depois do login volta para `/admin/logs` | [ ] |
| H4 | Admin abre o menu de conta | Tem **Admin dashboard**; o header **não** tem botão separado de admin | [ ] |

---

## I. Painel admin — Dashboard  *(≙ flows: dashboard)*

Login como `admin@store.com` → menu de conta → **Admin dashboard**.

| # | Passos | Resultado esperado | OK |
|---|---|---|---|
| I1 | Cards de KPI | **Revenue**, **Paid orders** (22+), **Avg. order value**, **Checkout conversion** (%), **Users** (4+) | [ ] |
| I2 | Gráficos | "Sales — last 30 days" (área), "Sales history — by month" (barras), "Revenue by category" (barras horizontais) | [ ] |
| I3 | Passe o mouse nos gráficos | Tooltip com valor em `$` | [ ] |
| I4 | **Best sellers** | Top 5 com unidades e receita | [ ] |
| I5 | **Low stock (≤ 5)** | As 6 variantes da massa de dados; Keyboard brown como **Sold out** | [ ] |
| I6 | Botão **View logs** | Abre `/admin/logs` | [ ] |
| I7 | Dark mode no dashboard | Gráficos e cards legíveis no escuro | [ ] |

---

## J. Painel admin — Produtos  *(≙ flows: criar produto com imagem)*

| # | Passos | Resultado esperado | OK |
|---|---|---|---|
| J1 | **Products** → **New product**, preencha tudo, anexe uma imagem PNG/JPG → **Save product** | Produto aparece na tabela com miniatura | [ ] |
| J2 | Busque o novo produto na home | Aparece com o preço correto; a imagem abre (convertida para WebP) | [ ] |
| J3 | **New product** sem imagem | O formulário exige a imagem principal | [ ] |
| J4 | Editar (lápis): mude preço e categoria → **Save product** | Valores atualizados na tabela e na página do produto | [ ] |
| J5 | Em **Variants**, mude o estoque de uma variante e clique fora do campo | Valor salvo (confira na página do produto) | [ ] |
| J6 | **Add** uma variante `color=red`, estoque, preço | Nova variante listada e selecionável na loja | [ ] |
| J7 | Exclua o produto que você criou (nunca vendido) → confirme | Some da tabela e da loja | [ ] |
| J8 | Tente excluir **Aurora Wireless Headphones** (já vendido) | Alerta: "This product has orders and cannot be deleted. Set its stock to 0 instead." | [ ] |

---

## K. Painel admin — Pedidos

| # | Passos | Resultado esperado | OK |
|---|---|---|---|
| K1 | **Orders** sem filtro | Todos os pedidos com cliente, itens, cidade de entrega, data, total e status | [ ] |
| K2 | Filtro **PENDING** / **CANCELLED** / **PAID** | Só pedidos daquele status (seed: 1 PENDING, 1 CANCELLED) | [ ] |

---

## L. Painel admin — Usuários e papéis  *(≙ flows: só superadmin troca papéis)*

| # | Passos | Resultado esperado | OK |
|---|---|---|---|
| L1 | Como **admin**, abra **Users** | Aviso "Only a SUPERADMIN can change roles."; papéis aparecem só como etiqueta | [ ] |
| L2 | Saia e entre como **superadmin** → **Users** | Cada usuário tem um select de papel, **exceto você mesmo** | [ ] |
| L3 | Mude **John Buyer** para **ADMIN** | Select mostra ADMIN | [ ] |
| L4 | Entre como John | Menu de conta agora tem **Admin dashboard** e `/admin` abre | [ ] |
| L5 | Volte John para CUSTOMER | John perde o acesso ao admin no próximo login | [ ] |

---

## M. Painel admin — Moderação de reviews  *(≙ flows: admin aprova review)*

| # | Passos | Resultado esperado | OK |
|---|---|---|---|
| M1 | **Reviews** | Fila com a review pendente do John ("Good, not great") e a da Jane do caso G3 | [ ] |
| M2 | **Approve** na review da Jane | Some da fila; aparece na página do Trail Runner Sneakers | [ ] |
| M3 | Jane abre o sino | Notificação "Your review of "Trail Runner Sneakers" was approved." | [ ] |
| M4 | **Delete** na review do John → confirme | Some da fila e não aparece no produto | [ ] |

---

## N. Painel admin — Audit log

| # | Passos | Resultado esperado | OK |
|---|---|---|---|
| N1 | **Audit log** | Lista com quem/quando de: PRODUCT_CREATE, PRODUCT_UPDATE, VARIANT_UPDATE, PRODUCT_DELETE, USER_ROLE_CHANGE, REVIEW_APPROVE, REVIEW_DELETE (das seções J, L, M) | [ ] |

---

## O. Painel admin — Logs  *(≙ flows: logs e log de acesso)*

| # | Passos | Resultado esperado | OK |
|---|---|---|---|
| O1 | **Logs** (menu lateral ou **View logs**) | Tabela com hora, nível, evento, requisição, usuário e Request ID; contador "N entries · data → data" | [ ] |
| O2 | Atalho **Failed logins** | URL ganha `event=auth.login.failed`; só tentativas de login com falha (as do B7/B8) | [ ] |
| O3 | Abra os detalhes (seta) de uma linha | JSON com e-mail **mascarado** (`c***@store.com`); nunca o e-mail completo, senha ou token | [ ] |
| O4 | Clique no **Request ID** de uma linha | Mostra só os eventos daquela requisição (ex.: `http.request` + `auth.login.failed`) | [ ] |
| O5 | Clique no **usuário** (`u_...`) de uma linha | Mostra tudo daquele usuário pseudonimizado | [ ] |
| O6 | Filtros: Level, Event, Method, Status `4xx`, texto livre `cart` | Resultados coerentes; os contadores nos selects batem | [ ] |
| O7 | **Clear filters** | Volta a listar tudo | [ ] |
| O8 | Período maior que 31 dias (From bem antigo) | Erro "Range is limited to 31 days" | [ ] |
| O9 | Copie a URL com filtros e abra em outra aba | Mesma busca (filtros ficam na URL) | [ ] |
| O10 | Como **admin**, abra o select **Source** | Não existe "Access (full IP)" | [ ] |
| O11 | Como **superadmin**, Source → **Access (full IP)** | Aviso amarelo do Marco Civil; linhas com `clientIp` | [ ] |
| O12 | Depois do O11, abra **Audit log** | Registro **ACCESS_LOG_VIEW** do superadmin | [ ] |

---

## P. Segurança e LGPD (verificações no DevTools)

| # | Passos | Resultado esperado | OK |
|---|---|---|---|
| P1 | Logado, DevTools → Application → Cookies | `refreshToken` com **HttpOnly** ✓ e **SameSite=Lax** | [ ] |
| P2 | No Console: `document.cookie` | **Não** mostra o `refreshToken` | [ ] |
| P3 | DevTools → Network, qualquer chamada à API | Header de resposta `X-Request-Id` | [ ] |
| P4 | *(Opção B)* Erre a senha 6 vezes em menos de 1 minuto | A partir da 6ª: HTTP **429** "Too many requests. Wait a minute." (em `/admin/logs`: `security.rate_limited`) | [ ] |
| P5 | Procure dados pessoais nos arquivos de log | Nenhuma ocorrência de senha, token, e-mail completo ou endereço (comando abaixo) | [ ] |
| P6 | Edite `localStorage.accessToken` para um valor qualquer e recarregue `/profile` | A sessão é renovada pelo cookie ou você é deslogado; nada quebra | [ ] |

Comando do P5 (Git Bash; na opção A os logs ficam na pasta temporária `ecommerce-e2e-logs`):

```bash
grep -rniE "Password123|@store\.com|Av\. Paulista|Bearer ey" back-end/logs | grep -v "\*\*\*@" || echo "nenhum dado pessoal encontrado"
```

---

## Q. Visual e responsividade

| # | Passos | Resultado esperado | OK |
|---|---|---|---|
| Q1 | Header deslogado | Busca em pílula translúcida; ícones claros; botão **Sign in** claro com texto roxo e cantos arredondados | [ ] |
| Q2 | Fonte | Inter em todo o site (DevTools → Computed → font-family começa com "Inter Variable") | [ ] |
| Q3 | Cantos | Botões, cards, menus e itens da sidebar arredondados de forma consistente (nada quadrado) | [ ] |
| Q4 | DevTools → modo celular (375 px) na home | Header cabe sem rolagem horizontal; busca encolhe | [ ] |
| Q5 | Celular no admin | Menu do admin vira uma barra horizontal com rolagem | [ ] |
| Q6 | Dark mode em: home, produto, carrinho, perfil, admin, logs | Tudo legível, sem texto preto em fundo escuro | [ ] |

---

## O que só a automação cobre bem

Alguns cenários são difíceis de reproduzir na mão; para eles, rode o comando:

| Cenário | Comando |
|---|---|
| 20 compradores simultâneos disputando 5 unidades (sem vender além do estoque) | `npm run test:load` |
| Vazão e latência sob carga (centenas de req/s) | `npm run test:load` |
| Expiração de reserva sem esperar 15 min | `npm run test:integration` |
| Pagamento confirmado duas vezes (webhook + consulta) sem duplicar efeitos | `npm run test:integration` |

## Correspondência com a suíte automática

| Seção | Teste automático |
|---|---|
| A | `front-end/e2e/smoke.spec.ts` |
| B, D, E, G, H, I, J, L, M, O | `front-end/e2e/flows.spec.ts` |
| C, F, K, N, P | `back-end/tests/integration/*.int.test.ts` (+ verificação manual de UI aqui) |
| Q | Apenas manual |

## Registro de execução

| Data | Quem | Ambiente (A/B) | Seções executadas | Falhas (caso + Request ID) |
|---|---|---|---|---|
| | | | | |

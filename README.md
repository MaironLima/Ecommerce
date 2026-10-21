# Ecommerce Ongoing

Full-stack e-commerce portfolio project: catalog with variants, persistent cart, stock reservations with
cron expiry, Stripe checkout, buyer-only reviews with moderation, e-mail + in-app notifications, user profile
with addresses, and an admin dashboard with analytics, RBAC (Customer / Admin / SuperAdmin) and audit log.

Design decisions for the final stages are documented in [PLANO_FINALIZACAO.md](PLANO_FINALIZACAO.md).
To test every feature by hand (equivalent to the full E2E suite), follow [docs/TESTE-MANUAL.md](docs/TESTE-MANUAL.md).

## Stack

| Layer | Tech |
|---|---|
| Front-end | React 19 + Vite + TypeScript, React Router, React Query, Zustand, Tailwind + shadcn/ui, Lucide, Recharts, Stripe Elements |
| Back-end | Node + Express + TypeScript, Prisma (PostgreSQL), Zod, JWT (access token + HttpOnly refresh cookie), bcrypt, Multer + Sharp, node-cron, Nodemailer, Stripe, Helmet, express-rate-limit, Winston |
| Tests | Vitest + Supertest (API), Playwright (front-end E2E) |

## Quick start

Prerequisites: Node ≥ 18 and a running PostgreSQL.

```bash
cp back-end/.env.example back-end/.env      # set DATABASE_URL and secrets
cp front-end/.env.example front-end/.env
npm run setup                                # installs everything, applies migrations, seeds demo data
npm run dev                                  # API on :3000 + web on :5173
```

| Script (root) | What it does |
|---|---|
| `npm run setup` | Install all deps, `prisma migrate deploy`, seed |
| `npm run dev` | API (tsx watch) + web (Vite) with hot reload |
| `npm run build` | Type-check the API and build the optimized front-end bundle |
| `npm start` | API in production mode + `vite preview` of the built front-end |
| `npm test` | Unit tests, back-end and front-end (see Tests below for every suite) |

### Demo accounts (created by the seed, local only)

All use password `Password123!`

| Email | Role |
|---|---|
| `superadmin@store.com` | SUPERADMIN — everything, including changing user roles |
| `admin@store.com` | ADMIN — products, orders, reviews moderation, analytics |
| `customer@store.com` | CUSTOMER — has paid orders, so can review products |

The seed also creates 8 products (images generated with Sharp), 24 orders spread over 5 months, reviews,
an address and a notification, so the dashboard has data from the first run.

### Stripe (optional)

Put test keys in both `.env` files. Without `stripe listen`, the app still reconciles payments by polling
the PaymentIntent status, so checkout works locally without webhooks. Test card: `4242 4242 4242 4242`.

## Architecture

```
Browser ──► Express API ──► PostgreSQL (Prisma + raw SQL for search/analytics)
              │   ├── imagens/uploads (Sharp-optimized WebP, served by /uploads)
              │   ├── Stripe (PaymentIntents + webhook)
              │   └── SMTP (Nodemailer)
              └── node-cron: release expired reservations (1 min), cancel stale pending orders (5 min)
```

Back-end modules live in `back-end/src/modules/<name>/` (`routes → controllers → services`, Zod DTOs).

## Main endpoints

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register · /auth/login · /auth/logout · /auth/refresh · /auth/recover-email · /auth/recover-code`, `PATCH /auth/recover-password` |
| Profile | `GET/PATCH /users/me`, `PATCH /users/me/password`, `GET/POST /users/me/addresses`, `PUT/DELETE /users/me/addresses/:id` |
| Catalog | `GET /products?sort&category&page`, `GET /products/search?q=`, `GET /products/:id`, `GET /catalog/category`, `GET /variants/:productId` |
| Catalog (admin) | `POST /products`, `PUT /products/:id`, `DELETE /products/:id`, `POST /variants/:productId`, `PUT /variants/:variantId` |
| Cart | `GET /cart`, `POST /cart`, `PUT /cart/:id`, `DELETE /cart/:id` |
| Checkout | `POST /checkout/session`, `POST /checkout/:orderId/confirm`, `GET /checkout/:orderId/status`, `POST /webhooks/stripe` |
| Orders | `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`, `POST /orders/:id/resume` |
| Reviews | `GET /product/:id/review`, `GET /product/:id/review/eligibility`, `POST /product/:id/review`, `DELETE /product/:reviewId/review` |
| Reviews (admin) | `GET /product/reviews` (pending), `PUT /product/:reviewId/validation/review` (approve) |
| Notifications | `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` |
| Admin | `GET /admin/analytics`, `GET /admin/users`, `PATCH /admin/users/:id/role` (SuperAdmin), `GET /admin/orders?status=`, `GET /admin/audit` |
| Health | `GET /ping`, `GET /health` (checks the database) |

## Business rules

- **Stock**: checkout reserves stock for 15 min (`InventoryReservation`); a cron returns expired reservations to stock.
- **Reviews**: only users with a `PAID` order containing the product can review; one review per product; reviews are public only after admin approval.
- **Notifications**: order created, payment confirmed and review approved generate an in-app notification and an e-mail. SMTP failures are logged and never break the flow.
- **RBAC**: `401` without a valid token, `403` for insufficient role; only SuperAdmin changes roles.
- **Audit**: every admin mutation (products, variants, review moderation, role changes) is stored in `audit_log`.

## Security

bcrypt password hashing · short-lived access token + HttpOnly/SameSite refresh cookie · Zod validation on inputs ·
Prisma/parameterized SQL · Helmet · rate limits on login/register/recovery/admin · upload type/size limits + Sharp re-encoding ·
path-traversal-safe file serving · generic login error messages.

## Logs (LGPD)

Every request and business event is logged as structured JSON with a `requestId` (also returned in `X-Request-Id`)
and a pseudonymized user (`uid`). Redaction runs inside the logger itself, so passwords, tokens, cookies, addresses,
card data and search terms never reach a file, and e-mails/IPs are masked. Files rotate daily: `app-*` and `error-*`
are kept for 90 days, `access-*` (full IP, Marco Civil art. 15) for 6 months.
Full policy: [docs/LGPD-LOGS.md](docs/LGPD-LOGS.md).

## Tests

Each suite has its own command. `npm run test:all` runs them in this order, from cheapest to heaviest, and stops at the first failure:

| # | Suite | Command | What it covers |
|---|---|---|---|
| 1 | Type-check | `npm run test:types` | Back-end and front-end compile without type errors |
| 2 | Unit — back-end | `npm run test:unit:back` | Services with mocks: auth, review rules, atomic stock, notifications, LGPD redaction, log filters, KPIs |
| 3 | Unit — front-end | `npm run test:unit:front` | Pure UI logic: JWT role hints, formatters, attribute parser |
| 4 | Integration | `npm run test:integration` | Real HTTP + PostgreSQL: auth/cookies, catalog & search, uploads, cart reservations, checkout → payment (Stripe mocked) → review → moderation, addresses, RBAC, analytics, log viewer |
| 5 | E2E smoke | `npm run test:smoke` | Fast read-only browser checks (health, home, search, product, guards, 404, theme). Point `E2E_BASE_URL`/`E2E_API_URL` at any environment |
| 6 | E2E | `npm run test:e2e` | Full browser journeys: register, cart, profile, notifications, review + approval, dashboard, product upload, roles, logs page |
| 7 | Load ("bomb") | `npm run test:load` | autocannon on the main endpoints (fails on errors or p99 > `LOAD_P99_MS`), login brute force must hit the rate limit, 20 buyers racing for 5 units must not oversell |
| — | All, in order | `npm run test:all` | Steps 1→7 with a summary. Resume after a failure: `npm run test:all -- --from=e2e` |

`npm run test:unit` runs both unit suites. Integration, E2E and load tests run on a separate database, `<your db>-test`,
which is recreated on every run, and write their logs to a temp folder. Your development data and logs are never touched.
E2E boots its own API on `:3100` and web on `:5174`.

## License

MIT

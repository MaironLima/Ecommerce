# Política de Logs — LGPD

Como a API registra eventos sem expor dados pessoais além do necessário (Lei 13.709/2018).

## Princípios aplicados

| Princípio (LGPD art. 6º) | Como é atendido |
|---|---|
| Finalidade | Logs servem a segurança, auditoria, suporte e diagnóstico. Não são usados para marketing ou perfilamento. |
| Necessidade / minimização | Não registramos corpo de requisição, valores de query string, user-agent, senhas, tokens, endereços, dados de cartão ou códigos de verificação. |
| Segurança | O mascaramento é central, no formato do Winston: **toda** linha passa por ele, e o código que chama o logger não consegue vazar dados por engano. |
| Prevenção | A pseudonimização (art. 13 §4) permite correlacionar eventos de um usuário sem identificá-lo no log. |
| Responsabilização | O `audit_log` no banco registra toda ação administrativa (quem, o quê, quando). |

## O que acontece com cada dado

| Dado | Tratamento no log |
|---|---|
| Senha, token, JWT, `Authorization`, cookie, segredo, assinatura | `[REDACTED]` (por nome de campo e por padrão no texto) |
| E-mail | Mascarado: `c***@store.com`, inclusive dentro de mensagens |
| ID do usuário | Pseudônimo HMAC-SHA256: `uid: u_5a712bfe95492eac` (chave `LOG_HASH_SECRET`) |
| IP | Log de aplicação: último octeto zerado (`192.168.1.0`). Log de acesso: IP completo (ver abaixo) |
| Endereço, CEP, telefone, CPF, cartão | `[REDACTED]` |
| Busca e outros parâmetros de query | Só os **nomes** dos parâmetros (`queryKeys: ["q"]`), nunca os valores |
| Erros de validação | Só o campo e a regra (`field`, `rule`), nunca o valor rejeitado |

A implementação está em [`back-end/src/common/utils/privacy.ts`](../back-end/src/common/utils/privacy.ts) e é coberta por testes unitários.

## Arquivos e retenção

| Arquivo (`back-end/logs/`) | Conteúdo | Retenção | Base legal |
|---|---|---|---|
| `app-AAAA-MM-DD.log` | Eventos da aplicação e requisições (JSON) | 90 dias (`LOG_RETENTION_APP`) | Legítimo interesse: segurança e operação (art. 7º IX) |
| `error-AAAA-MM-DD.log` | Somente erros | 90 dias | Idem |
| `access-AAAA-MM-DD.log` | Registro de acesso: data/hora, IP completo, rota, status | 6 meses (`LOG_RETENTION_ACCESS`) | Obrigação legal: Marco Civil da Internet, art. 15 (art. 7º II LGPD) |

Os arquivos são rotacionados por dia, compactados (`.gz`) e apagados automaticamente ao fim da retenção (`winston-daily-rotate-file`).
Em produção, restrinja a pasta `logs/` aos operadores (por exemplo, `chmod 640`, com dono no usuário do serviço).

## Visualização no painel (`/admin/logs`)

| Perfil | Vê |
|---|---|
| ADMIN | Logs de aplicação e de erro, já mascarados |
| SUPERADMIN | Os mesmos logs + o log de acesso (IP completo). **Cada consulta ao log de acesso é gravada no `audit_log`** (`ACCESS_LOG_VIEW`) |
| CUSTOMER | Nada (403) |

O painel lê os arquivos rotacionados (inclusive os `.gz`), com período máximo de 31 dias por consulta. Os filtros são nível,
evento, status (`404` ou `4xx`), método, `requestId`, pseudônimo do usuário e texto livre, e há atalhos prontos
(erros, 5xx, logins com falha, acesso negado, rate limit, pagamentos).

## Correlação e suporte

Cada requisição recebe um `requestId`, devolvido no header `X-Request-Id`. Quando o usuário informa esse id, o suporte encontra
todos os eventos daquela requisição sem precisar perguntar e-mail ou outro dado pessoal.

## Eventos registrados

`http.request`, `auth.register`, `auth.login.success`/`failed`, `auth.logout`, `auth.refresh.failed`, `auth.recover.*`,
`auth.password.reset`, `user.profile.updated`, `user.password.changed`, `user.address.created`/`updated`/`deleted`,
`cart.item.added`/`updated`/`removed`, `checkout.session.created`, `checkout.stripe_error`, `order.paid`, `order.cancelled`,
`order.resumed`, `review.created`/`deleted`, `notification.created`, `mail.sent`/`failed`/`skipped`, `upload.processed`,
`security.forbidden`, `security.rate_limited`, `request.failed`, `request.invalid`, `request.unhandled_error`, `audit`,
`server.started`, `cron.*`, `stripe-webhook`.

## Direitos do titular

Os logs não guardam o ID real nem o e-mail completo. Para atender um pedido de acesso ou eliminação (art. 18), calcule o pseudônimo
do usuário com `pseudonymize(userId)` e filtre os arquivos por `uid`. O log de acesso, guardado por obrigação legal, é mantido até o
fim do prazo do Marco Civil, mesmo se houver pedido de eliminação (art. 16 I).

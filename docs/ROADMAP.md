# Roadmap do Cronko

Posicionamento: **monitor de cron jobs/backups/ETLs, self-hosted**. Não competimos com o Uptime Kuma em checks ativos (HTTP/TCP); a régua real é o Healthchecks.io. Detalhes e fontes em [competitive/cronko-vs-uptime-kuma.md](competitive/cronko-vs-uptime-kuma.md).

Cada item vira um plano de implementação próprio (superpowers:writing-plans) antes de ser construído.

## P0 — Confiabilidade (pré-requisito: um alerta perdido é fatal)

| #   | Item                                                                         | Por quê                                                         | Onde                                     |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| 0.1 | Lock/leader election do scheduler (Redis ou DB)                              | Com 2+ réplicas, alertas duplicam                               | `apps/api/src/services/scheduler.ts`     |
| 0.2 | Testes do scheduler, notifier, csrf, rotas monitors/incidents/stats/settings | Só o caminho de ping/auth tem testes                            | `apps/api/src/**`                        |
| 0.3 | Validar migrations e schema em Postgres                                      | Schema é `sqliteTable`; Postgres nunca foi provado              | `packages/database`                      |
| 0.4 | Revisar CSRF                                                                 | Dois commits quase idênticos; proteção depende de SameSite/CORS | `apps/api/src/middleware/csrf.ts`        |
| 0.5 | Retry/backoff e registro de falha de notificação                             | Falha de envio não pode sumir em silêncio                       | `apps/api/src/services/notifier.ts`      |
| 0.6 | Build Docker alpine com better-sqlite3 13 + CI de e2e (Playwright)           | Não validado após o upgrade                                     | `apps/*/Dockerfile`, `.github/workflows` |

## P1 — Paridade com Healthchecks (sem isso não há motivo para trocar)

1. **Agenda por expressão cron + timezone** (e calcular a próxima execução esperada).
2. **Sinal de falha** `/ping/:token/fail` (+ exit code) e estado "failed" distinto de "missed".
3. **Log de eventos por check** com corpo/saída (limite configurável).
4. **Canais:** webhook genérico, ntfy, Pushover, PagerDuty, Microsoft Teams.
5. **Ping por e-mail** e silenciamento por check.

## P2 — Diferenciais acima do Healthchecks

1. Estatísticas de duração (p50/p95), detecção de run lento/anômalo e de runs sobrepostos.
2. **CLI wrapper** `cronko run -- <cmd>` (start, fail, exit code, saída) e snippets prontos (cron, systemd, k8s CronJob, GitHub Actions, Docker).
3. **Status pages públicas** por grupo/tag, com SLA e histórico de incidentes.
4. Grupos/tags, janelas de manutenção, resumo diário/semanal.

## P3 — Alcance e maturidade

- Multiusuário/equipes, API tokens com escopo.
- Importadores (Healthchecks, Kuma), export/backup via UI.
- Métricas Prometheus; versionamento e changelog (hoje tudo `0.0.0`).
- Documentação de coexistência: "Kuma para serviços, Cronko para jobs".

## Não faremos (anti-objetivos)

- Checks ativos HTTP/TCP/DNS/ping como foco — diluem o diferencial e viram um Kuma pior. Se vierem, só como complemento leve (fora do roadmap atual).

## Ordem sugerida

P0.1–0.4 → P1.1–1.2 → P0.5–0.6 → P1.3–1.5 → P2 → P3.

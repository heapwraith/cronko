# Cronko vs Uptime Kuma (e o concorrente real do nicho: Healthchecks.io / Cronitor)

> Data: 2026-11-05. Concorrência muda rápido; revisar a cada trimestre.
> Legenda de confiança: **[V]** verificado em fonte oficial nesta pesquisa · **[C]** conhecimento geral, **não verificado agora** · **[I]** inferência/medido no código do Cronko.

## 1. Conclusão principal

O Uptime Kuma **não é o concorrente direto do Cronko**. Ele é um monitor de *disponibilidade ativa* (ele consulta seus serviços); o Cronko é um monitor *passivo de jobs agendados* (o job avisa que rodou). No nicho do Cronko, os concorrentes diretos são **Healthchecks.io** (open source, self-hosted) e **Cronitor** (SaaS). Fontes de terceiros apontam o uso combinado: Kuma para serviços, Healthchecks para jobs.

Consequência estratégica: "ser melhor que o Kuma" só faz sentido **dentro do propósito do Cronko**. A régua real é o Healthchecks.io, que já tem o que o Cronko ainda não tem (cron expressions, sinal de falha, log de eventos, 20+ integrações).

## 2. Posicionamento

| | Cronko | Uptime Kuma | Healthchecks.io | Cronitor |
|---|---|---|---|---|
| Categoria | Dead-man's-switch self-hosted | Monitor de uptime self-hosted | Monitor de cron jobs (SaaS + open source) [V] | Cron + uptime + status pages (SaaS) [V] |
| Direção do check | Passivo (job → Cronko) [I] | Majoritariamente ativo (+ monitor "push") [C] | Passivo [V] | Passivo + ativo [V] |
| Self-hosted | Sim [I] | Sim [V] | Sim (open source) [V] | Não [V] |
| Banco | SQLite / Postgres [I] | SQLite; MariaDB desde a v2 [V] | — | — |

## 3. Matriz de funcionalidades (Forte / Adequado / Fraco / Ausente)

Cronko é avaliado pelo código [I]. Healthchecks/Cronitor pela tabela oficial do Healthchecks [V]. Kuma [C], salvo indicação.

| Capacidade | Cronko | Healthchecks.io | Cronitor | Uptime Kuma |
|---|---|---|---|---|
| Ping URL por job | Forte | Forte | Forte | Adequado (monitor "push") |
| Agenda por intervalo + grace | Adequado | Forte | Forte | Adequado |
| **Agenda por expressão cron + timezone** | **Ausente** | Forte [V] | Forte [V] | Ausente |
| systemd OnCalendar | Ausente | Forte [V] | Ausente [V] | Ausente |
| Evento "started" (duração do job) | Forte (pulse start/finish) | Forte [V] | Forte [V] | Ausente |
| **Evento "failed" explícito / exit code** | **Ausente** | Forte [V] | Forte [V] | Ausente |
| Duração máxima (`max_duration_ms`) | Forte | Adequado | Adequado | Ausente |
| Corpo da requisição guardado | Adequado (coluna `body`) | Forte (até 100 KB) [V] | Fraco (só com CLI) [V] | Ausente |
| Log de eventos por check | Adequado (500 heartbeats) | Adequado (100 free / 1000 pago) [V] | Ausente [V] | Adequado |
| Ping por e-mail | Ausente | Forte [V] | Forte [V] | Ausente |
| Incidentes | Forte | Adequado | Adequado | Adequado |
| Canais de notificação | Fraco (4: Discord, Telegram, e-mail, Slack) | Forte (dezenas) | Forte | Forte (dezenas; novos na v2) [V] |
| Status pages públicas | Ausente (só badge SVG) | Adequado (badges) [V] | Forte (hospedadas) [V] | Forte |
| Checks ativos HTTP/TCP/etc. | Ausente (fora de escopo) | Ausente | Forte [V] | Forte |
| Multi-usuário / projetos / times | Ausente (1 admin) | Forte [V] | Forte | Fraco |
| API + docs | Forte (OpenAPI/Scalar) | Forte [V] | Forte | Fraco |
| Audit log | Forte | — | — | Fraco |
| PWA / i18n | Adequado (PWA, en/pt-BR) | Fraco | Fraco | Forte (muitos idiomas) |
| Hardening (CSRF, rate limit, headers) | Forte | Forte | n/a | Adequado |

## 4. Pontos fortes e fracos

**Cronko** — Fortes: semântica de job (pulse start/finish, duração máxima), incidentes, audit log, OpenAPI, base moderna (Hono/Next/Drizzle), Postgres. Fracos: agenda só por intervalo, sem sinal de falha, 4 canais, sem status page, sem multiusuário, scheduler single-instance, cobertura de testes baixa.

**Healthchecks.io** — Fortes: cron expressions + grace time, started/failed, log de eventos, captura de corpo, muitos integrations, open source, plano gratuito de 20 checks [V]. Fracos: interface simples, sem checks ativos.

**Cronitor** — Fortes: métricas ricas (exit code, count, duration, error_count), CLI, status pages, uptime ativo [V]. Fracos: caro e sem self-hosting; só 5 checks grátis [V].

**Uptime Kuma** — Fortes: UI polida, enorme variedade de checks ativos, status pages, muitas notificações, comunidade grande. Fracos para o nosso caso: não entende "job"; sem cron expression, sem started/failed.

## 5. Oportunidades (onde o Cronko pode ser *melhor*)

1. **Fechar a paridade com Healthchecks** (cron expression + timezone, `/fail`, log de eventos). Sem isso o Cronko não é argumento para quem já conhece Healthchecks.
2. **Diferenciar acima do Healthchecks**: duração com p50/p95 e detecção de anomalia, alerta de execução sobreposta, captura de saída/log do job, wrapper CLI (`cronko run -- cmd`), snippets prontos (cron, systemd, k8s CronJob, GitHub Actions).
3. **Status page focada em jobs** (SLA por job, histórico), algo que o Healthchecks não oferece de forma forte.
4. **Experiência self-hosted moderna**: UI em pt-BR/en, PWA, OpenAPI, métricas Prometheus, importador do Healthchecks/Kuma.
5. **Confiabilidade operacional** (scheduler com lock p/ réplicas, retries de notificação) como argumento de "dá para confiar o backup nisso".

## 6. Ameaças

- Healthchecks.io já é maduro, open source e gratuito para 20 checks; trocar exige motivo claro.
- Kuma pode melhorar seu monitor "push" e capturar parte do público que não quer duas ferramentas.
- Risco interno: ampliar escopo para checks ativos diluiria o diferencial e reproduziria o Kuma pior.
- Para um monitor de backups, **um alerta perdido é fatal**; hoje o scheduler in-process e a cobertura de testes baixa são o maior risco de credibilidade.

## 7. Implicações estratégicas

- **Construir (P0/P1):** lock do scheduler, testes, cron expression + timezone, `/fail`, log por execução, canais (webhook, ntfy, Pushover, PagerDuty).
- **Diferenciar:** estatísticas de duração, status pages por job, CLI wrapper, importadores.
- **Não construir (agora):** checks HTTP/TCP/DNS — deixar Kuma fazer; documentar a coexistência ("use Kuma para serviços, Cronko para jobs").
- **Mensagem:** "O monitor de cron jobs que você hospeda, com a confiabilidade de um dead-man's-switch e a observabilidade que o Healthchecks não dá."

## 8. Lacunas desta pesquisa (a confirmar)

- Lista oficial de tipos de monitor, status pages e quantidade de notificações do Kuma v2 (a página da wiki não carregou; a pesquisa só confirmou MariaDB, Docker rootless e novos provedores) — todas as linhas Kuma marcadas [C] devem ser revisadas.
- Comportamento exato do monitor "push" do Kuma (janela, retries).
- Preços atuais do Cronitor além de "$20/mês → 7 monitores" vs Healthchecks "100 checks" citados pela doc do Healthchecks (fonte parcial, de concorrente).

## Fontes

- [Healthchecks.io — Compared to Cronitor](https://healthchecks.io/docs/healthchecks_cronitor_comparison/)
- [Healthchecks.io — home](https://healthchecks.io/)
- [Uptime Kuma — README](https://github.com/louislam/uptime-kuma)
- [Linuxiac — Uptime Kuma 2.0](https://linuxiac.com/uptime-kuma-2-0-arrives-with-mariadb-support-modern-ui-refresh/)
- [AlternativeTo — Uptime Kuma 2.0](https://alternativeto.net/news/2025/10/uptime-kuma-2-0-introduces-mariadb-support-rootless-docker-modern-ui-and-upgrade-tools)
- [Hyperping — Healthchecks.io alternatives](https://hyperping.com/blog/healthchecks-io-alternatives) (terceiro, de concorrente)

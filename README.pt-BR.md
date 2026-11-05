# Cronko

Saiba quando seus jobs param de rodar.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-24-green.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-9-orange.svg)](https://pnpm.io)

[Read in English](README.md)

```
$ docker compose up
✔ db        Started
✔ api       Started  (http://localhost:3001)
✔ web       Started  (http://localhost:3000)
```

---

## O que é

Cronko monitora cron jobs, scripts de backup, pipelines ETL e qualquer
automação que possa disparar uma requisição HTTP. Você configura um monitor
com um intervalo esperado, recebe uma URL de ping, e o sistema te alerta
quando um job deixa de executar dentro da janela.

Não é uma plataforma de observabilidade. Não coleta métricas, não faz parsing
de logs, não faz tracing distribuído. Se você precisa de Datadog, não é isso.
O Cronko faz uma coisa: avisa quando seus jobs param de rodar.

## Como funciona

Cada monitor recebe uma URL única de ping. Seu cron job acessa essa URL
quando executa. O scheduler verifica a cada poucos segundos se cada monitor
recebeu um heartbeat dentro da janela esperada. Heartbeats atrasados disparam
"missed", ausência prolongada dispara "down", e a recuperação restaura tudo.
Incidentes são registrados com timestamps de início/fim. Notificações são
disparadas a cada transição de estado via Discord, Telegram, Email ou Slack.

```bash
# no seu crontab
0 2 * * * /usr/local/bin/backup.sh && \
  curl -s https://cronko.exemplo.com/ping/seu-token > /dev/null
```

## Funcionalidades

- Monitoramento de heartbeat para cron jobs, scripts, ETLs
- Detecção de status: pending → healthy → missed → down → recovered
- Período de graça configurável antes de marcar como missed
- Registro de incidentes com timestamps para cada transição de status
- Pulse (start/finish) para medição precisa de duração de jobs longos
- Alertas de duração máxima quando jobs excedem limites configurados
- Notificações via Discord, Telegram, Email, Slack
- Badge SVG pública (`/badge/:token`) sem autenticação
- Dashboard com gráfico de rosca, sparklines, contadores animados, uptime 24h
- Limpeza automática de heartbeats (retenção configurável)
- Tema escuro / claro / sistema com View Transition API animada
- Modo compacto para telas menores
- Exportação CSV de heartbeats
- i18n: português (Brasil) e inglês
- SQLite para desenvolvimento, PostgreSQL para produção
- Redis para rate limiting distribuído (opcional)
- Suporte a Docker e desenvolvimento local
- Health probes: `/health`, `/health/live`, `/health/ready`
- Métricas do scheduler: `/health/metrics`
- Auditoria de todas as ações críticas
- Scripts de backup e restore do banco
- Rotação de refresh token com renovação automática

## Instalação

### Docker

```bash
git clone https://github.com/wesllen-lima/cronko
cd cronko
cp .env.example .env
# edite .env — defina JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up -d
```

Acesse `http://localhost:3000` e faça login com `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

### Desenvolvimento local

```bash
pnpm install
cp .env.example .env
# DATABASE_URL padrão é SQLite — nenhuma configuração extra necessária
pnpm dev
```

API em `:3001`, web em `:3000`.

## Variáveis de ambiente

| Variável              | Obrigatória | Descrição                                                     |
| --------------------- | ----------- | ------------------------------------------------------------- |
| `DATABASE_URL`        | Sim         | `file:./data/cronko.db` (SQLite) ou `postgresql://...`        |
| `API_PORT`            | Não         | Porta do servidor API (padrão: 3001)                          |
| `API_HOST`            | Não         | Endereço de bind da API (padrão: 0.0.0.0)                     |
| `NEXT_PUBLIC_API_URL` | Não         | URL que o frontend usa para alcançar a API                    |
| `JWT_SECRET`          | Sim         | Chave para assinar tokens JWT (mín 32 caracteres)             |
| `ADMIN_EMAIL`         | Não         | Email do admin criado automaticamente no primeiro boot        |
| `ADMIN_PASSWORD`      | Não         | Senha do admin criado automaticamente (mín 8 caracteres)      |
| `SMTP_HOST`           | Não         | Servidor SMTP para notificações por email                     |
| `SMTP_PORT`           | Não         | Porta SMTP (padrão: 587)                                      |
| `SMTP_USER`           | Não         | Usuário SMTP                                                  |
| `SMTP_PASS`           | Não         | Senha SMTP                                                    |
| `SMTP_FROM`           | Não         | Remetente dos emails de notificação                           |
| `TELEGRAM_BOT_TOKEN`  | Não         | Token do bot para notificações Telegram                       |
| `CORS_ORIGINS`        | Não         | Origens CORS adicionais, separadas por vírgula                |
| `REDIS_URL`           | Não         | URL do Redis para rate limiting distribuído                   |
| `NODE_ENV`            | Não         | `development`, `production` ou `test` (padrão: `development`) |

## Integrações de notificação

### Discord

Crie um webhook nas configurações do servidor Discord. Adicione um canal no Cronko
com tipo `discord` e cole a URL do webhook.

```json
{ "webhookUrl": "https://discord.com/api/webhooks/..." }
```

### Telegram

Crie um bot via `@BotFather`, obtenha o token, encontre o chat ID. Adicione um
canal com tipo `telegram`.

```json
{ "botToken": "123456:ABC-DEF...", "chatId": "-1001234567890" }
```

### Email

Defina `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `SMTP_FROM` no
`.env`. Adicione um canal com tipo `email` e o endereço do destinatário.

```json
{ "to": "alertas@exemplo.com" }
```

### Slack

Crie um webhook no Slack. Adicione um canal com tipo `slack` e cole a URL do
webhook.

```json
{ "webhookUrl": "https://hooks.slack.com/services/..." }
```

## Funcionalidades avançadas

### Pulse (start/finish)

Para jobs longos, use `/start` antes de começar e `/finish` ao terminar.
A duração é calculada automaticamente.

```bash
curl -X POST https://cronko.exemplo.com/ping/TOKEN/start
./meu-job-longo.sh
curl -X POST "https://cronko.exemplo.com/ping/TOKEN/finish?d=$SECONDS&exit=$?"
```

### Badge de status público

Exiba o status do seu monitor em qualquer lugar com uma badge SVG pública.

```markdown
![Cronko](https://cronko.exemplo.com/badge/TOKEN)
```

### Duração máxima

Configure um limite de duração ao criar um monitor. Se o ping reportar uma
duração acima desse limite, um incidente é gerado automaticamente.

### Limpeza de heartbeats

Heartbeats com mais de 90 dias são removidos automaticamente (configurável
em Settings).

### Exportação CSV

Exporte os heartbeats de qualquer monitor em formato CSV:
`/api/monitors/:id/heartbeats?format=csv`

## Stack

- Backend: Hono, Node.js, Drizzle ORM, SQLite / PostgreSQL
- Frontend: Next.js, React, Tailwind CSS
- Infra: Docker, pnpm workspaces, Turborepo

## Contribuindo

Veja [CONTRIBUTING.md](CONTRIBUTING.md) para instruções de configuração local e
guia de estilo de código.

Antes de abrir um PR, verifique se `pnpm typecheck` passa em todos os
workspaces. Reporte bugs usando os templates de issue e revise nossa
[Política de Segurança](SECURITY.md) para divulgação de vulnerabilidades.

## Licença

MIT — veja [LICENSE](LICENSE) para detalhes.

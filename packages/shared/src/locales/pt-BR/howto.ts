export const howto = {
  "howto.title": "Como Usar",
  "howto.flow.ping": "O job envia um ping",
  "howto.flow.wait": "O Cronko espera o intervalo e a tolerância",
  "howto.flow.alert": "Se não chegar, abre um incidente e alerta",
  "howto.fail.title": "Avisando uma falha",
  "howto.fail.p1":
    "Se o job termina com erro, chame /fail: o alerta sai na hora, sem esperar o intervalo acabar. Sem exit code, o Cronko registra 1.",
  "howto.status.pending": "Criado, ainda sem nenhum ping.",
  "howto.status.healthy": "O último ping chegou dentro do prazo.",
  "howto.status.missed": "Atrasado: passou do intervalo, ainda dentro da tolerância.",
  "howto.status.down": "Silêncio além da tolerância. Um incidente foi aberto.",
  "howto.status.failed": "O job executou e reportou falha.",
  "howto.status.paused": "Pausado: sem alertas.",
  "howto.badge.alt": "Badge de status",
  "howto.subtitle": "Aprenda a integrar o Cronko com seus jobs, scripts e cron tabs em minutos.",
  "howto.whatIs.title": "O que é o Cronko?",
  "howto.whatIs.p1":
    "Cronko é um serviço de monitoramento de cron jobs e tarefas agendadas. Seus jobs enviam pings (heartbeats) e o Cronko te alerta quando algo para de funcionar.",
  "howto.create.title": "Criando seu Primeiro Monitor",
  "howto.create.p1":
    "Cada monitor representa um job ou tarefa que você quer acompanhar. Siga os passos:",
  "howto.create.step1name": "Acesse Monitores → Novo Monitor",
  "howto.create.step1desc":
    "Dê um nome e diga como o job roda: a cada intervalo (ex.: 1 hora) ou por expressão cron com fuso horário.",
  "howto.create.step2name": "Defina o período de tolerância (grace period)",
  "howto.create.step2desc":
    "Tempo extra, em minutos, antes de marcar como atrasado. Ex.: 5 minutos.",
  "howto.create.step3name": "Opcional: defina duração máxima",
  "howto.create.step3desc":
    "Se o job demorar mais que isso, um incidente é gerado automaticamente.",
  "howto.create.step4name": "Copie a URL de ping",
  "howto.create.step4desc":
    "Ela aparece na página do monitor e contém um token secreto, único por monitor. Os exemplos abaixo já usam a do seu primeiro monitor.",
  "howto.ping.title": "Enviando Pings",
  "howto.ping.p1":
    "Seu job deve fazer uma requisição HTTP para o Cronko ao finalizar. Use os exemplos abaixo com seu token:",
  "howto.ping.simple": "Ping simples",
  "howto.ping.withDuration": "Com duração (ms)",
  "howto.ping.withExit": "Com exit code",
  "howto.ping.withLog": "Com log (últimas 50 linhas)",
  "howto.wrapper.title": "cronko-run: o jeito mais fácil",
  "howto.wrapper.p1":
    "Um script que roda o job, mede o tempo, captura a saída e avisa o Cronko sozinho. Exit diferente de zero vira falha, e a saída aparece na página da execução. Só precisa de sh e curl.",
  "howto.wrapper.install": "Instalar",
  "howto.wrapper.usage": "Usar no crontab",
  "howto.crontab.title": "Integração com Crontab",
  "howto.crontab.p1":
    "Exemplo prático de integração com crontab. Sucesso chama o ping normal; erro chama /fail.",
  "howto.crontab.bashOnly": "Script Bash com medição de duração",
  "howto.pulse.title": "Pulse — Medindo Duração (Start/Finish)",
  "howto.pulse.p1":
    "Para jobs longos, use o padrão pulse: envie /start antes de começar e /finish ao terminar. A duração é calculada automaticamente.",
  "howto.email.title": "Ping por e-mail",
  "howto.email.p1":
    "Para equipamentos que só sabem mandar e-mail (NAS, softwares de backup, roteadores). Cada mensagem recebida conta como um ping; o remetente, o assunto e o texto viram a saída da execução.",
  "howto.email.success": "Sucesso",
  "howto.email.fail": "Falha",
  "howto.email.keywords":
    "Você também pode definir, no formulário do monitor, palavras de falha: um assunto que contenha alguma delas conta como falha.",
  "howto.status.title": "Ciclo de Status",
  "howto.status.p1": "Entenda o ciclo de vida de um monitor:",
  "howto.badge.title": "Badge de Status Público",
  "howto.badge.p1":
    "Exiba o status do seu monitor em qualquer lugar com uma badge SVG pública. Não requer autenticação.",
  "howto.badge.preview": "Pré-visualização ao vivo",
  "howto.badge.markdown": "Embed no README (Markdown)",
  "howto.badge.tagTitle": "Badge de uma tag",
  "howto.badge.tagP1":
    "Resume todos os monitores com uma tag (vale o pior estado; pausados são ignorados). Só funciona enquanto existir uma página de status ativa para a tag. Troque prod pela sua tag.",
  "howto.badge.shields": "Via shields.io (endpoint)",
  "howto.notifications.title": "Notificações",
  "howto.notifications.p1":
    "Configure canais na aba Notificações. Há alertas quando um monitor atrasa, cai, falha, passa da duração máxima e quando volta ao normal. Lá também ficam as janelas de manutenção e o histórico de entregas; o resumo diário ou semanal fica em Configurações.",
  "howto.notifications.discord": "Webhook do Discord — receba alertas em qualquer canal.",
  "howto.notifications.telegram": "Bot do Telegram — envie alertas para um chat.",
  "howto.notifications.email": "Email SMTP — alertas por email.",
  "howto.notifications.slack": "Webhook do Slack — integração com canais Slack.",
  "howto.notifications.googlechat": "Webhook de entrada de um espaço do Google Chat.",
  "howto.notifications.mattermost": "Webhook de entrada do Mattermost (self-hosted).",
  "howto.notifications.rocketchat": "Webhook de entrada do Rocket.Chat (self-hosted).",
  "howto.notifications.gotify": "Servidor Gotify (self-hosted) com o token de uma aplicação.",
  "howto.notifications.matrix": "Mensagem numa sala Matrix, com homeserver, token e ID da sala.",
  "howto.notifications.apprise": "Qualquer serviço suportado pelo Apprise, via um apprise-api seu.",
  "howto.notifications.webhook":
    "Webhook genérico — recebe um JSON com evento, monitor e mensagem.",
  "howto.notifications.ntfy": "ntfy — push no celular via ntfy.sh ou servidor próprio.",
  "howto.notifications.pushover":
    "Pushover — push no celular; falhas e quedas furam o horário de silêncio.",
  "howto.notifications.pagerduty":
    "PagerDuty — abre um incidente com severidade e resolve sozinho quando o job volta.",
  "howto.notifications.teams":
    'Microsoft Teams — webhook de um fluxo do Workflows ("Post to a channel when a webhook request is received").',
  "howto.notifications.webpush":
    "Web Push — alertas direto no navegador ou no celular, sem app de terceiros.",
} as const

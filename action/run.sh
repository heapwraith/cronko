#!/bin/sh
# Entry point of the Cronko GitHub Action (see /action.yml). POSIX sh + curl only.
#
# Settings arrive as environment variables so that nothing the workflow passes
# (the command, the URL) is ever interpolated into shell source.
#
#   CRONKO_URL                 ping URL (…/ping/<token> or …/ping/k/<key>/<slug>), a secret
#   CRONKO_MODE                wrap (default) | report | start
#   CRONKO_COMMAND, CRONKO_SHELL   wrap: the script to run and the shell to run it with
#   CRONKO_STATUS              report: success (default) | failure | cancelled | skipped
#   CRONKO_TIMEOUT             seconds per ping request (default 10)
#   CRONKO_MAX_OUTPUT          wrap: bytes of output to send (default 10000, max 10000)
#   CRONKO_FAIL_ON_PING_ERROR  true: fail the step when Cronko cannot be reached
#                              (default false: a monitoring outage must not fail the job)

set -u

here=$(cd "$(dirname "$0")" && pwd)
url=${CRONKO_URL:-}
mode=${CRONKO_MODE:-wrap}
timeout=${CRONKO_TIMEOUT:-10}
strict=${CRONKO_FAIL_ON_PING_ERROR:-false}

if [ -z "$url" ]; then
  echo "::error::Cronko: the 'url' input is required"
  exit 64
fi
# The URL carries the monitor token (or the ping key): keep it out of the logs.
echo "::add-mask::$url"
url=${url%/}

case $url in
  http://*/ping/* | https://*/ping/*) ;;
  *)
    echo "::error::Cronko: 'url' must be a Cronko ping URL (…/ping/<token>)"
    exit 64
    ;;
esac

command -v curl >/dev/null 2>&1 || {
  echo "::error::Cronko: curl is required on this runner"
  exit 69
}

# One plain ping. A failed ping only fails the step when fail-on-ping-error is true.
ping_once() {
  curl -fsS -m "$timeout" --retry 2 -o /dev/null -X POST "$1" 2>/dev/null && return 0
  if [ "$strict" = "true" ]; then
    echo "::error::Cronko: could not report to Cronko"
    return 75
  fi
  echo "::warning::Cronko: could not report to Cronko (the job itself is not affected)"
  return 0
}

case $mode in
  wrap)
    if [ -z "${CRONKO_COMMAND:-}" ]; then
      echo "::error::Cronko: mode 'wrap' needs the 'command' input"
      exit 64
    fi
    [ "$strict" = "true" ] && export CRONKO_FAIL_ON_PING_ERROR=1
    exec sh "$here/../apps/web/public/cronko-run" "$url" -- "${CRONKO_SHELL:-sh}" -c "$CRONKO_COMMAND"
    ;;
  start)
    ping_once "$url/start"
    exit $?
    ;;
  report)
    case ${CRONKO_STATUS:-success} in
      success) ping_once "$url" ;;
      failure) ping_once "$url/fail" ;;
      cancelled | skipped)
        echo "::notice::Cronko: the job was ${CRONKO_STATUS}, nothing reported"
        exit 0
        ;;
      *)
        echo "::error::Cronko: unknown status '${CRONKO_STATUS}' (use success, failure, cancelled or skipped)"
        exit 64
        ;;
    esac
    exit $?
    ;;
  *)
    echo "::error::Cronko: unknown mode '$mode' (use wrap, report or start)"
    exit 64
    ;;
esac

#!/bin/sh
set -e

echo "Starting Robotechy services..."

# Start order service in background (if env vars are set)
ORDER_PID=""
if [ -n "$MERCHANT_NSEC" ] && [ -n "$LIGHTNING_ADDRESS" ]; then
  echo "Starting order processing service..."
  cd /app/order-service
  node index.js &
  ORDER_PID=$!
  echo "Order service started (PID: $ORDER_PID)"
  cd /app
else
  echo "Warning: MERCHANT_NSEC or LIGHTNING_ADDRESS not set - order service disabled"
fi

# Start the event archiver (public key only — never needs MERCHANT_NSEC). It
# backs up every event the shop key publishes to /data/backups and publishes
# dist/catalog-snapshot.json so the site never renders blank. It is
# non-critical, so unlike the services above, the supervisor RESTARTS it on
# exit (rate-limited) instead of taking the container down.
ARCHIVER_PID=""
ARCHIVER_STARTED_AT=0
start_archiver() {
  cd /app/order-service
  node archiver.js &
  ARCHIVER_PID=$!
  ARCHIVER_STARTED_AT=$(date +%s)
  cd /app
  echo "Event archiver started (PID: $ARCHIVER_PID)"
}
if [ -n "$MERCHANT_NPUB" ]; then
  start_archiver
else
  echo "Warning: MERCHANT_NPUB not set - event archiver / backups disabled"
fi

# Start frontend static server (backgrounded — the shell stays PID 1 so it can
# supervise BOTH children; the previous `exec serve` left the container looking
# "healthy" with a dead order service, which is how a backend crash went
# unnoticed in production. If either child dies, exit so Docker's restart
# policy revives the whole container.)
echo "Starting frontend on port 3000..."
serve -s dist -l 3000 &
SERVE_PID=$!

# A child that exited but hasn't been reaped yet (zombie, state Z) still
# passes `kill -0`, so check the /proc state too — otherwise the supervisor
# could briefly mistake a dead service for a live one. (The shell does reap
# children while blocked in `wait` below, so a zombie can't persist across
# iterations, but this closes the race window entirely.)
is_alive() {
  kill -0 "$1" 2>/dev/null || return 1
  # /proc/<pid>/stat is `pid (comm) state ...`; strip through the last `) `
  # to read the state field (comm itself may contain spaces or parens).
  state=$(awk '{ sub(/.*\) /, ""); print substr($0, 1, 1) }' "/proc/$1/stat" 2>/dev/null)
  [ "$state" != "Z" ]
}

# Forward docker stop / ctrl-c to the children, then exit cleanly. Every kill
# is `|| true`-guarded: under `set -e` a kill of an already-dead child would
# otherwise abort the trap before the clean `exit 0`.
shutdown() {
  echo "Shutting down..."
  if [ -n "$ORDER_PID" ]; then kill "$ORDER_PID" 2>/dev/null || true; fi
  if [ -n "$ARCHIVER_PID" ]; then kill "$ARCHIVER_PID" 2>/dev/null || true; fi
  kill "$SERVE_PID" 2>/dev/null || true
  exit 0
}
trap shutdown TERM INT

# Supervise: if either process dies, take the container down with it.
while :; do
  if [ -n "$ORDER_PID" ] && ! is_alive "$ORDER_PID"; then
    echo "Order service exited - stopping container so Docker restarts it"
    wait "$ORDER_PID" 2>/dev/null || true # reap if zombie
    kill "$SERVE_PID" 2>/dev/null || true
    exit 1
  fi
  if ! is_alive "$SERVE_PID"; then
    echo "Frontend exited - stopping container so Docker restarts it"
    wait "$SERVE_PID" 2>/dev/null || true # reap if zombie
    if [ -n "$ORDER_PID" ]; then kill "$ORDER_PID" 2>/dev/null || true; fi
    exit 1
  fi
  # Archiver died: restart it, but no more than once a minute.
  if [ -n "$ARCHIVER_PID" ] && ! is_alive "$ARCHIVER_PID"; then
    wait "$ARCHIVER_PID" 2>/dev/null || true # reap if zombie
    if [ $(( $(date +%s) - ARCHIVER_STARTED_AT )) -ge 60 ]; then
      echo "Event archiver exited - restarting it"
      start_archiver
    fi
  fi
  # Background sleep + wait keeps the TERM/INT trap responsive mid-interval.
  # (|| true: a trap-interrupted wait returns non-zero, which must not trip
  # set -e and kill PID 1.)
  sleep 5 &
  wait $! || true
done

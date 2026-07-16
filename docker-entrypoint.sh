#!/bin/sh
set -eu

uploads_path="${UPLOADS_PATH:-/app/uploads}"

node dist/startup-validation.js

case "$uploads_path" in
  /app/uploads|/app/uploads/*)
    mkdir -p "$uploads_path"
    chown node:node "$uploads_path"
    ;;
esac

case "${MIGRATE_ON_START:-false}" in
  true)
    npx prisma migrate deploy
    ;;
  false)
    ;;
  *)
    echo 'MIGRATE_ON_START must be true or false' >&2
    exit 1
    ;;
esac

if [ "${NODE_ENV:-development}" = 'production' ]; then
  npx prisma migrate status
fi

exec gosu node "$@"

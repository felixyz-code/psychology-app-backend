#!/usr/bin/env bash
# Exercises a supplied migration image only against a new disposable PostgreSQL
# 16 container. It never targets production or a host database.
set -Eeuo pipefail

readonly DEFAULT_IMAGE="psychology-app-prisma-migrate:cd669fd3e6ef"
readonly PROJECT_PREFIX="psychology_migrate_artifact_test"
readonly DB_USER="artifact_test_user"
readonly DB_NAME="artifact_test_db"
readonly DB_PASSWORD="artifact_test_password"

IMAGE="${1:-${DEFAULT_IMAGE}}"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)_$$"
NETWORK="${PROJECT_PREFIX}_${RUN_ID}"
POSTGRES_CONTAINER="${PROJECT_PREFIX}_postgres_${RUN_ID}"

cleanup() {
  local status="$?"
  docker rm -f "${POSTGRES_CONTAINER}" >/dev/null 2>&1 || true
  docker network rm "${NETWORK}" >/dev/null 2>&1 || true
  exit "${status}"
}
trap cleanup EXIT

docker image inspect "${IMAGE}" >/dev/null
docker network create "${NETWORK}" >/dev/null
docker run -d --name "${POSTGRES_CONTAINER}" --network "${NETWORK}" --network-alias postgres \
  -e "POSTGRES_USER=${DB_USER}" \
  -e "POSTGRES_PASSWORD=${DB_PASSWORD}" \
  -e "POSTGRES_DB=${DB_NAME}" \
  postgres:16-bookworm >/dev/null

for _ in $(seq 1 30); do
  if docker exec "${POSTGRES_CONTAINER}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null; then
    break
  fi
  sleep 1
done
docker exec "${POSTGRES_CONTAINER}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}?schema=public"

set +e
docker run --rm --network "${NETWORK}" -e "DATABASE_URL=${DATABASE_URL}" "${IMAGE}" migrate status
status_before="$?"
set -e
[[ "${status_before}" -ne 0 ]] || {
  echo "Expected a new PostgreSQL database to have pending migrations." >&2
  exit 1
}

docker run --rm --network "${NETWORK}" -e "DATABASE_URL=${DATABASE_URL}" "${IMAGE}" migrate deploy
docker run --rm --network "${NETWORK}" -e "DATABASE_URL=${DATABASE_URL}" "${IMAGE}" migrate status

docker exec "${POSTGRES_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 -Atc \
  'SELECT count(*) FROM "_prisma_migrations";' | grep -Fxq '3'
docker exec "${POSTGRES_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 -Atc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('organizations', 'psychologist_profiles', 'organization_memberships', 'organization_settings', 'organization_branding', 'organization_invitations', 'patient_assignments');" | grep -Fxq '7'

# Deploying a second time must be a no-op and preserve the three applied rows.
docker run --rm --network "${NETWORK}" -e "DATABASE_URL=${DATABASE_URL}" "${IMAGE}" migrate deploy
docker exec "${POSTGRES_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 -Atc \
  'SELECT count(*) FROM "_prisma_migrations";' | grep -Fxq '3'

echo "PostgreSQL 16 empty-database migration image test passed for ${IMAGE}."

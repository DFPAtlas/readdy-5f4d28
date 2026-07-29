#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

DRY_RUN="${1:-}"
BACKUP_ROOT="${UAT_BACKUP_ROOT:-/var/backups/dfp-uat}"
REMOTE_PATH="${UAT_BACKUP_REMOTE_PATH:-/mnt/atlas-vault/dfp-uat}"
ENCRYPTION_ENABLED="${UAT_BACKUP_ENCRYPTION_ENABLED:-true}"

if [[ "$BACKUP_ROOT" == "/" ]] || [[ -z "$BACKUP_ROOT" ]]; then
  echo -e "${RED}ERROR: UAT_BACKUP_ROOT is unsafe or empty${NC}"; exit 1
fi

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
MANIFEST_FILE="${BACKUP_DIR}/manifest.json"

echo "========================================"
echo "  DFP UAT Backup — ${TIMESTAMP}"
echo "  Destination: ${BACKUP_DIR}"
[[ "$DRY_RUN" == "--dry-run" ]] && echo "  MODE: DRY RUN"
echo "========================================"

if [[ "$DRY_RUN" != "--dry-run" ]]; then mkdir -p "$BACKUP_DIR"; fi

# --- 1. Supabase DB ---
echo; echo "[1/5] Supabase Database Backup"
if [[ "$DRY_RUN" != "--dry-run" ]]; then
  if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
    pg_dump --format=custom --file="${BACKUP_DIR}/supabase-database.dump" "$SUPABASE_DB_URL" 2>/dev/null
    if [[ -s "${BACKUP_DIR}/supabase-database.dump" ]]; then
      sha256sum "${BACKUP_DIR}/supabase-database.dump" | cut -d' ' -f1 > "${BACKUP_DIR}/supabase-database.dump.sha256"
      echo -e "  ${GREEN}PASSED${NC}"
    else echo -e "  ${RED}FAILED — empty backup${NC}"; exit 1; fi
  else echo -e "  ${YELLOW}SKIPPED — SUPABASE_DB_URL not set${NC}"; fi
else echo "  [DRY RUN] Would run pg_dump"; fi

# --- 2. n8n DB ---
echo; echo "[2/5] n8n Database Backup"
if [[ "$DRY_RUN" != "--dry-run" ]]; then
  if [[ -n "${N8N_DB_URL:-}" ]]; then
    pg_dump --format=custom --file="${BACKUP_DIR}/n8n-database.dump" "$N8N_DB_URL" 2>/dev/null
    if [[ -s "${BACKUP_DIR}/n8n-database.dump" ]]; then
      sha256sum "${BACKUP_DIR}/n8n-database.dump" | cut -d' ' -f1 > "${BACKUP_DIR}/n8n-database.dump.sha256"
      echo -e "  ${GREEN}PASSED${NC}"
    else echo -e "  ${YELLOW}SKIPPED — empty${NC}"; fi
  else echo -e "  ${YELLOW}SKIPPED — N8N_DB_URL not set${NC}"; fi
else echo "  [DRY RUN] Would run pg_dump for n8n"; fi

# --- 3. n8n encryption key ---
echo; echo "[3/5] n8n Encryption Key"
if [[ "$DRY_RUN" != "--dry-run" ]]; then
  if [[ -n "${N8N_ENCRYPTION_KEY:-}" ]]; then
    echo "$N8N_ENCRYPTION_KEY" > "${BACKUP_DIR}/n8n-key.txt"
    chmod 600 "${BACKUP_DIR}/n8n-key.txt"
    if [[ "$ENCRYPTION_ENABLED" == "true" ]] && command -v gpg &>/dev/null && [[ -f /run/secrets/uat_backup_key ]]; then
      gpg --symmetric --batch --passphrase-file /run/secrets/uat_backup_key --output "${BACKUP_DIR}/n8n-key.txt.gpg" "${BACKUP_DIR}/n8n-key.txt" 2>/dev/null
      rm -f "${BACKUP_DIR}/n8n-key.txt"
      echo -e "  ${GREEN}PASSED — encrypted${NC}"
    else echo -e "  ${GREEN}PASSED${NC}"; fi
  else echo -e "  ${YELLOW}SKIPPED — N8N_ENCRYPTION_KEY not set${NC}"; fi
else echo "  [DRY RUN] Would back up n8n encryption key"; fi

# --- 4. Configuration ---
echo; echo "[4/5] Application Configuration"
if [[ "$DRY_RUN" != "--dry-run" ]]; then
  mkdir -p "${BACKUP_DIR}/config"
  [[ -f docker-compose.example.yml ]] && cp docker-compose.example.yml "${BACKUP_DIR}/config/"
  [[ -f nginx.conf ]] && cp nginx.conf "${BACKUP_DIR}/config/"
  if [[ -f /opt/dfp-uat/app-stack/.env ]]; then
    if [[ "$ENCRYPTION_ENABLED" == "true" ]] && command -v gpg &>/dev/null && [[ -f /run/secrets/uat_backup_key ]]; then
      gpg --symmetric --batch --passphrase-file /run/secrets/uat_backup_key --output "${BACKUP_DIR}/config/env.gpg" "/opt/dfp-uat/app-stack/.env" 2>/dev/null
    else cp "/opt/dfp-uat/app-stack/.env" "${BACKUP_DIR}/config/env"; chmod 600 "${BACKUP_DIR}/config/env"; fi
  fi
  if command -v git &>/dev/null && git rev-parse --git-dir &>/dev/null 2>&1; then
    { echo "commit: $(git rev-parse HEAD)"; echo "branch: $(git rev-parse --abbrev-ref HEAD)"; echo "remote: $(git remote get-url origin 2>/dev/null || echo unknown)"; } > "${BACKUP_DIR}/config/git-info.txt"
  fi
  echo -e "  ${GREEN}PASSED${NC}"
else echo "  [DRY RUN] Would copy configs"; fi

# --- 5. Manifest ---
echo; echo "[5/5] Generate Manifest"
if [[ "$DRY_RUN" != "--dry-run" ]]; then
  echo '{' > "$MANIFEST_FILE"
  echo "  \"backupId\": \"${TIMESTAMP}\"," >> "$MANIFEST_FILE"
  echo "  \"backupType\": \"full_system_manifest\"," >> "$MANIFEST_FILE"
  echo "  \"createdAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"," >> "$MANIFEST_FILE"
  echo "  \"encrypted\": ${ENCRYPTION_ENABLED}," >> "$MANIFEST_FILE"
  echo "  \"files\": [" >> "$MANIFEST_FILE"
  first=true
  while IFS= read -r f; do
    rel="${f#$BACKUP_DIR/}"
    size=$(stat -c%s "$f" 2>/dev/null || echo 0)
    csum=$(sha256sum "$f" | cut -d' ' -f1)
    if [[ "$first" == "true" ]]; then first=false; else echo "," >> "$MANIFEST_FILE"; fi
    echo -n "    {\"filename\": \"$rel\", \"sizeBytes\": $size, \"checksumSha256\": \"$csum\"}" >> "$MANIFEST_FILE"
  done < <(find "$BACKUP_DIR" -type f ! -name "manifest.json" | sort)
  echo "" >> "$MANIFEST_FILE"
  echo "  ]" >> "$MANIFEST_FILE"
  echo "}" >> "$MANIFEST_FILE"
  sha256sum "$MANIFEST_FILE" | cut -d' ' -f1 > "${MANIFEST_FILE}.sha256"
  echo -e "  ${GREEN}PASSED${NC}"
else echo "  [DRY RUN] Would generate manifest"; fi

echo; echo "========================================"
if [[ "$DRY_RUN" != "--dry-run" ]]; then
  echo -e "  ${GREEN}BACKUP COMPLETE${NC}"
  echo "  Location: ${BACKUP_DIR}"
  echo "  Size:     $(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)"
  echo "  Next: bash scripts/verify-backup.sh ${TIMESTAMP}"
else echo -e "  ${YELLOW}DRY RUN COMPLETE${NC}"; fi
echo "========================================"
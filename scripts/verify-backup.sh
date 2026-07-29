#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
BACKUP_ROOT="${UAT_BACKUP_ROOT:-/var/backups/dfp-uat}"
TIMESTAMP="${1:-}"

if [[ -z "$TIMESTAMP" ]]; then
  echo "Usage: bash scripts/verify-backup.sh <timestamp>"
  echo "  e.g. bash scripts/verify-backup.sh 20260729T120000Z"
  exit 1
fi

BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
MANIFEST="${BACKUP_DIR}/manifest.json"

echo "========================================"
echo "  Backup Verification: ${TIMESTAMP}"
echo "========================================"

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo -e "${RED}FAILED: Backup directory not found: ${BACKUP_DIR}${NC}"; exit 1
fi

ERRORS=0

# 1. Check manifest
echo; echo "[1/8] Manifest check"
if [[ -f "$MANIFEST" ]]; then
  if [[ -s "$MANIFEST" ]]; then echo -e "  ${GREEN}PASSED${NC}"; else echo -e "  ${RED}FAILED — empty${NC}"; ERRORS=$((ERRORS + 1)); fi
else echo -e "  ${RED}FAILED — not found${NC}"; ERRORS=$((ERRORS + 1)); fi

# 2. Manifest checksum
echo; echo "[2/8] Manifest checksum"
if [[ -f "${MANIFEST}.sha256" ]]; then
  (cd "$BACKUP_DIR" && sha256sum -c "manifest.json.sha256" --status 2>/dev/null) && echo -e "  ${GREEN}PASSED${NC}" || { echo -e "  ${RED}FAILED — checksum mismatch${NC}"; ERRORS=$((ERRORS + 1)); }
else echo -e "  ${YELLOW}SKIPPED — no checksum file${NC}"; fi

# 3. File existence and size
echo; echo "[3/8] File existence and size"
FILE_COUNT=0; EMPTY=0
while IFS= read -r -d '' f; do
  ((FILE_COUNT++))
  if [[ ! -s "$f" ]]; then echo -e "  ${RED}EMPTY: $(basename "$f")${NC}"; ((EMPTY++)); fi
done < <(find "$BACKUP_DIR" -type f ! -name "manifest.json" -print0)
echo "  Files found: ${FILE_COUNT}"
if [[ $EMPTY -gt 0 ]]; then echo -e "  ${RED}FAILED — ${EMPTY} empty files${NC}"; ERRORS=$((ERRORS + 1));
else echo -e "  ${GREEN}PASSED${NC}"; fi

# 4. File checksums (if .sha256 sidecars exist)
echo; echo "[4/8] File checksum verification"
CSUM_OK=0; CSUM_FAIL=0
while IFS= read -r -d '' sf; do
  base="${sf%.sha256}"
  if [[ -f "$base" ]]; then
    (cd "$(dirname "$sf")" && sha256sum -c "$(basename "$sf")" --status 2>/dev/null) && ((CSUM_OK++)) || ((CSUM_FAIL++))
  fi
done < <(find "$BACKUP_DIR" -name "*.sha256" ! -name "manifest.json.sha256" -print0)
echo "  Passed: ${CSUM_OK}, Failed: ${CSUM_FAIL}"
if [[ $CSUM_FAIL -gt 0 ]]; then echo -e "  ${RED}FAILED — checksum failures${NC}"; ERRORS=$((ERRORS + 1));
else echo -e "  ${GREEN}PASSED${NC}"; fi

# 5. DB dump validity
echo; echo "[5/8] Database dump inspection"
DB_OK=0
for dump in "${BACKUP_DIR}/supabase-database.dump" "${BACKUP_DIR}/n8n-database.dump"; do
  if [[ -f "$dump" ]]; then
    if pg_restore -l "$dump" &>/dev/null; then echo "  $(basename "$dump"): valid"; ((DB_OK++))
    else echo -e "  ${RED}$(basename "$dump"): invalid${NC}"; ERRORS=$((ERRORS + 1)); fi
  fi
done
if [[ $DB_OK -gt 0 ]]; then echo -e "  ${GREEN}PASSED${NC}"; fi

# 6. Encryption key backup
echo; echo "[6/8] n8n encryption key check"
KEY_FOUND=0
[[ -f "${BACKUP_DIR}/n8n-key.txt" ]] && { echo "  Found (plain)"; KEY_FOUND=1; }
[[ -f "${BACKUP_DIR}/n8n-key.txt.gpg" ]] && { echo "  Found (encrypted)"; KEY_FOUND=1; }
if [[ $KEY_FOUND -eq 0 ]]; then echo -e "  ${YELLOW}WARNING — no n8n key backup${NC}"; fi

# 7. Config files present
echo; echo "[7/8] Configuration files"
CFG_COUNT=$(find "${BACKUP_DIR}/config" -type f 2>/dev/null | wc -l)
echo "  Config files: ${CFG_COUNT}"
if [[ $CFG_COUNT -gt 0 ]]; then echo -e "  ${GREEN}PASSED${NC}"; else echo -e "  ${YELLOW}WARNING — no config files${NC}"; fi

# 8. Remote copy check
echo; echo "[8/8] Remote copy"
REMOTE="${UAT_BACKUP_REMOTE_PATH:-/mnt/atlas-vault/dfp-uat}/${TIMESTAMP}"
if [[ -d "$REMOTE" ]]; then echo -e "  ${GREEN}PASSED — remote copy exists${NC}"
else echo -e "  ${YELLOW}WARNING — no remote copy found${NC}"; fi

echo; echo "========================================"
if [[ $ERRORS -eq 0 ]]; then
  echo -e "  ${GREEN}VERIFICATION PASSED${NC}"
else
  echo -e "  ${RED}VERIFICATION FAILED — ${ERRORS} errors${NC}"
  exit 1
fi
echo "========================================"
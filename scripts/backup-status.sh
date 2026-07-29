#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
BACKUP_ROOT="${UAT_BACKUP_ROOT:-/var/backups/dfp-uat}"
REMOTE_PATH="${UAT_BACKUP_REMOTE_PATH:-/mnt/atlas-vault/dfp-uat}"

echo "========================================"
echo "  DFP UAT — Backup Status"
echo "  $(date -u)"
echo "========================================"

# --- Local backups ---
echo; echo "--- Local Backups ($BACKUP_ROOT) ---"
if [[ -d "$BACKUP_ROOT" ]]; then
  COUNT=$(find "$BACKUP_ROOT" -maxdepth 1 -type d | wc -l)
  LATEST=$(ls -1t "$BACKUP_ROOT" 2>/dev/null | head -1)
  SIZE=$(du -sh "$BACKUP_ROOT" 2>/dev/null | cut -f1)
  echo "  Total backups: $((COUNT - 1))"
  echo "  Total size:    ${SIZE:-unknown}"
  echo "  Latest:        ${LATEST:-none}"
  if [[ -n "${LATEST:-}" ]]; then
    AGE=$(($(date +%s) - $(date -d "${LATEST:0:8}" +%s 2>/dev/null || echo 0)))
    HOURS=$((AGE / 3600))
    echo "  Age:           ${HOURS}h"
    if [[ $HOURS -gt 48 ]]; then echo -e "  ${RED}CRITICAL: backup older than 48h${NC}"
    elif [[ $HOURS -gt 30 ]]; then echo -e "  ${YELLOW}WARNING: backup older than 30h${NC}"
    else echo -e "  ${GREEN}OK${NC}"; fi
  fi
else echo -e "  ${YELLOW}No backup directory found${NC}"; fi

# --- Remote backups ---
echo; echo "--- Remote Backups ($REMOTE_PATH) ---"
if [[ -d "$REMOTE_PATH" ]]; then
  RCOUNT=$(find "$REMOTE_PATH" -maxdepth 1 -type d 2>/dev/null | wc -l)
  RLATEST=$(ls -1t "$REMOTE_PATH" 2>/dev/null | head -1)
  echo "  Remote backups: $((RCOUNT - 1))"
  echo "  Latest:         ${RLATEST:-none}"
  echo -e "  ${GREEN}Remote storage available${NC}"
else echo -e "  ${YELLOW}Remote storage unavailable — Atlas Vault may be offline${NC}"; fi

# --- Verified backups ---
echo; echo "--- Verified Backups ---"
VERIFIED=0
for d in "$BACKUP_ROOT"/*/; do
  [[ -d "$d" ]] || continue
  [[ -f "${d}manifest.json.sha256" ]] && { ((VERIFIED++)); echo "  $(basename "$d")"; }
done
echo "  Count: ${VERIFIED}"

# --- Disk ---
echo; echo "--- Disk Usage ---"
df -h "$BACKUP_ROOT" 2>/dev/null | tail -1 || echo "  (unavailable)"
echo; echo "--- Docker ---"
docker system df 2>/dev/null || echo "  (Docker not available)"

echo; echo "========================================"
echo "  Run: bash scripts/verify-backup.sh <timestamp>"
echo "  Run: bash scripts/restore-test.sh <timestamp>"
echo "========================================"
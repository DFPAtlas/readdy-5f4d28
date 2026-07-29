#!/usr/bin/env bash
# ============================================================
# DFP UAT Agent — Local Deployment Verification Script
# ============================================================
# Run this on the Atlas Home UAT VM before deploying:
#   npm run verify:deploy
#
# Runs the same checks as the GitHub Actions workflow:
#   1. Install locked dependencies
#   2. Repository safety scan
#   3. TypeScript type checking
#   4. Lint
#   5. Production build
#   6. Docker Compose validation
#
# Stops on the first failure. Never prints secrets.
# ============================================================

set -euo pipefail
IFS=$'\n\t'

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

section() {
  echo ""
  echo "========================================"
  echo "  $1"
  echo "========================================"
  echo ""
}

pass() {
  echo -e "  ${GREEN}PASSED${NC} — $1"
}

fail() {
  echo -e "  ${RED}FAILED${NC} — $1"
  exit 1
}

warn() {
  echo -e "  ${YELLOW}SKIPPED${NC} — $1"
}

# ============================================================
# 1. Install locked dependencies
# ============================================================
section "1/13 Install locked dependencies"
npm ci --ignore-scripts
pass "Dependencies installed"

# ============================================================
# 2. Repository safety scan
# ============================================================
section "2/13 Repository safety scan"
node scripts/check-repository-safety.mjs
pass "Repository safety"

# ============================================================
# 3. Security module tests
# ============================================================
section "3/13 Security module tests"
node scripts/test-security.mjs
pass "Security tests"

# ============================================================
# 4. Recovery module tests
# ============================================================
section "4/13 Recovery module tests"
node scripts/test-recovery.mjs
pass "Recovery tests"

# ============================================================
# 5. Evidence retention tests
# ============================================================
section "5/13 Evidence retention tests"
node scripts/test-evidence.mjs
pass "Evidence retention tests"

# ============================================================
# 6. Disaster recovery tests
# ============================================================
section "6/13 Disaster recovery tests"
node scripts/test-disaster-recovery.mjs
pass "Disaster recovery tests"

# ============================================================
# 7. Release governance tests
# ============================================================
section "7/12 Release governance tests"
node scripts/test-release-governance.mjs
pass "Release governance tests"

# ============================================================
# 8. Release webhook dispatch tests
# ============================================================
section "8/12 Release webhook dispatch tests"
node scripts/test-release-webhook.mjs
pass "Release webhook dispatch tests"

# ============================================================
# 9. TypeScript type checking
# ============================================================
section "9/12 TypeScript type checking"
npm run type-check
pass "TypeScript"

# ============================================================
# 10. Lint
# ============================================================
section "10/12 Lint"
npm run lint
pass "Lint"

# ============================================================
# 11. Tests (skip if not configured)
# ============================================================
section "11/12 Tests"
if grep -q '"test"' package.json; then
  npm test
  pass "Tests"
else
  warn "No test script configured — this is not a failure"
fi

# ============================================================
# 12. Production build
# ============================================================
section "12/12 Production build"
npm run build
pass "Production build"

# ============================================================
# 13. Docker Compose validation
# ============================================================
section "13/13 Docker Compose validation"
if command -v docker &> /dev/null && docker compose version &> /dev/null; then
  docker compose -f docker-compose.example.yml config > /dev/null
  pass "Docker Compose"
else
  warn "Docker not available — skipping Compose validation"
fi

# ============================================================
# All clear
# ============================================================
echo ""
echo "========================================"
echo -e "  ${GREEN}ALL CHECKS PASSED${NC}"
echo "========================================"
echo ""
echo "  The project is ready to deploy."
echo ""
echo "  Next steps:"
echo "  1. Push to GitHub:  git push origin main"
echo "  2. On the UAT VM:   git pull && npm run verify:deploy"
echo "  3. Rebuild Docker:  docker compose up -d --build"
echo "  4. Check health:    /staff/uat-agent/local-setup"
echo ""
# DFP UAT Agent — Disaster Recovery Guide

## 1. Backup Architecture

The DFP UAT platform protects these components:

| Component | Backup Method | Frequency | Encrypted |
|-----------|--------------|-----------|-----------|
| Supabase PostgreSQL | `pg_dump --format=custom` | Every 24h | Optional |
| Supabase Storage | Volume / object export | Every 24h | No |
| n8n PostgreSQL | `pg_dump --format=custom` | Every 24h | Optional |
| n8n Encryption Key | File copy + GPG | Every 24h | Yes |
| n8n Workflows | Export files | Every 24h | No |
| Application Config (.env) | File copy + GPG | Every 24h | Yes |
| Docker Compose | File copy | Every 24h | No |
| Supabase Migrations | Git-tracked | On commit | No |
| UAT Reports | Storage backup | Every 24h | No |
| Playwright Config | File copy | Every 24h | No |
| Full System Manifest | Combined archive | Every 7 days | Yes |

## 2. Backup Destinations

Two locations, configurable via `.env`:

```env
UAT_BACKUP_ROOT=/var/backups/dfp-uat        # Local (UAT VM)
UAT_BACKUP_REMOTE_PATH=/mnt/atlas-vault/dfp-uat  # Remote (Atlas Vault)
```

**Rules:**
- The UAT VM must still boot if Atlas Vault is offline
- Backups stage locally, then copy remotely
- A failed remote copy must never delete the local verified backup
- Never mount Atlas Vault as the live application disk

## 3. Running Backups

### Dry Run (preview only)

```bash
bash scripts/backup-uat.sh --dry-run
```

### Full Backup

```bash
bash scripts/backup-uat.sh
```

Creates: `/var/backups/dfp-uat/<timestamp>/` with:
- `supabase-database.dump` + `.sha256`
- `n8n-database.dump` + `.sha256`
- `n8n-key.txt.gpg` (encrypted)
- `config/` (docker-compose, nginx, env.gpg, git-info)
- `manifest.json` + `.sha256`

## 4. Backup Verification

Every backup must be verified — a backup is not valid until verified.

```bash
bash scripts/verify-backup.sh <timestamp>
```

Verification checks:
1. Manifest file exists and is non-empty
2. Manifest checksum matches
3. All files exist and are non-empty
4. File SHA-256 checksums match
5. Database dumps can be inspected with `pg_restore -l`
6. n8n encryption key backup is present
7. Configuration files exist
8. Remote copy exists (if configured)

## 5. Restore Testing

Restore tests run in isolated temporary Docker environments. Live services are NEVER targeted.

### Prerequisites

```bash
# Set this to allow restore tests
export UAT_RESTORE_TEST_ALLOWED=true
```

### Run a Restore Test

```bash
bash scripts/restore-test.sh <timestamp>
```

### What Happens

1. Creates isolated Docker network (`uat-restore-test-NNNN`)
2. Starts temporary PostgreSQL container
3. Restores database dump
4. Verifies RLS is enabled on tables
5. Validates configuration files
6. Checks n8n encryption key presence
7. Tears down all temporary containers and networks

### Restore Test Pass Criteria

- Supabase database restores successfully with tables present
- RLS remains enabled
- Configuration files are complete
- n8n encryption key is available

## 6. RPO and RTO

| Target | Default | Config |
|--------|---------|--------|
| RPO (Recovery Point Objective) | 24 hours | `UAT_TARGET_RPO_HOURS` |
| RTO (Recovery Time Objective) | 4 hours | `UAT_TARGET_RTO_HOURS` |

**RPO**: Maximum acceptable data loss — measured by age of latest verified backup.
**RTO**: Maximum acceptable recovery time — measured by duration of latest restore test.

## 7. Backup Retention

| Tier | Keep | Config |
|------|------|--------|
| Daily | 7 backups | `UAT_BACKUP_DAILY_RETENTION` |
| Weekly | 4 backups | `UAT_BACKUP_WEEKLY_RETENTION` |
| Monthly | 3 backups | `UAT_BACKUP_MONTHLY_RETENTION` |

**Rules:**
- Never delete the newest verified backup
- Never delete a backup currently used by a restore test
- Never delete a backup under investigation hold
- Keep failed backups long enough for troubleshooting
- Record retention deletions in the audit log

## 8. Backup Encryption

Backups of sensitive components are encrypted with GPG:

```bash
# Generate encryption key (on UAT VM, never commit to Git)
openssl rand -hex 32 > /run/secrets/uat_backup_key
chmod 600 /run/secrets/uat_backup_key
```

**Encrypted components:**
- Application `.env` files
- n8n encryption key
- Full-system archives (when `UAT_BACKUP_ENCRYPTION_ENABLED=true`)

## 9. Disaster Recovery Procedures

### 1. UAT Frontend Failure

```bash
# Rebuild and restart
docker compose -f docker-compose.example.yml up -d --build dfp-uat-frontend
```

### 2. Supabase Database Corruption

```bash
# Find latest verified backup
bash scripts/backup-status.sh

# Restore from backup
pg_restore --clean --if-exists -d "$SUPABASE_DB_URL" /var/backups/dfp-uat/<timestamp>/supabase-database.dump
```

### 3. Supabase Storage Loss

Re-upload evidence from the latest storage backup using the manifest's file list.

### 4. n8n Database Loss

```bash
# Restore n8n database
pg_restore --clean --if-exists -d "$N8N_DB_URL" /var/backups/dfp-uat/<timestamp>/n8n-database.dump

# Restore encryption key
# Decrypt and place at the configured N8N_ENCRYPTION_KEY location
# Restart n8n
```

### 5. Lost n8n Encryption Key

Without the encryption key, encrypted n8n credentials cannot be decrypted. The key is backed up with every backup run. Restore from the latest backup.

### 6. UAT VM Failure

1. Create replacement Ubuntu VM
2. Install Docker and Docker Compose
3. Pull the approved Git commit
4. Restore private configuration from backup
5. Restore Supabase database
6. Restore Supabase Storage
7. Restore n8n database
8. Restore matching n8n encryption key
9. Start services
10. Run migrations only when required
11. Run health checks
12. Run reconciliation
13. Review interrupted runs
14. Run a smoke test
15. Return service to staff

### 7. Atlas Vault Unavailable

- UAT VM continues to operate normally
- Local backups continue
- Alert staff about remote copy unavailability
- Sync when Atlas Vault returns

### 8. Failed Deployment Rollback

```bash
git checkout <previous-working-commit>
npm ci --ignore-scripts
npm run build
docker compose -f docker-compose.example.yml up -d --build
```

### 9. Accidental Evidence Deletion

Evidence files are in Supabase Storage private buckets. Restore from the latest Storage backup.

### 10. Complete Rebuild on Replacement VM

See procedure 6 above. The full rebuild procedure is documented in the backup manifest's git-info.txt which captures the exact commit SHA.

## 10. Checking Backup Status

```bash
bash scripts/backup-status.sh
```

Shows:
- Local backup count, size, and latest timestamp
- Remote backup count and availability
- Verified backup count
- Disk usage and Docker disk usage

## 11. Scheduling Backups

Use n8n, systemd timers, or cron. Do not schedule the same backup in multiple systems.

### Cron Example

```cron
# Daily database backup at 2am
0 2 * * * cd /opt/dfp-uat/app-stack && bash scripts/backup-uat.sh
```

### Prevent Overlap

The backup script and the server module both support locking. A running backup blocks another.

## 12. Recovery Readiness Report

The Local Setup page (`/staff/uat-agent/local-setup` → "Backup and Disaster Recovery") shows:

- Overall recovery readiness status
- Per-component readiness
- Latest backup timestamps
- RPO/RTO status
- Missing components
- Failed verifications
- Storage availability (local + remote)
- Recommended actions

## 13. Alerting

**Warning alerts** (via deduplicated notification system):

| Condition | Threshold |
|-----------|-----------|
| Backup older than warning | 30 hours (`UAT_BACKUP_WARNING_AFTER_HOURS`) |
| Remote copy failed | On detection |
| Restore test overdue | 30 days (`UAT_RESTORE_TEST_INTERVAL_DAYS`) |
| One backup location unavailable | On detection |

**Critical alerts:**

| Condition | Threshold |
|-----------|-----------|
| No verified database backup | Immediate |
| No n8n encryption-key backup | Immediate |
| Backup older than critical | 48 hours (`UAT_BACKUP_CRITICAL_AFTER_HOURS`) |
| Restore test failed | Immediate |
| Backup encryption failed | Immediate |
| Both local and remote unavailable | Immediate |

## 14. Diagnosing Backup Failures

### Empty Backup File

Check the source is accessible and credentials are valid. A zero-byte file is never treated as successful.

### Checksum Failure

Indicates file corruption during transfer or storage. Re-run the backup. If persistent, check disk health:

```bash
df -h
docker system df
```

### Remote Copy Failure

Verify Atlas Vault is mounted:

```bash
mountpoint /mnt/atlas-vault/dfp-uat
```

### Verification Failure

Review the verification output for specific component failures. Common causes:
- `pg_restore` unable to read dump (check PostgreSQL version compatibility)
- Config files missing (check paths)
- Manifest doesn't match files (re-run backup)

## 15. Handling a Suspected Secret Leak

1. Immediately rotate all affected secrets
2. Generate new values: `openssl rand -hex 32`
3. Update UAT VM `.env` with new values
4. Restart all services
5. Review audit logs for unauthorized access
6. Document the incident

## 16. Configuration Reference

```env
# Backup storage
UAT_BACKUP_ROOT=/var/backups/dfp-uat
UAT_BACKUP_REMOTE_PATH=/mnt/atlas-vault/dfp-uat
UAT_BACKUP_ENCRYPTION_ENABLED=true
UAT_BACKUP_ENCRYPTION_KEY_FILE=/run/secrets/uat_backup_key

# Backup schedule
UAT_DATABASE_BACKUP_INTERVAL_HOURS=24
UAT_STORAGE_BACKUP_INTERVAL_HOURS=24
UAT_CONFIG_BACKUP_INTERVAL_HOURS=24
UAT_FULL_BACKUP_INTERVAL_DAYS=7

# Retention
UAT_BACKUP_DAILY_RETENTION=7
UAT_BACKUP_WEEKLY_RETENTION=4
UAT_BACKUP_MONTHLY_RETENTION=3

# Verification
UAT_BACKUP_VERIFY_ENABLED=true
UAT_BACKUP_VERIFY_CHECKSUM=true
UAT_BACKUP_VERIFY_ARCHIVE=true
UAT_RESTORE_TEST_INTERVAL_DAYS=30

# Alerts
UAT_BACKUP_WARNING_AFTER_HOURS=30
UAT_BACKUP_CRITICAL_AFTER_HOURS=48

# RPO/RTO targets
UAT_TARGET_RPO_HOURS=24
UAT_TARGET_RTO_HOURS=4
```

## 17. Verification Commands

```bash
# Run all disaster recovery tests
node scripts/test-disaster-recovery.mjs

# Full pre-deploy verification
npm run verify:deploy
```
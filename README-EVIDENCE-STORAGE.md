# DFP UAT Agent — Evidence Storage Guide

## 1. Evidence Buckets (Private Only)

All buckets use Supabase Storage with RLS. No bucket is public — signed URLs are used for temporary access.

| Bucket | Contents |
|--------|----------|
| `uat-evidence` | Screenshots, visual diffs, console logs, network logs |
| `uat-reports` | Generated UAT reports, accessibility reports |
| `uat-traces` | Playwright trace archives |

---

## 2. Storage Path Structure

```
{project-id}/
  {run-id}/
    {journey-result-id}/
      screenshots/    ← .png, .jpeg, .webp
      visual-diffs/   ← .png
      videos/         ← .webm, .mp4
      traces/         ← .zip archives
      logs/           ← .json, .txt, .html
      reports/        ← .pdf, .json
```

Paths are generated server-side:
- Filenames are UUID-based (no user info, no original filenames)
- Path traversal and unsafe characters are rejected
- Bucket names are never accepted from browser requests

---

## 3. Retention Rules

### Default Retention

| Evidence Type | Success Run | Failed/Interrupted Run |
|--------------|-------------|----------------------|
| Screenshots | 14 days | 90 days |
| Console/Network logs | 14 days | 90 days |
| Videos | 30 days | 30 days |
| Traces | 30 days | 30 days |
| Reports | 365 days | 365 days |
| Temporary files | 24 hours | 24 hours |

### Preservation Rules (Overrides)

Evidence is always preserved when:
- Linked to an open critical/high-severity bug
- Linked to an approved release report
- Staff-pinned
- Under legal hold
- Under investigation hold
- Upload or processing state is uncertain
- Deletion approval is pending
- A scheduled retest requires the evidence

---

## 4. Cleanup Scanner

Runs every 6 hours by default. The scanner:

1. Finds evidence past its retention date
2. Applies all preservation rules
3. Excludes pinned, held, or protected evidence
4. Compares database records with Storage objects
5. Produces a dry-run report
6. Requires approval above 10 GB
7. Rechecks preservation rules before each deletion
8. Preserves database metadata after file deletion

### Cleanup Approval Flow

1. Dry run scans for candidates past retention
2. Preservation rules exclude protected evidence
3. Preview report shows candidates with reasons
4. Cleanup above 10 GB requires explicit approval
5. Deletion rechecks preservation rules before each file
6. Database metadata preserved after file deletion
7. Failed deletions are recorded and retryable

---

## 5. Storage Thresholds

| Level | Threshold | Action |
|-------|-----------|--------|
| Healthy | < 75% | Normal operation |
| Warning | 75-90% | Alert generated, optional video/screenshot capture disabled |
| Critical | > 90% | Emergency mode: new runs blocked, only critical-failure evidence retained |

---

## 6. Emergency Storage Mode

When storage exceeds the critical threshold (90%):

- New full UAT runs are blocked
- Optional video capture is stopped
- Optional success screenshots are stopped
- Failure screenshots and essential logs are retained
- Evidence for critical failures is preserved
- Lightweight smoke tests may still run
- Authorised staff are alerted

---

## 7. Orphan Handling

Three types of orphans are detected:

| Type | Description | Action |
|------|-------------|--------|
| Storage orphan | Object without database record | Review before deletion |
| Record orphan | Database record without Storage object | Mark for cleanup |
| Stuck upload | Upload in `uploading` state > 24h | Mark as `upload_failed` |

Temporary-prefix orphans past retention are safe for automatic deletion.

---

## 8. Temporary Worker Files

The Playwright worker stores temporary files at:

```
/var/lib/dfp-uat-worker/temp
```

Rules:
- Run-specific subdirectories
- Inaccessible from the public web
- Removed after successful upload
- Retained briefly after upload failure
- Scanned by scheduled cleanup
- Never contain unmasked credentials

---

## 9. Failed Deletion Recovery

If Storage deletion fails:
- Evidence marked `deletion_failed`
- Database record retained (metadata preserved)
- Safe error code recorded
- Retry according to configured limits
- Storage is NOT falsely reported as released

---

## 10. Pinning and Legal Holds

### Pin Evidence
- Available from Local Setup → Evidence Storage → Pin Evidence
- Pinned evidence is preserved for 2 years
- Staff can unpin at any time

### Legal Hold
- Applied via Local Setup → Evidence Storage → Apply Legal Hold
- Held evidence is preserved for 10 years
- Records the reason and who applied it
- Only staff admins can remove a legal hold

---

## 11. Monitoring Atlas Home Disk Use

On the UAT VM:

```bash
# Disk usage
df -h

# Docker disk usage
docker system df

# Docker volumes
docker volume ls

# Large temporary files
du -sh /var/lib/dfp-uat-worker/temp/*

# Supabase Storage bucket size (via Supabase API)
```

---

## 12. Backing Up Supabase Storage

Supabase Storage is not automatically backed up. Manual backup process:

```bash
# Back up Supabase database (includes evidence metadata)
supabase db dump --local --data-only > uat-evidence-backup.sql

# Back up Storage buckets (file-level)
# Use Supabase Storage API or direct filesystem copy on your deployment
```

Note: Database metadata records remain after file deletion, preserving the audit trail. Only the actual Storage objects are deleted.

---

## 13. Upload Validation

Every upload is validated before acceptance:

- Authenticated source
- Expected run and journey
- Evidence type
- MIME type (whitelist only)
- File extension (blocklist for executables)
- File size (per-category limits)
- Storage bucket
- Storage path
- SHA-256 checksum where available

### Allowed MIME Types

| MIME | Category |
|------|----------|
| image/png | Screenshots, visual diffs |
| image/jpeg | Screenshots |
| image/webp | Screenshots |
| video/webm | Videos |
| video/mp4 | Videos |
| application/zip | Traces |
| application/json | Logs, reports |
| text/plain | Logs |
| text/html | Reports |
| application/pdf | Reports |

---

## 14. Checksums

- SHA-256 checksums are calculated for uploaded evidence
- Used to detect duplicate uploads (same checksum + same run + same category)
- Used to verify successful transfers
- Used to detect corrupted files
- NOT used to compare evidence across projects

---

## 15. Verification Commands

```bash
# Run evidence retention tests
node scripts/test-evidence.mjs

# Run recovery tests
node scripts/test-recovery.mjs

# Run security tests
node scripts/test-security.mjs

# Check repository safety
node scripts/check-repository-safety.mjs

# Full pre-deploy verification
npm run verify:deploy
```

---

## Configuration Reference

```env
# Retention
UAT_SUCCESS_EVIDENCE_RETENTION_DAYS=14
UAT_FAILED_EVIDENCE_RETENTION_DAYS=90
UAT_TRACE_RETENTION_DAYS=30
UAT_VIDEO_RETENTION_DAYS=30
UAT_REPORT_RETENTION_DAYS=365
UAT_TEMP_FILE_RETENTION_HOURS=24

# Storage limits
UAT_MAX_EVIDENCE_STORAGE_GB=100
UAT_STORAGE_WARNING_PERCENT=75
UAT_STORAGE_CRITICAL_PERCENT=90
UAT_MAX_SCREENSHOT_MB=10
UAT_MAX_VIDEO_MB=250
UAT_MAX_TRACE_MB=250
UAT_MAX_REPORT_MB=25

# Cleanup
UAT_CLEANUP_ENABLED=true
UAT_CLEANUP_BATCH_SIZE=100
UAT_CLEANUP_SCAN_INTERVAL_HOURS=6
UAT_CLEANUP_GRACE_PERIOD_HOURS=24
UAT_CLEANUP_DRY_RUN_DEFAULT=true

# Safety
UAT_REQUIRE_CLEANUP_APPROVAL_ABOVE_GB=10
UAT_PRESERVE_OPEN_BUG_EVIDENCE=true
UAT_PRESERVE_APPROVED_RELEASE_EVIDENCE=true
```
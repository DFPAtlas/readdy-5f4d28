# DFP AI UAT Agent Control Centre

## 1. Project Description
Staff command-centre interface for Digital Footprint's automated user-acceptance testing. Used by QA engineers and release managers to start, monitor, and review browser-based UAT runs controlled by n8n workflows and Playwright browser workers. The interface provides real-time test monitoring, evidence review, bug tracking, visual baseline comparison, and release readiness assessment.

Target users: QA staff, release managers, developers who need to verify website releases through automated browser testing.

## 2. Page Structure
- `/` - DFP Home / Dashboard
- `/staff` - Staff Dashboard (protected)
- `/staff/uat-agent` - UAT Agent Control Centre
- `/staff/uat-agent/local-setup` - Local Server Setup & Supabase Status
- `*` - 404 Not Found

## 3. Core Features
- [x] Staff layout with sidebar navigation and auth guard
- [x] UAT Agent page with 7 tabs (Overview, Test Plans, Test Runs, Bugs, Evidence, Visual Baselines, Settings)
- [x] Start New Test wizard (4-step modal)
- [x] Active run monitoring with live timeline and browser preview
- [x] Agent team status panel
- [x] Release readiness assessment
- [x] Test plan management with structured journey builder
- [x] Test run detail view with results, evidence, and agent outputs
- [x] Bug tracking with detail drawer
- [x] Evidence gallery with filtering
- [x] Visual baseline comparison
- [x] Settings management
- [x] Mock data service layer
- [x] API service layer ready for n8n endpoints
- [x] Environment configuration with typed validation
- [x] Service registry and health check system
- [x] Local API proxy (Vite dev + nginx production)
- [x] Connection indicators with live health data
- [x] Local Server Setup page
- [x] Docker support (Dockerfile, docker-compose.example.yml, nginx.conf)
- [x] Git safety (.gitignore, .dockerignore)
- [x] Structured logging and error handling
- [x] URL safety validation
- [x] Mock mode control via environment variables
- [x] Local Supabase connection with environment config
- [x] Supabase client modules (browser, server, admin)
- [x] Database migrations (13 tables with RLS)
- [x] Supabase database service layer (typed repositories)
- [x] Supabase health checks (API, DB, Auth, Storage, Realtime)
- [x] Realtime subscriptions with polling fallback
- [x] Private storage buckets (evidence, reports, traces)
- [x] Supabase setup documentation (README-LOCAL-SUPABASE.md)
- [x] Atlas-HaL Ollama connection (server-side proxy only)
- [x] AI provider abstraction (ollama / openai-compatible / disabled)
- [x] Ollama service (health, tags, generate, chat)
- [x] 7 AI prompt templates (UAT Controller, Functional Tester, UX Reviewer, Accessibility Reviewer, Security Reviewer, Bug Triage, Release Readiness)
- [x] AI health status in dashboard header (Connected, Loading Model, Degraded, Offline, Model Missing, Not Configured)
- [x] Atlas-HaL AI section on Local Setup page
- [x] Ollama AI config in Settings tab
- [x] Docker/nGINX Ollama proxy configuration
- [x] GitHub build gate (.github/workflows/uat-verify.yml)
- [x] Repository safety scanner (scripts/check-repository-safety.mjs)
- [x] Local verification script (scripts/verify-before-deploy.sh)
- [x] Gitleaks secret scanning
- [x] HMAC-SHA256 request signing for internal services
- [x] Idempotency management with replay protection
- [x] Safe header redaction and logging
- [x] Run state machine with approved transition validation
- [x] Webhook receipts migration (uat_webhook_receipts table)
- [x] Internal Request Security section on Local Setup page
- [x] Automated security tests (scripts/test-security.mjs)
- [x] Server-only variable scanner in repository safety check
- [x] Secret rotation support (current + previous)
- [x] Security documentation (README-SECURITY.md)
- [x] Worker heartbeat system with signed authentication
- [x] Execution leases for single-worker run control
- [x] Stale-run detection and classification (healthy/delayed/stale/interrupted)
- [x] Recovery scanner with idempotent scan execution
- [x] Safe checkpoint system for journey recovery
- [x] Step safety classification (safe_to_repeat through never_repeat_automatically)
- [x] Retry policy with exponential backoff and infrastructure/deterministic distinction
- [x] AI-only retry (no browser rerun when AI fails)
- [x] Cancellation orchestration with lease release
- [x] Emergency stop with execution pause flag
- [x] Worker and n8n startup reconciliation
- [x] Recovery events audit log (uat_recovery_events table)
- [x] Worker heartbeat store (uat_worker_heartbeats table)
- [x] Notification alert deduplication with cooldown
- [x] Recovery and Worker Status UI on Local Setup page
- [x] Recovery test suite (scripts/test-recovery.mjs)
- [x] Recovery documentation (README-RECOVERY.md)
- [x] 15-state run state machine with full transition map
- [x] Evidence retention calculation with category-based expiry
- [x] Storage monitoring with warning/critical thresholds
- [x] Cleanup scanner with dry-run mode and approval gating
- [x] Preservation rules (open bugs, approved releases, pinned, legal hold)
- [x] Upload validation with MIME whitelist, size limits, path sanitisation
- [x] SHA-256 checksum support for duplicate detection
- [x] Orphan detection (storage, record, stuck uploads)
- [x] Emergency storage mode when critical threshold reached
- [x] Cleanup audit events and alert deduplication
- [x] Evidence Storage UI on Local Setup page
- [x] Evidence retention test suite (scripts/test-evidence.mjs)
- [x] Evidence storage documentation (README-EVIDENCE-STORAGE.md)
- [x] Backup verification with SHA-256 checksums and archive inspection
- [x] Remote backup copy to Atlas Vault with independent verification
- [x] Restore testing in isolated Docker environments (never targets live services)
- [x] RPO/RTO target tracking with configurable thresholds
- [x] Backup retention policy (daily/weekly/monthly) preserving newest verified
- [x] Backup manifest generation with git SHA, versions, file list, checksums
- [x] Backup encryption via GPG for sensitive components
- [x] Stale backup and missed schedule detection
- [x] Backup hold mechanism (investigation/legal hold)
- [x] Disaster recovery readiness assessment (per-component + overall)
- [x] Recovery readiness report generation
- [x] 4 new DB tables (uat_backup_runs, uat_backup_items, uat_restore_tests, uat_disaster_recovery_status)
- [x] 4 shell scripts (backup-uat.sh, verify-backup.sh, restore-test.sh, backup-status.sh)
- [x] Backup and Disaster Recovery UI on Local Setup page
- [x] Disaster recovery test suite (scripts/test-disaster-recovery.mjs)
- [x] Complete disaster recovery runbook (README-DISASTER-RECOVERY.md)
- [x] 16-state release governance with human-approval gate
- [x] AI recommendation restriction (AI can never set approved_for_release)
- [x] 14 server-side gate checks (blocking + warning classification)
- [x] Build locking (approval locks to exact build reference and Git SHA)
- [x] Separation of duties (creator cannot approve, second approver for high risk)
- [x] Risk acceptance with expiry, justification, and mitigation tracking
- [x] Approval expiry (72-hour default) and new-build invalidation
- [x] Sign-off report generation with checksums
- [x] Approval and rejection dialogs with confirmation checkboxes
- [x] Release Approval tab on UAT dashboard
- [x] Release Review page with gate check enumeration
- [x] Release Governance UI on Local Setup page
- [x] 4 new DB tables (uat_release_candidates, uat_release_approvals, uat_risk_acceptances, uat_release_gate_checks)
- [x] Release governance test suite (20 test groups)
- [x] Signed release webhook dispatch engine (release-webhook.server.ts)
- [x] HMAC-SHA256 signed webhook payloads for deployment notification
- [x] Retry with exponential backoff (3 retries, 5s base)
- [x] Webhook failure isolation (never invalidates approval)
- [x] Webhook delivery status tracking (7 states: pending → delivered/acknowledged or max_retries_exceeded)
- [x] Webhook column in ReleaseApprovalTab with clickable delivery details
- [x] Deployment Webhook section in release review page
- [x] Release webhook test suite (12 test groups)

## 4. Data Model Design
Supabase database with 26 tables, all with Row Level Security enabled:

### Table: uat_projects
Test project definitions with approved base URLs and safety policies.

### Table: uat_test_plans
Test plans referencing projects, with test mode and retry settings.

### Table: uat_test_journeys
Ordered journey definitions within test plans.

### Table: uat_journey_steps
Individual test steps with selector strategies and expected results.

### Table: uat_test_runs
Complete test run records with status, progress, and result totals.

### Table: uat_journey_results
Per-journey results within a test run.

### Table: uat_agent_findings
Structured findings from AI agents (no hidden reasoning stored).

### Table: uat_bug_reports
Bug reports with stable fingerprints, severity, and status.

### Table: uat_bug_occurrences
Individual bug detections linked to runs.

### Table: uat_bug_evidence
Storage metadata for evidence files (files stored in private buckets).

### Table: uat_visual_baselines
Approved visual baselines for screenshot comparison.

### Table: uat_settings
Key-value settings store.

### Table: uat_audit_log
Immutable audit trail for all significant actions.

### Table: uat_disaster_recovery_status
Per-component disaster recovery readiness tracking.

### Table: uat_release_candidates
Release candidate records with build reference, Git SHA, bug counts, AI recommendation, and 16-state status.

### Table: uat_release_approvals
Human approval decisions locked to exact build and Git SHA with expiry and withdrawal support.

### Table: uat_risk_acceptances
Risk acceptance records for high-severity bugs with justification, mitigation plan, expiry, and second-approver tracking.

### Table: uat_release_gate_checks
Server-side gate check evaluations (14 checks) with blocking/warning classification.

## 5. Backend / Third-party Integration Plan
- n8n API gateway: Webhook integration with HMAC-SHA256 signing for test run orchestration
- Playwright browser worker: Browser automation with Bearer + HMAC-SHA256 dual authentication
- Supabase: Persistent storage, authentication, realtime updates, evidence storage
- Ollama / OpenAI: AI-assisted test review (optional, server-side proxy)
- Docker: Containerised local deployment

## 6. Development Phase Plan

### Phase 1: UAT Agent Control Centre (Complete)
- Goal: Complete staff interface with all tabs, mock data, and service layer
- Deliverable: Fully functional UAT Agent page with all features

### Phase 2: Local Server Deployment Readiness (Complete)
- Goal: Prepare project for local deployment on Digital Footprint servers
- Deliverables: Environment config, service registry, health checks, local setup page, Docker support, deployment docs

### Phase 3: Local Supabase Connection (Complete)
- Goal: Connect to locally hosted Supabase for persistent data
- Deliverables: Supabase clients, 13-table migration with RLS, private storage, health checks, database service layer, Supabase docs

### Phase 4: Atlas-HaL Ollama Connection (Complete)
- Goal: Connect server-side AI services to Ollama on Atlas-HaL (192.168.1.92:11434)
- Deliverables: AI config module, Ollama service with chat/generate, 7 prompt templates, health integration, Atlas-HaL UI on Local Setup, Settings, and dashboard indicators, docker/nginx proxy, documentation

### Phase 5: Signed Webhook Authentication (Complete)
- Goal: Secure all internal communication with HMAC-SHA256 signing, idempotency, and replay protection
- Deliverables: Request signing module, idempotency management, safe headers, run state machine, webhook receipts migration, security tests, repository safety scanner extension, security documentation, Internal Request Security UI

### Phase 6: Stale Run Recovery and Worker Heartbeats (Complete)
- Goal: Add reliable recovery handling for interrupted tests with heartbeats, leases, safe checkpoints
- Deliverables: Recovery module, heartbeat system, lease management, stale-run detection, checkpoint support, retry engine, cancellation orchestrator, emergency stop, 2 new DB tables, 15-state machine, recovery test suite, Recovery and Worker Status UI, README-RECOVERY.md

### Phase 7: Evidence Retention, Storage Limits and Safe Cleanup (Complete)
- Goal: Prevent screenshots, videos, traces, logs and reports from filling the UAT VM or local Supabase Storage
- Deliverables: Evidence retention module, storage monitoring, cleanup scanner, upload validation, path generation, orphan detection, emergency storage mode, migration extending uat_bug_evidence + 2 new tables (uat_evidence_cleanup_runs, uat_evidence_cleanup_items), evidence test suite, Evidence Storage UI, README-EVIDENCE-STORAGE.md

### Phase 8: Backup Verification and Disaster Recovery (Complete)
- Goal: Add backup verification, restore testing and disaster-recovery readiness
- Deliverables: Disaster recovery module, backup management with state transitions, manifest generation, SHA-256 checksum verification, remote copy tracking, restore testing in isolated Docker, RPO/RTO calculation, retention policy, backup hold, stale detection, recovery readiness assessment, 4 new DB tables (uat_backup_runs, uat_backup_items, uat_restore_tests, uat_disaster_recovery_status), 4 shell scripts, Backup and Disaster Recovery UI, disaster recovery test suite, README-DISASTER-RECOVERY.md runbook

### Phase 9: Human Release Approval and Risk Acceptance (Complete)
- Goal: Add formal human release-approval gate ensuring AI/n8n/Playwright can never approve production releases
- Deliverables: Release governance module with 16-state transition map, 14 gate check evaluator, approval engine with build locking, risk acceptance validation, AI output restriction, separation of duties enforcement, sign-off report generator, 4 new DB tables (uat_release_candidates, uat_release_approvals, uat_risk_acceptances, uat_release_gate_checks), Release Approval tab on dashboard, Release Review page with approval/rejection dialogs, Release Governance UI on Local Setup page, release governance test suite (20 test groups)

### Phase 10: Release Webhook Dispatch (Complete)
- Goal: Wire up signed webhook to notify deployment systems when a release is approved
- Deliverables: Release webhook dispatch engine (release-webhook.server.ts) with HMAC-SHA256 signing integration, payload construction (never includes credentials), retry with exponential backoff, idempotency key generation, delivery record tracking, safe endpoint URL redaction, response truncation, fireReleaseApprovedWebhook/fireReleaseRejectedWebhook integration points, completeApprovalWithWebhook orchestrator (webhook failure never invalidates approval), webhook dispatch types (7 delivery statuses, 4 event types, error codes, audit events), webhook column in ReleaseApprovalTab with clickable status indicators + delivery details dialog, Deployment Webhook section in release review page, webhook env vars, release webhook test suite (12 test groups)
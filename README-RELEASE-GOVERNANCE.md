# DFP UAT Agent — Release Governance

## Overview

The release governance system ensures that AI agents, n8n, and Playwright may **recommend** release readiness but can **never approve** a production release themselves. Only authorised DFP staff may approve.

## Architecture

```
AI Recommendation (advisory only)
        ↓
  Gate Check Evaluation (server-side, 14 checks)
        ↓
  Human Review & Decision
        ↓
  Approval Locked to Build + Git SHA
        ↓
  Sign-Off Report Generated
```

## Release States (16)

| State | Description |
|-------|-------------|
| `draft` | Initial state, not yet submitted for testing |
| `testing` | Test run in progress |
| `review_required` | Testing complete, awaiting human review |
| `not_ready` | Gate checks failed — not ready for approval |
| `ready_with_warnings` | All blocking checks passed, warnings present |
| `ready_for_approval` | All checks passed, ready for human decision |
| `approval_pending` | Submitted for approval |
| `approved_for_release` | Human approved |
| `release_rejected` | Human rejected |
| `risk_acceptance_required` | High bugs need risk acceptance before approval |
| `risk_accepted` | Risks accepted, can proceed to approval |
| `approval_expired` | Approval time limit reached |
| `approval_invalidated` | New build or critical change invalidated approval |
| `released` | Deployed to production |
| `release_failed` | Deployment failed |
| `rolled_back` | Release was rolled back |

## Gate Checks (14)

### Blocking (10)
1. Latest test run completed
2. Test run matches build
3. Git SHA matches build
4. Required test plan completed
5. No unresolved critical bugs
6. High bug policy satisfied
7. Required retests completed
8. Security checks passed
9. Production testing permission valid
10. Approval not expired

### Warning (4)
11. Evidence upload complete
12. Backup status acceptable
13. Restore readiness acceptable
14. Playwright fingerprint complete

## AI Restrictions

### AI May Return
- `not_ready`
- `ready_with_warnings`
- `ready_for_human_review`

### AI Can Never Set
- `approved_for_release`
- `risk_accepted`
- `released`

Any AI output containing forbidden terms is sanitised to `not_ready`.

## Human Approval Rules

1. **Authenticated staff** with release-approval permission
2. **Matching build and Git SHA** — approval locks to exact references
3. **Completed gate checks** — all blocking checks must pass
4. **No unresolved critical bugs** — critical bugs always block
5. **Required decision note** — cannot be empty
6. **Warning acknowledgement** — when warnings are present
7. **Separation of duties** — creator cannot be final approver
8. **Confirmation checkbox** — explicit confirmation required

## Separation of Duties

- Release creator cannot be the final approver
- Critical risk acceptance is permanently disabled
- High-risk acceptance requires a second authorised reviewer
- Server-side enforcement (not frontend-only)

## Risk Acceptance

Risk acceptance allows high-severity bugs to not block release when:
- Business justification is provided
- Customer impact is documented
- Mitigation plan exists
- Monitoring plan is in place
- Review date is set
- Acceptance has an expiry
- Second approver approves (for high risk)

Critical risk acceptance is **permanently disabled**.

## Build Locking

Approval locks to:
- Release candidate ID
- Test run ID
- Target build reference
- Git commit SHA
- Application version
- Test plan version
- Browser fingerprint hash

A **new build invalidates the previous approval**.

## Approval Expiry

- Default: 72 hours
- Configurable via `UAT_APPROVAL_EXPIRY_HOURS`
- New commit push invalidates
- Critical/high bug reopen invalidates
- Expired approval moves to `approval_expired`

## Sign-Off Reports

Generated reports include:
- Project and release name
- Build reference and Git SHA
- Test run summary
- Browser and environment fingerprints
- Pass/fail totals
- Open bug totals
- Blocking issues
- Accepted risks
- AI recommendation vs human decision
- Approver names and timestamps
- Report checksum

Reports clearly state: **"AI analysis is advisory. Final approval was made by authorised DFP staff."**

## API Routes

All mutation routes require authentication, server-side permission checks, build validation, and idempotency.

```
POST /api/uat/releases
GET  /api/uat/releases
GET  /api/uat/releases/[releaseId]
POST /api/uat/releases/[releaseId]/evaluate
POST /api/uat/releases/[releaseId]/approve
POST /api/uat/releases/[releaseId]/reject
POST /api/uat/releases/[releaseId]/request-retest
POST /api/uat/releases/[releaseId]/accept-risk
POST /api/uat/releases/[releaseId]/withdraw-approval
GET  /api/uat/releases/[releaseId]/report
```

## Configuration

```env
UAT_REQUIRE_SEPARATE_APPROVER=true
UAT_APPROVAL_EXPIRY_HOURS=72
UAT_REQUIRE_SECOND_APPROVER_FOR_RISK=true
UAT_ALLOW_HIGH_RISK_ACCEPTANCE=true
UAT_ALLOW_CRITICAL_RISK_ACCEPTANCE=false
```

## Audit Events (17)

All decisions are permanently recorded:
`release_candidate_created`, `release_gate_evaluated`, `release_ready_for_review`, `release_approval_requested`, `release_approved`, `release_rejected`, `retest_requested`, `risk_acceptance_requested`, `risk_accepted`, `risk_acceptance_rejected`, `approval_expired`, `approval_invalidated`, `approval_withdrawn`, `release_marked_released`, `release_failed`, `release_rolled_back`, `signoff_report_generated`

## Emergency Approval Withdrawal

Authorised staff may withdraw approval:
1. Navigate to release review page
2. Click "Withdraw Approval"
3. Provide withdrawal reason
4. Approval is marked withdrawn
5. Release moves to `review_required`

## Database Tables

- `uat_release_candidates` — release tracking with build locking
- `uat_release_approvals` — human approval decisions
- `uat_risk_acceptances` — risk exception records
- `uat_release_gate_checks` — server-side gate evaluations

## Running Tests

```bash
node scripts/test-release-governance.mjs
```

20 test groups covering: state transitions, AI restrictions, build locking, separation of duties, gate checks, risk acceptance, idempotency, and audit events.
# DFP AI UAT Agent — Local Deployment Guide

## 1. Prerequisites

* Node.js 22+ and npm 10+
* Git
* Docker and Docker Compose (optional, for containerised deployment)
* Access to your Digital Footprint private LAN

External services needed (can be local or hosted):

* **n8n** — workflow orchestrator (with the DFP UAT workflow imported)
* **Playwright worker** — browser worker for running tests
* **Ollama** (optional) — local AI model for test analysis
* **Supabase** (optional) — persistent storage (can be local stack or hosted project)
* **Reverse proxy** (nginx or Caddy) — for production routing

---

## 2. Clone from GitHub

```bash
git clone YOUR_REPOSITORY_URL
cd YOUR_REPOSITORY_FOLDER
```

Replace `YOUR_REPOSITORY_URL` with the actual GitHub URL (e.g. `git@github.com:digital-footprint/dfp-uat-agent.git`).

---

## 3. Create Local Environment File

```bash
cp .env.example .env.local
```

Edit `.env.local` and configure the variables for your local environment. See the table below for required variables.

**Security**: `.env.local` is gitignored and must never be committed.

### Required Variables

| Variable | Purpose | Example |
|---|---|---|
| `VITE_PUBLIC_APP_NAME` | Application display name | `DFP UAT Agent` |
| `VITE_PUBLIC_APP_URL` | Public URL of the frontend | `http://localhost:3000` |
| `VITE_PUBLIC_DEPLOYMENT_MODE` | One of: `development`, `local`, `staging`, `production` | `local` |
| `VITE_PUBLIC_UAT_API_BASE_URL` | API gateway base URL | `/api/uat` |
| `VITE_PUBLIC_ENABLE_MOCK_UAT` | Enable mock mode for interface development | `false` |

### Server-only Variables (never exposed to browser)

| Variable | Purpose |
|---|---|
| `N8N_INTERNAL_URL` | Internal n8n URL (used by Vite proxy in dev) |
| `N8N_UAT_WEBHOOK_PATH` | n8n webhook path for UAT workflow |
| `N8N_API_TOKEN` | n8n API authentication token |
| `PLAYWRIGHT_WORKER_URL` | Playwright worker base URL |
| `PLAYWRIGHT_WORKER_TOKEN` | Playwright worker auth token |
| `AI_PROVIDER` | `ollama` or `openai` |
| `OLLAMA_BASE_URL` | Ollama server URL |
| `OLLAMA_MODEL` | Model name (e.g. `qwen2.5:14b`) |
| `OPENAI_API_KEY` | OpenAI API key (if using OpenAI) |
| `UAT_ALLOWED_DOMAINS` | Comma-separated list of approved test target domains |
| `UAT_BLOCKED_DOMAINS` | Comma-separated list of blocked domains |

---

## 4. Configure n8n

1. Start n8n on your local server or via Docker.
2. Open the n8n web UI (default: `http://localhost:5678`).
3. Import the DFP UAT workflow JSON file into n8n.
4. Configure the webhook node path to match `N8N_UAT_WEBHOOK_PATH` (default: `/webhook/dfp-uat`).
5. If using authentication, set `N8N_API_TOKEN` in `.env.local`.

---

## 5. Import the UAT n8n Workflow

1. Obtain the `dfp-uat-workflow.json` file (provided separately).
2. In n8n, go to **Workflows** → **Import from File**.
3. Select the JSON file and import.
4. Activate the workflow (toggle the Active switch).
5. Verify the webhook node path matches your configuration.

---

## 6. Configure Playwright Worker

1. Deploy the Playwright worker (separate repository/service).
2. Note the worker URL (e.g. `http://your-server:3100`).
3. Set `PLAYWRIGHT_WORKER_URL` in `.env.local`.
4. If the worker uses token auth, set `PLAYWRIGHT_WORKER_TOKEN`.

---

## 7. Configure Ollama (Optional)

If using local AI for test analysis:

1. Install Ollama on your server.
2. Pull the model: `ollama pull qwen2.5:14b` (or your chosen model).
3. Set `AI_PROVIDER=ollama` and `OLLAMA_BASE_URL` in `.env.local`.
4. Set `OLLAMA_MODEL` to the model name.

To use OpenAI instead:

1. Set `AI_PROVIDER=openai`.
2. Set `OPENAI_API_KEY` (stored server-side only, never in browser).
3. Set `OPENAI_MODEL` (e.g. `gpt-4o`).

---

## Connect to Atlas-HaL Ollama

Atlas-HaL is the local AI server (192.168.1.92:11434) running Ollama with the qwen2.5:14b model. The application connects through the Vite dev proxy or nginx reverse proxy — never directly from the browser.

### Verify connectivity

```bash
ping -c 4 192.168.1.92
curl http://192.168.1.92:11434/api/tags
```

### Test AI generation

```bash
curl -s http://192.168.1.92:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5:14b",
    "prompt": "Reply with exactly: UAT VM connected to Atlas HaL",
    "stream": false
  }'
```

### Firewall requirements

- Atlas-HaL must permit inbound TCP port 11434 from the UAT VM
- UAT VM needs outbound access to 192.168.1.92:11434
- Do NOT expose Ollama to the public internet

## Internal Request Security

All communication between DFP UAT, n8n, and Playwright is authenticated using HMAC-SHA256 request signing.

### Generate secrets on the UAT VM

```bash
openssl rand -hex 32  # UAT_WEBHOOK_SECRET
openssl rand -hex 32  # UAT_CALLBACK_SECRET
openssl rand -hex 32  # PLAYWRIGHT_WORKER_TOKEN
```

Add these to `/opt/dfp-uat/app-stack/.env`. Never commit them to GitHub.

### Secret rotation

1. Copy current values to `_PREVIOUS_SECRET` variables in `.env`
2. Generate new secrets with `openssl rand -hex 32`
3. Set new values as current secrets
4. `docker compose restart`
5. Verify health — remove `_PREVIOUS_SECRET` variables

### Security verification

```bash
node scripts/test-security.mjs
node scripts/check-repository-safety.mjs
npm run verify:deploy
```

## Pre-push Verification

Before pushing to GitHub, run these checks:

```bash
npm run verify
```

This runs TypeScript, lint, and build. The full pre-deploy pipeline runs:

```bash
npm run verify:deploy
```

Which includes: npm ci, repository safety, security tests, TypeScript, lint, build, and Docker Compose validation.

## GitHub Actions Checks

Every push and PR to `main` triggers `uat-verify.yml` which runs:

| Check | Status |
|-------|--------|
| npm ci (locked install) | Required |
| Repository safety scan | Required |
| Security module tests | Required |
| Gitleaks secret scan | Required |
| TypeScript type check | Required |
| Lint | Required |
| Tests (if configured) | Optional |
| Production build | Required |
| Docker Compose validation | Required |
| npm audit (high+) | Required |

## Handling Failed Checks

If the GitHub workflow fails:
1. Click the failing check to view logs
2. Fix the issue locally
3. Run `npm run verify:deploy` to confirm
4. Push the fix

## Committed Secret Response

If a real secret was accidentally committed:
1. Revoke or rotate it immediately on all services
2. Remove it from the source file
3. Replace with an environment variable reference
4. Clean Git history: `git filter-branch` or `BFG Repo-Cleaner`
5. Run `node scripts/check-repository-safety.mjs`
6. Update any dependent services

## Recommended Branch Protection

In GitHub repository Settings → Branches:
- Require a pull request before merging to `main`
- Require the UAT verification workflow to pass
- Block force pushes to `main`
- Block branch deletion
- Require branches to be up to date before merging
- Enable secret scanning (if available on your plan)
- Enable push protection (if available on your plan)
- Enable Dependabot security alerts (if available on your plan)

---

## 8. Configure Supabase (Optional)

Supabase can be:

* A local Supabase stack running on your LAN
* A hosted Supabase project at supabase.com

Set these in `.env.local`:

```
VITE_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
VITE_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only and never exposed to the browser.

---

## 9. Start with npm

### Development

```bash
npm install
npm run dev
```

Opens at `http://localhost:3000`. The Vite dev server proxies `/api/uat/*` to n8n and health endpoints to their respective services.

---

## 10. Start with Docker Compose

```bash
cp docker-compose.example.yml docker-compose.yml
# Edit docker-compose.yml with your configuration
docker compose up -d --build
```

This builds the frontend and starts the full stack (frontend, n8n, Playwright worker, Ollama).

To stop:

```bash
docker compose down
```

To rebuild after pulling changes:

```bash
git pull
docker compose up -d --build
```

---

## 11. Run Health Checks

After starting, visit the Local Server Setup page:

```
http://localhost:3000/staff/uat-agent/local-setup
```

Click **Run Health Check** to verify all services. The page shows:

* Each service's status (online/degraded/offline)
* Latency for each service
* Connection test buttons for individual services
* Setup checklist
* Troubleshooting guidance

You can also check the connection indicators in the UAT Agent header on the main page:

```
http://localhost:3000/staff/uat-agent
```

Click any indicator to see detailed service information.

---

## 12. Build for Production

```bash
npm ci
npm run build
```

The built output is in the `out/` directory. Serve it with nginx or any static file server.

For production with nginx, use the included `nginx.conf` as a starting point:

```bash
cp nginx.conf /etc/nginx/sites-available/dfp-uat
# Edit the proxy_pass target in the /api/uat/ location block
nginx -t && nginx -s reload
```

---

## 13. Configure Reverse Proxy

Example nginx configuration for `uat.digital-footprint.local`:

```nginx
server {
    listen 80;
    server_name uat.digital-footprint.local;

    root /path/to/out;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API calls to n8n
    location /api/uat/ {
        proxy_pass http://localhost:5678/webhook/dfp-uat;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

For HTTPS with Caddy:

```caddy
uat.digital-footprint.local {
    root * /path/to/out
    file_server
    try_files {path} /index.html

    handle /api/uat/* {
        reverse_proxy localhost:5678
    }
}
```

**Important**: `uat.digital-footprint.local` is an example hostname. Change it to your actual local network hostname.

---

## 14. Update from GitHub

Safe update procedure:

```text
1. Check current service health at /staff/uat-agent/local-setup
2. Back up local environment files:
   cp .env.local .env.local.backup
3. Pull the selected Git branch:
   git fetch origin
   git checkout main (or your branch)
   git pull origin main
4. Install locked dependencies:
   npm ci
5. Run type checking:
   npm run type-check
6. Run lint checks:
   npm run lint
7. Run the production build:
   npm run build
8. Restart the frontend service (varies by setup):
   - npm: Ctrl+C then npm run dev (or pm2 restart)
   - Docker: docker compose up -d --build
9. Check the health endpoint at /staff/uat-agent/local-setup
10. Run a smoke test: start a small UAT run in mock mode
```

**Critical**: `.env.local` must not be overwritten by `git pull`. It is gitignored, but always verify.

---

## 15. Roll Back to an Earlier Commit

```bash
# View recent commits
git log --oneline -10

# Roll back (replace COMMIT_HASH)
git checkout COMMIT_HASH

# Rebuild
npm ci
npm run build
# Restart the service
```

After rollback, verify health at `/staff/uat-agent/local-setup`.

---

## 16. Troubleshooting

### Frontend shows blank page

* Check browser console for errors.
* Verify `npm run build` completed without errors.
* Ensure the reverse proxy is routing correctly.

### Cannot connect to n8n

* Verify n8n is running: check `docker ps` or the n8n process.
* Confirm `N8N_INTERNAL_URL` in `.env.local` matches the actual n8n address.
* In dev mode, check Vite proxy config in `vite.config.ts`.

### Playwright worker offline

* Verify the Playwright worker container/service is running.
* Check `PLAYWRIGHT_WORKER_URL` configuration.
* Verify the worker's `/health` endpoint responds.

### Ollama model not found

```bash
ollama list          # See installed models
ollama pull qwen2.5:14b  # Pull the model
```

Then restart the health check.

### Build fails

```bash
npm run type-check   # Check for TypeScript errors
npm run lint         # Check for lint errors
npm run build        # Build with verbose output
```

Fix any errors before attempting to deploy.

### Environment validation warnings

The application logs warnings at startup if required environment variables are missing. Check the browser console for messages starting with `[DFP UAT Agent]`.

---

## Environment Variable Reference

See `.env.example` for the complete list of all available environment variables with documentation.

**Key rules**:

* Only `VITE_PUBLIC_*` variables are accessible in browser code.
* Server-only variables (`N8N_API_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, etc.) must never appear in client bundles.
* Mock mode is controlled by `VITE_PUBLIC_ENABLE_MOCK_UAT` and shows a persistent "Demo data" badge when active.
* Production testing is blocked by default (`VITE_PUBLIC_UAT_ALLOW_PRODUCTION_TESTING=false`).
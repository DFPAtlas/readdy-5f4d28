#!/usr/bin/env node

// ============================================================
// DFP UAT Agent — Repository Safety Check
// ============================================================
// Scans Git-tracked files for accidentally committed:
//   - Environment files (.env, .env.production, etc.)
//   - Private key files (.pem, .key, .p12, .pfx)
//   - Credential files (credentials.json, etc.)
//   - Database backup files
//   - Common secret patterns (JWT, Supabase tokens, etc.)
//   - Server-only variables in client-side files
//
// Never prints secret values — only filenames and guidance.
// Exits 1 when serious issues are found.
// ============================================================

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// --- Configuration -------------------------------------------------

const FORBIDDEN_FILE_PATTERNS = [
  { pattern: /\.env$/i,            rule: 'forbidden-env-file',           severity: 'critical' },
  { pattern: /\.env\.local$/i,    rule: 'forbidden-env-local',          severity: 'critical' },
  { pattern: /\.env\.production$/i, rule: 'forbidden-env-production',   severity: 'critical' },
  { pattern: /\.env\.development\.local$/i, rule: 'forbidden-env-dev-local', severity: 'critical' },
  { pattern: /\.env\.test\.local$/i, rule: 'forbidden-env-test-local', severity: 'critical' },
  { pattern: /\.pem$/i,           rule: 'forbidden-pem',               severity: 'critical' },
  { pattern: /\.key$/i,           rule: 'forbidden-key',               severity: 'critical' },
  { pattern: /\.p12$/i,           rule: 'forbidden-p12',               severity: 'critical' },
  { pattern: /\.pfx$/i,           rule: 'forbidden-pfx',               severity: 'critical' },
  { pattern: /credentials\.json$/i,  rule: 'forbidden-credentials-json',   severity: 'critical' },
  { pattern: /service-role-key/i,    rule: 'forbidden-service-role-file',  severity: 'critical' },
  { pattern: /private-key/i,         rule: 'forbidden-private-key-file',   severity: 'critical' },
  { pattern: /database-backup/i,     rule: 'forbidden-db-backup',          severity: 'high' },
];

const ALLOWED_EXAMPLES = [
  '.env.example',
  'credentials.example.json',
  '.gitleaks.toml',
];

const SECRET_CONTENT_PATTERNS = [
  {
    name: 'Supabase service-role token',
    regex: /eyJ[A-Za-z0-9_-]{50,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
    severity: 'critical',
  },
  {
    name: 'PostgreSQL URL with password',
    regex: /postgres(?:ql)?:\/\/[^:@]+:[^@]+@[^/\s"']+/gi,
    severity: 'critical',
    allowed: (match) => match.includes('localhost') || match.includes('127.0.0.1'),
  },
  {
    name: 'OpenAI API key',
    regex: /sk-[A-Za-z0-9_-]{20,}/g,
    severity: 'critical',
  },
  {
    name: 'GitHub personal access token',
    regex: /gh[pousr]_[A-Za-z0-9_]{20,}/g,
    severity: 'critical',
  },
  {
    name: 'Private key block (PEM header)',
    regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
    severity: 'critical',
  },
];

const SERVER_ONLY_VARIABLES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
  'N8N_API_TOKEN',
  'UAT_WEBHOOK_SECRET',
  'UAT_CALLBACK_SECRET',
  'PLAYWRIGHT_WORKER_TOKEN',
  'OPENAI_API_KEY',
  'OLLAMA_BASE_URL',
];

const CLIENT_FILE_INDICATORS = [
  /"use client"/,
  /NEXT_PUBLIC_/,
  /VITE_PUBLIC_/,
  /import\.meta\.env/,
  /window\./,
];

const LEGITIMATE_SERVER_ONLY_FILES = [
  '.env.example',
  'scripts/check-repository-safety.mjs',
  'README-LOCAL-DEPLOYMENT.md',
  'README-LOCAL-SUPABASE.md',
  'README-SECURITY.md',
  'README-N8N-UAT.md',
  'project_plan.md',

  // Vite configuration executes in Node.js and is not bundled
  // into browser-facing application code.
  'vite.config.ts',
];

// --- Helpers -------------------------------------------------------

function getTrackedFiles() {
  const result = execSync('git ls-files --cached --full-name', { encoding: 'utf-8' });
  return result.trim().split('\n').filter(Boolean);
}

function isAllowedExample(filename) {
  return ALLOWED_EXAMPLES.some((allowed) => filename === allowed || filename.endsWith('/' + allowed));
}

function redactSecret(match) {
  if (match.length <= 10) return '***';
  return match.slice(0, 4) + '...' + match.slice(-2);
}

function getScriptKind(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.ts')) return ts.ScriptKind.TS;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.mjs')) return ts.ScriptKind.JS;
  if (file.endsWith('.js')) return ts.ScriptKind.JS;
  return ts.ScriptKind.Unknown;
}

function findServerOnlyVariableReferences(file, content) {
  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(file),
  );

  const configuredVariables = new Set(SERVER_ONLY_VARIABLES);
  const references = new Set();

  function visit(node) {
    // Detect actual identifiers while ignoring variable names that
    // appear only inside comments, labels or troubleshooting text.
    if (ts.isIdentifier(node) && configuredVariables.has(node.text)) {
      references.add(node.text);
    }

    // Also detect computed environment access such as:
    // process.env['UAT_WEBHOOK_SECRET']
    if (
      ts.isElementAccessExpression(node)
      && ts.isStringLiteralLike(node.argumentExpression)
      && configuredVariables.has(node.argumentExpression.text)
    ) {
      const owner = node.expression.getText(sourceFile);

      if (owner === 'process.env' || owner === 'import.meta.env') {
        references.add(node.argumentExpression.text);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...references];
}

// --- Main ----------------------------------------------------------

let issues = 0;
let criticalIssues = 0;

console.log('');
console.log('========================================');
console.log('  Repository Safety Check');
console.log('========================================');
console.log('');

// ----- [1/3] Filename checks -----
console.log('[1/3] Scanning tracked file names...');
const files = getTrackedFiles();

for (const file of files) {
  const filename = file.split('/').pop();

  for (const rule of FORBIDDEN_FILE_PATTERNS) {
    if (rule.pattern.test(filename)) {
      if (isAllowedExample(file)) continue;

      issues++;
      if (rule.severity === 'critical') criticalIssues++;

      const flag = rule.severity === 'critical' ? 'CRITICAL' : 'HIGH';
      console.error(`  [${flag}] ${file} — ${rule.rule}`);
      console.error(`         This file should NOT be committed.`);
      console.error(`         Remove it with: git rm --cached ${file}`);
      console.error(`         Then add it to .gitignore.`);
      console.error('');
      break;
    }
  }
}

if (issues === 0) {
  console.log('  All tracked file names look clean.');
}
console.log('');

// ----- [2/3] Content secret scans -----
console.log('[2/3] Scanning file contents for secret patterns...');
let contentHits = 0;

for (const file of files) {
  if (/\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|lock|toml)$/i.test(file)) continue;
  if (file.startsWith('out/') || file.startsWith('dist/') || file.startsWith('build/')) continue;
  if (file.includes('node_modules/')) continue;
  if (file === 'scripts/check-repository-safety.mjs') continue;

  let content;
  try {
    content = readFileSync(file, 'utf-8');
  } catch {
    continue;
  }

  for (const pattern of SECRET_CONTENT_PATTERNS) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const value = match[0];

      if (pattern.allowed && pattern.allowed(value)) continue;
      if (/replace-with|your-token|change-me|placeholder|example|demo|mock/i.test(value)) continue;

      issues++;
      contentHits++;
      if (pattern.severity === 'critical') criticalIssues++;

      console.error(`  [CRITICAL] ${file} — ${pattern.name}`);
      console.error(`             Redacted: ${redactSecret(value)}`);
      console.error(`             Remove this value and use an environment variable instead.`);
      console.error('');
    }
  }
}

if (contentHits === 0) {
  console.log('  No secret patterns found in file contents.');
}
console.log('');

// ----- [3/3] Server-only variable scanner -----
console.log('[3/3] Scanning for server-only variables in client files...');
let serverVarHits = 0;

for (const file of files) {
  if (!/\.(ts|tsx|js|jsx|mjs)$/i.test(file)) continue;
  if (file.startsWith('out/') || file.startsWith('dist/') || file.startsWith('build/')) continue;
  if (file.includes('node_modules/')) continue;

  const isLegitimate = LEGITIMATE_SERVER_ONLY_FILES.some(
    (legit) => file === legit || file.endsWith('/' + legit)
  );
  if (isLegitimate) continue;

  if (file.includes('.server.') || file.includes('/server/')) continue;
  if (file.startsWith('src/lib/security/')) continue;
  if (file.startsWith('supabase/functions/')) continue;
  if (file.startsWith('scripts/')) continue;
  if (file.includes('/api/')) continue;

  let content;
  try {
    content = readFileSync(file, 'utf-8');
  } catch {
    continue;
  }

  const isClientFile = CLIENT_FILE_INDICATORS.some((pattern) => pattern.test(content));
  if (!isClientFile) continue;

  const variableReferences =
    findServerOnlyVariableReferences(file, content);

  for (const varName of variableReferences) {
    issues++;
    serverVarHits++;
    console.error(
      `  [HIGH] ${file} — server-only variable "${varName}" found in client file`,
    );
    console.error(
      '         This variable should never appear in browser-facing code.',
    );
    console.error(
      '         Remove the reference or move the code to a server-only module.',
    );
    console.error('');
  }
}

if (serverVarHits === 0) {
  console.log('  No server-only variables found in client files.');
}
console.log('');

// ----- Result -----
console.log('========================================');
if (issues === 0) {
  console.log('  RESULT: PASSED — No unsafe files, secrets, or server-only variables found.');
  console.log('========================================');
  process.exit(0);
} else {
  console.error(`  RESULT: FAILED — ${issues} issue(s) found (${criticalIssues} critical).`);
  console.error('');
  console.error('  Fix guidance:');
  console.error('  1. If a real secret was committed, REVOKE/ROTATE it immediately.');
  console.error('  2. Remove it from the source file.');
  console.error('  3. Replace it with an environment variable.');
  console.error('  4. Use git rm --cached to un-track forbidden files.');
  console.error('  5. Run this check again.');
  console.error('========================================');
  process.exit(1);
}
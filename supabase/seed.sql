-- ============================================================
-- DFP UAT Agent — Optional Seed Data
-- ============================================================
-- Run after migrations with: supabase db seed
-- This creates fictional demo data for local development.
-- 
-- ⚠️  No real customer data, credentials, or staff accounts.
-- ============================================================

-- Demo project
INSERT INTO public.uat_projects (id, name, description, approved_base_urls, environment)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'DFP Tester Demo',
  'Digital Footprint tester application for smoke-test validation.',
  ARRAY['https://tester.demo.digitalfootprint.local', 'https://tester.uat.digitalfootprint.local'],
  'demo'
) ON CONFLICT (id) DO NOTHING;

-- Smoke test plan
INSERT INTO public.uat_test_plans (id, project_id, name, description, test_mode)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'DFP Tester Smoke Test',
  'Core smoke tests covering the application wizard and report generation.',
  'smoke'
) ON CONFLICT (id) DO NOTHING;

-- Tester application journey
INSERT INTO public.uat_test_journeys (id, plan_id, name, description, execution_order)
VALUES (
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000010',
  'Complete Application Wizard',
  'Walk through the full tester application wizard from start to submission.',
  1
) ON CONFLICT (id) DO NOTHING;

-- Journey steps
INSERT INTO public.uat_journey_steps (id, journey_id, step_order, step_type, name, selector_strategy, selector_value, expected_result)
VALUES
  ('00000000-0000-0000-0000-000000001000', '00000000-0000-0000-0000-000000000100', 1, 'navigate',           'Open tester home',        'url',          '/',                    'Page loads successfully'),
  ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000100', 2, 'click',              'Start new application',   'css',          '[data-testid="start"]','Application wizard opens'),
  ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000100', 3, 'fill_field',         'Enter applicant name',    'css',          '[name="full_name"]',   'Field accepts input'),
  ('00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000100', 4, 'fill_field',         'Enter email',             'css',          '[name="email"]',       'Field accepts valid email'),
  ('00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000000100', 5, 'click',              'Submit application',      'css',          '[type="submit"]',      'Confirmation page shown'),
  ('00000000-0000-0000-0000-000000001005', '00000000-0000-0000-0000-000000000100', 6, 'assert_text',        'Check confirmation',      'css',          '.confirmation h1',     'Application Submitted')
ON CONFLICT (id) DO NOTHING;

-- Completed demo run
INSERT INTO public.uat_test_runs (
  id, project_id, plan_id, triggered_by, environment, status, test_mode,
  browsers, viewports, start_time, end_time, duration_ms,
  progress, total_steps, passed_count, failed_count, warning_count, blocked_count,
  pass_rate, bugs_found, readiness_score
) VALUES (
  '00000000-0000-0000-0000-000000010000',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'seed-data',
  'demo',
  'completed',
  'smoke',
  ARRAY['chromium'],
  ARRAY['desktop'],
  now() - interval '2 hours',
  now() - interval '1 hour 58 minutes',
  120000,
  100,
  6,
  5,
  0,
  1,
  0,
  83.33,
  0,
  85
) ON CONFLICT (id) DO NOTHING;

-- Journey result
INSERT INTO public.uat_journey_results (
  id, run_id, journey_id, journey_name, browser, viewport, status,
  start_time, end_time, duration_ms, screenshot_count
) VALUES (
  '00000000-0000-0000-0000-000000100000',
  '00000000-0000-0000-0000-000000010000',
  '00000000-0000-0000-0000-000000000100',
  'Complete Application Wizard',
  'chromium',
  'desktop',
  'passed',
  now() - interval '2 hours',
  now() - interval '1 hour 59 minutes',
  58000,
  6
) ON CONFLICT (id) DO NOTHING;

-- Agent findings
INSERT INTO public.uat_agent_findings (id, run_id, journey_result_id, agent_type, category, severity, confidence, title, summary, fingerprint)
VALUES
  ('00000000-0000-0000-0000-000001000001', '00000000-0000-0000-0000-000000010000', '00000000-0000-0000-0000-000000100000', 'functional_tester', 'functional', 'low', 0.92, 'All form fields validated', 'All six form fields accept valid input and reject invalid patterns as expected.', 'fp-func-form-validation-001'),
  ('00000000-0000-0000-0000-000001000002', '00000000-0000-0000-0000-000000010000', '00000000-0000-0000-0000-000000100000', 'ux_visual_reviewer', 'visual', 'medium', 0.78, 'Submit button contrast slightly low', 'The submit button has a contrast ratio of 3.8:1 against the background, below the recommended 4.5:1 for normal text.', 'fp-ux-contrast-submit-001'),
  ('00000000-0000-0000-0000-000001000003', '00000000-0000-0000-0000-000000010000', '00000000-0000-0000-0000-000000100000', 'accessibility_reviewer', 'accessibility', 'high', 0.95, 'Missing aria-label on wizard steps', 'Step indicators in the wizard navigation lack aria-label attributes, making them inaccessible to screen readers.', 'fp-a11y-aria-wizard-001')
ON CONFLICT (id) DO NOTHING;

-- Bug reports
INSERT INTO public.uat_bug_reports (id, fingerprint, title, severity, category, status, expected_result, actual_result, reproduction_steps)
VALUES
  ('00000000-0000-0000-0000-000010000001', 'bug-fp-submit-contrast', 'Submit button contrast ratio below WCAG AA', 'medium', 'visual', 'open', 'Submit button has at least 4.5:1 contrast ratio', 'Measured contrast ratio of 3.8:1 on the primary submit button', ARRAY['Navigate to application wizard', 'Inspect the Submit button element', 'Measure contrast ratio between button text and background']),
  ('00000000-0000-0000-0000-000010000002', 'bug-fp-aria-wizard', 'Wizard step indicators missing accessible labels', 'high', 'accessibility', 'open', 'Each wizard step has an aria-label describing its purpose', 'Step dots in the wizard progress indicator have no accessible name', ARRAY['Open the application wizard', 'Use screen reader or accessibility inspector', 'Navigate to the wizard step indicators', 'Observe that step indicators are announced as "unlabelled"'])
ON CONFLICT (fingerprint) DO NOTHING;

-- Default settings
INSERT INTO public.uat_settings (key, value, description)
VALUES
  ('default_max_pages', '50', 'Default maximum pages per test run'),
  ('default_max_actions', '250', 'Default maximum actions per test run'),
  ('default_timeout_ms', '30000', 'Default request timeout in milliseconds'),
  ('retention_days', '90', 'Number of days to retain test evidence before cleanup'),
  ('production_testing', 'false', 'Whether production environment testing is allowed'),
  ('production_approval_required', 'true', 'Whether production testing requires separate approval'),
  ('mask_sensitive_values', 'true', 'Whether sensitive form values are masked in evidence')
ON CONFLICT (key) DO NOTHING;
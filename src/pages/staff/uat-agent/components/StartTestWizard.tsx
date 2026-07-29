import { useState } from 'react';
import type { UatEnvironment, UatTestMode, UatBrowser, UatViewport, CreateUatRunPayload } from '@/types/uat';
import { createUatRun } from '@/services/uatAgentService';
import { mockSafetyPolicy } from '@/mocks/uatAgentMockData';

interface Props {
  onClose: () => void;
  onRunCreated: (runId: string) => void;
}

const STEPS = [
  { step: 1, label: 'Target', icon: 'ri-crosshair-line' },
  { step: 2, label: 'Coverage', icon: 'ri-layout-grid-line' },
  { step: 3, label: 'Safety', icon: 'ri-shield-check-line' },
  { step: 4, label: 'Review & Start', icon: 'ri-play-circle-line' },
];

export default function StartTestWizard({ onClose, onRunCreated }: Props) {
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productionConfirmed, setProductionConfirmed] = useState(false);
  const [createdRunId, setCreatedRunId] = useState<string | null>(null);

  // Step 1 state
  const [projectId, setProjectId] = useState('proj-dfp-tester');
  const [baseUrl, setBaseUrl] = useState('https://tester.digitalfootprint.ai');
  const [environment, setEnvironment] = useState<UatEnvironment>('uat');
  const [testPlanId, setTestPlanId] = useState('plan-smoke');
  const [releaseRef, setReleaseRef] = useState('');

  // Step 2 state
  const [testMode, setTestMode] = useState<UatTestMode>('journey');
  const [browsers, setBrowsers] = useState<UatBrowser[]>(['chromium']);
  const [viewports, setViewports] = useState<UatViewport[]>(['desktop']);
  const [userRoles, setUserRoles] = useState<string[]>(['qa_engineer']);
  const [journeyIds, setJourneyIds] = useState<string[]>(['journey-login', 'journey-wizard']);
  const [maxPages, setMaxPages] = useState(50);
  const [maxActions, setMaxActions] = useState(500);
  const [includeAccessibility, setIncludeAccessibility] = useState(true);
  const [includeVisual, setIncludeVisual] = useState(true);
  const [includeConsoleNetwork, setIncludeConsoleNetwork] = useState(true);

  // Step 3 state
  const [safetyPolicy, setSafetyPolicy] = useState({ ...mockSafetyPolicy });

  const resetState = () => {
    setCurrentStep(1);
    setError(null);
    setProductionConfirmed(false);
    setCreatedRunId(null);
    setProjectId('proj-dfp-tester');
    setBaseUrl('https://tester.digitalfootprint.ai');
    setEnvironment('uat');
    setTestPlanId('plan-smoke');
    setReleaseRef('');
    setTestMode('journey');
    setBrowsers(['chromium']);
    setViewports(['desktop']);
    setUserRoles(['qa_engineer']);
    setJourneyIds(['journey-login', 'journey-wizard']);
    setMaxPages(50);
    setMaxActions(500);
    setIncludeAccessibility(true);
    setIncludeVisual(true);
    setIncludeConsoleNetwork(true);
    setSafetyPolicy({ ...mockSafetyPolicy });
  };

  const isProduction = environment === 'production';
  const isUrlValid = /^https?:\/\/.+\..+/.test(baseUrl);

  const toggleArrayItem = <T,>(arr: T[], item: T): T[] => {
    return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
  };

  const handleSubmit = async () => {
    if (isProduction && !productionConfirmed) {
      setError('You must confirm production testing before proceeding.');
      return;
    }
    if (!isUrlValid) {
      setError('Please enter a valid URL.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: CreateUatRunPayload = {
        projectId,
        baseUrl,
        environment,
        testPlanId,
        testMode,
        browsers,
        viewports,
        releaseReference: releaseRef || null,
        maxPages,
        maxActions,
        includeAccessibilityScan: includeAccessibility,
        includeVisualComparison: includeVisual,
        includeConsoleNetworkCapture: includeConsoleNetwork,
        userRoles,
        journeyIds,
        safetyPolicy: {
          ...safetyPolicy,
          productionApproved: isProduction ? productionConfirmed : false,
        },
      };

      const run = await createUatRun(payload);
      setCreatedRunId(run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create test run');
      setSubmitting(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => (
        <div key={s.step} className="flex items-center gap-1">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
            currentStep > s.step ? 'bg-green-100 text-green-700' : currentStep === s.step ? 'bg-primary-100 text-primary-700' : 'bg-background-100 text-foreground-600'
          }`}>
            <span className="w-4 h-4 rounded-full flex items-center justify-center text-xs">
              {currentStep > s.step ? (
                <i className="ri-check-line" />
              ) : (
                s.step
              )}
            </span>
            {s.label}
          </div>
          {i < STEPS.length - 1 && <div className="w-4 h-px bg-background-200/70" />}
        </div>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-lg border border-background-200/70 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-background-200/70 z-10">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground-950">Start New Test</h3>
            <button onClick={() => { resetState(); onClose(); }} className="w-7 h-7 flex items-center justify-center rounded hover:bg-background-100 cursor-pointer">
              <i className="ri-close-line" />
            </button>
          </div>
          {renderStepIndicator()}
        </div>

        {/* Body */}
        <div className="p-5">
          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <i className="ri-error-warning-line w-4 h-4 flex items-center justify-center" />
              {error}
            </div>
          )}

          {/* Success state */}
          {createdRunId && (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <i className="ri-check-line text-green-600 text-2xl" />
              </div>
              <h4 className="text-sm font-semibold text-foreground-950 mb-2">Test Run Created</h4>
              <p className="text-xs text-foreground-600 mb-1">Run ID: <span className="font-mono text-foreground-950">{createdRunId}</span></p>
              <p className="text-xs text-foreground-600 mb-4">The test has been queued and will start shortly.</p>
              <button
                onClick={() => { onRunCreated(createdRunId); resetState(); }}
                className="px-4 py-1.5 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-md cursor-pointer whitespace-nowrap"
              >
                View Run
              </button>
            </div>
          )}

          {/* Step 1: Target */}
          {!createdRunId && currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground-700 mb-1">Project</label>
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-background-200/70 rounded-md focus:outline-none focus:border-primary-300 cursor-pointer">
                  <option value="proj-dfp-tester">DFP Tester Application</option>
                  <option value="proj-dfp-portal">DFP Client Portal</option>
                  <option value="proj-dfp-api">DFP API Gateway</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground-700 mb-1">Base URL</label>
                <input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-background-200/70 rounded-md focus:outline-none focus:border-primary-300" />
                {!isUrlValid && baseUrl && <p className="text-xs text-red-600 mt-1">Enter a valid URL (https://...)</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-700 mb-1">Environment</label>
                  <select value={environment} onChange={(e) => setEnvironment(e.target.value as UatEnvironment)} className="w-full px-3 py-1.5 text-sm border border-background-200/70 rounded-md focus:outline-none focus:border-primary-300 cursor-pointer">
                    <option value="demo">Demo</option>
                    <option value="uat">UAT</option>
                    <option value="staging">Staging</option>
                    <option value="production">Production</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-700 mb-1">Test Plan</label>
                  <select value={testPlanId} onChange={(e) => setTestPlanId(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-background-200/70 rounded-md focus:outline-none focus:border-primary-300 cursor-pointer">
                    <option value="plan-smoke">DFP Tester Smoke Suite</option>
                    <option value="plan-release">DFP Tester Release Comparison v2.4</option>
                    <option value="plan-portal">Client Portal Full UAT</option>
                  </select>
                </div>
              </div>

              {isProduction && (
                <div className="p-4 rounded-md bg-red-50 border border-red-200">
                  <div className="flex items-start gap-2">
                    <i className="ri-error-warning-line text-red-600 w-5 h-5 flex items-center justify-center mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-700 mb-1">Production Environment Selected</p>
                      <p className="text-xs text-red-600 mb-3">
                        Running tests in production can affect real users and data. Ensure all safety restrictions are enabled. Production testing must be explicitly approved.
                      </p>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={productionConfirmed}
                          onChange={(e) => setProductionConfirmed(e.target.checked)}
                          className="rounded border-red-300"
                        />
                        <span className="text-xs font-medium text-red-700 whitespace-nowrap">
                          I confirm I want to run tests in Production
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-foreground-700 mb-1">Release/Build Reference (optional)</label>
                <input type="text" value={releaseRef} onChange={(e) => setReleaseRef(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-background-200/70 rounded-md focus:outline-none focus:border-primary-300" placeholder="e.g. v2.4.1-rc3" />
              </div>
            </div>
          )}

          {/* Step 2: Coverage */}
          {!createdRunId && currentStep === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground-700 mb-1">Test Mode</label>
                <select value={testMode} onChange={(e) => setTestMode(e.target.value as UatTestMode)} className="w-full px-3 py-1.5 text-sm border border-background-200/70 rounded-md focus:outline-none focus:border-primary-300 cursor-pointer">
                  <option value="smoke">Smoke</option>
                  <option value="journey">Journey</option>
                  <option value="full_uat">Full UAT</option>
                  <option value="release_comparison">Release Comparison</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground-700 mb-1">Browsers</label>
                <div className="flex flex-wrap gap-2">
                  {(['chromium', 'firefox', 'webkit'] as UatBrowser[]).map((b) => (
                    <label key={b} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer transition-colors ${
                      browsers.includes(b) ? 'bg-primary-100 text-primary-700 border-primary-300' : 'bg-white text-foreground-600 border-background-200/70 hover:bg-background-50'
                    }`}>
                      <input
                        type="checkbox"
                        checked={browsers.includes(b)}
                        onChange={() => setBrowsers(toggleArrayItem(browsers, b))}
                        className="sr-only"
                      />
                      <span className="capitalize whitespace-nowrap">{b}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground-700 mb-1">Viewports</label>
                <div className="flex flex-wrap gap-2">
                  {(['desktop', 'tablet', 'mobile'] as UatViewport[]).map((v) => (
                    <label key={v} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer transition-colors ${
                      viewports.includes(v) ? 'bg-primary-100 text-primary-700 border-primary-300' : 'bg-white text-foreground-600 border-background-200/70 hover:bg-background-50'
                    }`}>
                      <input
                        type="checkbox"
                        checked={viewports.includes(v)}
                        onChange={() => setViewports(toggleArrayItem(viewports, v))}
                        className="sr-only"
                      />
                      <span className="capitalize whitespace-nowrap">{v}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground-700 mb-1">User Roles</label>
                <div className="flex flex-wrap gap-2">
                  {['standard_user', 'qa_engineer', 'billing_admin'].map((r) => (
                    <label key={r} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer transition-colors ${
                      userRoles.includes(r) ? 'bg-primary-100 text-primary-700 border-primary-300' : 'bg-white text-foreground-600 border-background-200/70 hover:bg-background-50'
                    }`}>
                      <input
                        type="checkbox"
                        checked={userRoles.includes(r)}
                        onChange={() => setUserRoles(toggleArrayItem(userRoles, r))}
                        className="sr-only"
                      />
                      <span className="whitespace-nowrap">{r.replace(/_/g, ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground-700 mb-1">Journeys</label>
                <div className="flex flex-wrap gap-2">
                  {['journey-login', 'journey-wizard', 'journey-billing'].map((j) => (
                    <label key={j} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer transition-colors ${
                      journeyIds.includes(j) ? 'bg-primary-100 text-primary-700 border-primary-300' : 'bg-white text-foreground-600 border-background-200/70 hover:bg-background-50'
                    }`}>
                      <input
                        type="checkbox"
                        checked={journeyIds.includes(j)}
                        onChange={() => setJourneyIds(toggleArrayItem(journeyIds, j))}
                        className="sr-only"
                      />
                      <span className="whitespace-nowrap">{j}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-700 mb-1">Max Pages</label>
                  <input type="number" value={maxPages} onChange={(e) => setMaxPages(parseInt(e.target.value) || 50)} className="w-full px-3 py-1.5 text-sm border border-background-200/70 rounded-md" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-700 mb-1">Max Actions</label>
                  <input type="number" value={maxActions} onChange={(e) => setMaxActions(parseInt(e.target.value) || 500)} className="w-full px-3 py-1.5 text-sm border border-background-200/70 rounded-md" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={includeAccessibility} onChange={(e) => setIncludeAccessibility(e.target.checked)} className="rounded border-background-300/60" />
                  <span className="text-xs text-foreground-700 whitespace-nowrap">Include accessibility scan</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={includeVisual} onChange={(e) => setIncludeVisual(e.target.checked)} className="rounded border-background-300/60" />
                  <span className="text-xs text-foreground-700 whitespace-nowrap">Include visual comparison</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={includeConsoleNetwork} onChange={(e) => setIncludeConsoleNetwork(e.target.checked)} className="rounded border-background-300/60" />
                  <span className="text-xs text-foreground-700 whitespace-nowrap">Include console/network capture</span>
                </label>
              </div>
            </div>
          )}

          {/* Step 3: Safety */}
          {!createdRunId && currentStep === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={safetyPolicy.useSyntheticData} onChange={(e) => setSafetyPolicy({ ...safetyPolicy, useSyntheticData: e.target.checked })} className="rounded border-background-300/60" />
                  <span className="text-xs text-foreground-700 whitespace-nowrap">Use synthetic test data</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={safetyPolicy.blockExternalDomains} onChange={(e) => setSafetyPolicy({ ...safetyPolicy, blockExternalDomains: e.target.checked })} className="rounded border-background-300/60" />
                  <span className="text-xs text-foreground-700 whitespace-nowrap">Block external domains</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={safetyPolicy.disableDestructiveActions} onChange={(e) => setSafetyPolicy({ ...safetyPolicy, disableDestructiveActions: e.target.checked })} className="rounded border-background-300/60" />
                  <span className="text-xs text-foreground-700 whitespace-nowrap">Disable destructive actions</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={safetyPolicy.stripeTestModeOnly} onChange={(e) => setSafetyPolicy({ ...safetyPolicy, stripeTestModeOnly: e.target.checked })} className="rounded border-background-300/60" />
                  <span className="text-xs text-foreground-700 whitespace-nowrap">Stripe test mode only</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={safetyPolicy.maskSensitiveData} onChange={(e) => setSafetyPolicy({ ...safetyPolicy, maskSensitiveData: e.target.checked })} className="rounded border-background-300/60" />
                  <span className="text-xs text-foreground-700 whitespace-nowrap">Mask passwords, tokens and personal data</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={safetyPolicy.cleanupAfterRun} onChange={(e) => setSafetyPolicy({ ...safetyPolicy, cleanupAfterRun: e.target.checked })} className="rounded border-background-300/60" />
                  <span className="text-xs text-foreground-700 whitespace-nowrap">Clean up safe test records after run</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-md bg-green-50 border border-green-200">
                  <p className="text-xs font-semibold text-green-700 mb-2">Allowed Actions</p>
                  <ul className="space-y-1">
                    {safetyPolicy.allowedActions.map((a, i) => (
                      <li key={i} className="flex items-start gap-1 text-xs text-green-800">
                        <i className="ri-check-line w-3 h-3 flex items-center justify-center mt-0.5 shrink-0" />
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="p-3 rounded-md bg-red-50 border border-red-200">
                  <p className="text-xs font-semibold text-red-700 mb-2">Blocked Actions</p>
                  <ul className="space-y-1">
                    {safetyPolicy.blockedActions.map((a, i) => (
                      <li key={i} className="flex items-start gap-1 text-xs text-red-800">
                        <i className="ri-forbid-line w-3 h-3 flex items-center justify-center mt-0.5 shrink-0" />
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {!createdRunId && currentStep === 4 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-md bg-background-50">
                  <p className="font-medium text-foreground-700 mb-1">Target</p>
                  <p className="text-foreground-600">Project: {projectId}</p>
                  <p className="text-foreground-600">URL: {baseUrl}</p>
                  <p className="text-foreground-600">Env: <span className="font-semibold uppercase">{environment}</span></p>
                  <p className="text-foreground-600">Plan: {testPlanId}</p>
                </div>
                <div className="p-3 rounded-md bg-background-50">
                  <p className="font-medium text-foreground-700 mb-1">Coverage</p>
                  <p className="text-foreground-600">Mode: {testMode.replace(/_/g, ' ')}</p>
                  <p className="text-foreground-600">Browsers: {browsers.join(', ')}</p>
                  <p className="text-foreground-600">Viewports: {viewports.join(', ')}</p>
                  <p className="text-foreground-600">Journeys: {journeyIds.length}</p>
                </div>
              </div>

              <div className="p-3 rounded-md bg-background-50 text-xs">
                <p className="font-medium text-foreground-700 mb-1">Safety Restrictions</p>
                <p className="text-foreground-600">
                  Synthetic data: {safetyPolicy.useSyntheticData ? 'Yes' : 'No'} ·
                  Block external: {safetyPolicy.blockExternalDomains ? 'Yes' : 'No'} ·
                  Mask sensitive: {safetyPolicy.maskSensitiveData ? 'Yes' : 'No'} ·
                  Cleanup: {safetyPolicy.cleanupAfterRun ? 'Yes' : 'No'}
                </p>
                {isProduction && <p className="text-red-600 font-medium mt-1">Production testing confirmed</p>}
              </div>

              <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-xs">
                <p className="font-medium text-amber-700 mb-1">Estimated Scenarios</p>
                <p className="text-amber-800">
                  Approximately <strong>{journeyIds.length * browsers.length * viewports.length * userRoles.length}</strong> scenarios may be generated across {browsers.length} browser{browsers.length !== 1 ? 's' : ''} and {viewports.length} viewport{viewports.length !== 1 ? 's' : ''}. Actual count depends on journey compatibility.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!createdRunId && (
          <div className="sticky bottom-0 bg-white px-5 py-3 border-t border-background-200/70 flex items-center justify-between z-10">
            <div>
              {currentStep > 1 && (
                <button onClick={() => setCurrentStep(currentStep - 1)} className="px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md border border-background-200/70 cursor-pointer whitespace-nowrap">
                  Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { resetState(); onClose(); }} className="px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md border border-background-200/70 cursor-pointer whitespace-nowrap">
                Cancel
              </button>
              {currentStep < 4 ? (
                <button onClick={() => setCurrentStep(currentStep + 1)} className="px-4 py-1.5 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-md cursor-pointer whitespace-nowrap">
                  Next
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting || (isProduction && !productionConfirmed)}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-md cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  <i className="ri-play-circle-line w-3.5 h-3.5 flex items-center justify-center" />
                  {submitting ? 'Creating...' : 'Start Test'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
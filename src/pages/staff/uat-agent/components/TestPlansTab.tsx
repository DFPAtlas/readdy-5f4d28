import { useState, useEffect } from 'react';
import type {
  UatTestPlan,
  UatJourney,
  UatJourneyStep,
  UatStepType,
  UatEnvironment,
  UatViewport,
  UatBrowser,
} from '@/types/uat';
import { listTestPlans, createTestPlan, updateTestPlan } from '@/services/uatAgentService';
import JourneyBuilder from './JourneyBuilder';

const UAT_ENVIRONMENTS = [
  'demo',
  'uat',
  'staging',
  'production',
] as const satisfies readonly UatEnvironment[];

const UAT_VIEWPORTS = [
  'desktop',
  'tablet',
  'mobile',
] as const satisfies readonly UatViewport[];

const UAT_BROWSERS = [
  'chromium',
  'firefox',
  'webkit',
] as const satisfies readonly UatBrowser[];

interface EditorData {
  name: string;
  projectId: string;
  baseEnvironment: UatEnvironment;
  devices: UatViewport[];
  browsers: UatBrowser[];
  retryCount: number;
  stopOnCritical: boolean;
}

export default function TestPlansTab() {
  const [plans, setPlans] = useState<UatTestPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingPlan, setEditingPlan] = useState<UatTestPlan | null>(null);
  const [editorData, setEditorData] = useState<EditorData>({
    name: '',
    projectId: 'proj-dfp-tester',
    baseEnvironment: 'uat',
    devices: ['desktop'],
    browsers: ['chromium'],
    retryCount: 2,
    stopOnCritical: true,
  });

  const fetchPlans = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTestPlans();
      setPlans(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load test plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPlans(); }, []);

  const handleSavePlan = async () => {
    try {
      if (editingPlan) {
        await updateTestPlan(editingPlan.id, { ...editorData, id: editingPlan.id });
      } else {
        await createTestPlan(editorData as Parameters<typeof createTestPlan>[0]);
      }
      setShowEditor(false);
      setEditingPlan(null);
      fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save test plan');
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse py-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-background-200/70 p-5 h-24" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-red-600 mb-2">{error}</p>
        <button onClick={fetchPlans} className="text-xs font-medium text-primary-600 hover:text-primary-700 cursor-pointer whitespace-nowrap">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-foreground-600">{plans.length} test plan{plans.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => { setEditingPlan(null); setEditorData({ name: '', projectId: 'proj-dfp-tester', baseEnvironment: 'uat', devices: ['desktop'], browsers: ['chromium'], retryCount: 2, stopOnCritical: true }); setShowEditor(true); }}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 cursor-pointer whitespace-nowrap"
        >
          <i className="ri-add-line w-3.5 h-3.5 flex items-center justify-center" />
          New Test Plan
        </button>
      </div>

      {/* Plan cards */}
      {plans.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-background-200/70">
          <div className="w-12 h-12 rounded-full bg-background-100 flex items-center justify-center mx-auto mb-3">
            <i className="ri-file-list-3-line text-foreground-400 text-xl" />
          </div>
          <p className="text-sm text-foreground-950 font-medium mb-1">No test plans yet</p>
          <p className="text-xs text-foreground-600">Create a test plan to define your UAT journeys.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div key={plan.id} className="bg-white rounded-lg border border-background-200/70 p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-foreground-950">{plan.name}</h4>
                  <p className="text-xs text-foreground-600 mt-0.5">{plan.projectName}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
                  plan.enabled ? 'bg-green-100 text-green-700' : 'bg-foreground-100 text-foreground-600'
                }`}>
                  {plan.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-foreground-600 mb-4">
                <div>
                  <span className="text-foreground-500">Environment:</span>
                  <span className="ml-1 font-medium text-foreground-950 uppercase">{plan.baseEnvironment}</span>
                </div>
                <div>
                  <span className="text-foreground-500">Journeys:</span>
                  <span className="ml-1 font-medium text-foreground-950">{plan.journeys.length}</span>
                </div>
                <div>
                  <span className="text-foreground-500">Devices:</span>
                  <span className="ml-1 font-medium text-foreground-950">{plan.devices.join(', ')}</span>
                </div>
                <div>
                  <span className="text-foreground-500">Browsers:</span>
                  <span className="ml-1 font-medium text-foreground-950">{plan.browsers.join(', ')}</span>
                </div>
                {plan.lastPassRate !== null && (
                  <div className="col-span-2">
                    <span className="text-foreground-500">Last pass rate:</span>
                    <span className={`ml-1 font-medium ${plan.lastPassRate >= 80 ? 'text-green-600' : 'text-red-600'}`}>
                      {plan.lastPassRate}%
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button className="px-2.5 py-1 text-xs rounded border border-background-200/70 text-foreground-700 hover:bg-background-100 cursor-pointer whitespace-nowrap">
                  <i className="ri-pencil-line w-3 h-3 flex items-center justify-center" />
                </button>
                <button className="px-2.5 py-1 text-xs rounded border border-background-200/70 text-foreground-700 hover:bg-background-100 cursor-pointer whitespace-nowrap">
                  <i className="ri-file-copy-line w-3 h-3 flex items-center justify-center" />
                </button>
                <button className="px-2.5 py-1 text-xs rounded border border-background-200/70 text-red-600 hover:bg-red-50 cursor-pointer whitespace-nowrap">
                  <i className="ri-archive-line w-3 h-3 flex items-center justify-center" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-lg border border-background-200/70 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-background-200/70 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground-950">
                {editingPlan ? 'Edit Test Plan' : 'New Test Plan'}
              </h3>
              <button onClick={() => setShowEditor(false)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-background-100 cursor-pointer">
                <i className="ri-close-line" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground-700 mb-1">Plan Name</label>
                <input
                  type="text"
                  value={editorData.name}
                  onChange={(e) => setEditorData({ ...editorData, name: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-background-200/70 rounded-md focus:outline-none focus:border-primary-300"
                  placeholder="e.g. DFP Tester Smoke Suite"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-700 mb-1">Project</label>
                  <select
                    value={editorData.projectId}
                    onChange={(e) => setEditorData({ ...editorData, projectId: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-background-200/70 rounded-md focus:outline-none focus:border-primary-300 cursor-pointer"
                  >
                    <option value="proj-dfp-tester">DFP Tester Application</option>
                    <option value="proj-dfp-portal">DFP Client Portal</option>
                    <option value="proj-dfp-api">DFP API Gateway</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-700 mb-1">Environment</label>
                  <select
                    value={editorData.baseEnvironment}
                    onChange={(e) => {
                      const environment = UAT_ENVIRONMENTS.find(
                        (value) => value === e.target.value
                      );

                      if (environment) {
                        setEditorData({
                          ...editorData,
                          baseEnvironment: environment,
                        });
                      }
                    }}
                    className="w-full px-3 py-1.5 text-sm border border-background-200/70 rounded-md focus:outline-none focus:border-primary-300 cursor-pointer"
                  >
                    <option value="demo">Demo</option>
                    <option value="uat">UAT</option>
                    <option value="staging">Staging</option>
                    <option value="production">Production</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground-700 mb-1">Devices</label>
                <div className="flex flex-wrap gap-2">
                  {UAT_VIEWPORTS.map((d) => (
                    <label key={d} className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editorData.devices.includes(d)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditorData({ ...editorData, devices: [...editorData.devices, d] });
                          } else {
                            setEditorData({ ...editorData, devices: editorData.devices.filter((x) => x !== d) });
                          }
                        }}
                        className="rounded border-background-300/60"
                      />
                      <span className="text-xs text-foreground-700 capitalize whitespace-nowrap">{d}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground-700 mb-1">Browsers</label>
                <div className="flex flex-wrap gap-2">
                  {UAT_BROWSERS.map((b) => (
                    <label key={b} className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editorData.browsers.includes(b)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditorData({ ...editorData, browsers: [...editorData.browsers, b] });
                          } else {
                            setEditorData({ ...editorData, browsers: editorData.browsers.filter((x) => x !== b) });
                          }
                        }}
                        className="rounded border-background-300/60"
                      />
                      <span className="text-xs text-foreground-700 capitalize whitespace-nowrap">{b}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-700 mb-1">Retry Count</label>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={editorData.retryCount}
                    onChange={(e) => setEditorData({ ...editorData, retryCount: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 text-sm border border-background-200/70 rounded-md focus:outline-none focus:border-primary-300"
                  />
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editorData.stopOnCritical}
                      onChange={(e) => setEditorData({ ...editorData, stopOnCritical: e.target.checked })}
                      className="rounded border-background-300/60"
                    />
                    <span className="text-xs text-foreground-700 whitespace-nowrap">Stop on critical failure</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-background-200/70 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowEditor(false)}
                className="px-3 py-1.5 text-xs font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 rounded-md border border-background-200/70 cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePlan}
                className="px-4 py-1.5 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-md cursor-pointer whitespace-nowrap"
              >
                Save Test Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
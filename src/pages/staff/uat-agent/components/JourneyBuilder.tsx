import type { UatJourneyStep, UatStepType } from '@/types/uat';

const STEP_TYPES: { value: UatStepType; label: string; icon: string }[] = [
  { value: 'navigate', label: 'Navigate', icon: 'ri-compass-3-line' },
  { value: 'click', label: 'Click', icon: 'ri-cursor-line' },
  { value: 'fill_field', label: 'Fill Field', icon: 'ri-keyboard-line' },
  { value: 'select_option', label: 'Select Option', icon: 'ri-list-check-3' },
  { value: 'upload_file', label: 'Upload File', icon: 'ri-upload-2-line' },
  { value: 'wait_for_element', label: 'Wait for Element', icon: 'ri-time-line' },
  { value: 'assert_text', label: 'Assert Text', icon: 'ri-text' },
  { value: 'assert_url', label: 'Assert URL', icon: 'ri-link' },
  { value: 'assert_element_visible', label: 'Assert Element Visible', icon: 'ri-eye-line' },
  { value: 'assert_api_response', label: 'Assert API Response', icon: 'ri-code-line' },
  { value: 'capture_screenshot', label: 'Capture Screenshot', icon: 'ri-camera-line' },
  { value: 'run_accessibility_scan', label: 'Accessibility Scan', icon: 'ri-shield-check-line' },
];

interface Props {
  steps: UatJourneyStep[];
  onChange: (steps: UatJourneyStep[]) => void;
}

function createEmptyStep(stepNumber: number): UatJourneyStep {
  return {
    id: `step-new-${Date.now()}-${stepNumber}`,
    journeyId: '',
    stepNumber,
    name: '',
    type: 'navigate',
    selectorStrategy: 'css',
    value: '',
    expectedResult: '',
    timeout: 5000,
    retryCount: 1,
    required: true,
    maskValue: false,
  };
}

export default function JourneyBuilder({ steps, onChange }: Props) {
  const addStep = () => {
    onChange([...steps, createEmptyStep(steps.length + 1)]);
  };

  const removeStep = (index: number) => {
    const updated = steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, stepNumber: i + 1 }));
    onChange(updated);
  };

  const updateStep = (index: number, updates: Partial<UatJourneyStep>) => {
    const updated = steps.map((s, i) => (i === index ? { ...s, ...updates } : s));
    onChange(updated);
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= steps.length) return;
    const updated = [...steps];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    onChange(updated.map((s, i) => ({ ...s, stepNumber: i + 1 })));
  };

  const duplicateStep = (index: number) => {
    const step = steps[index];
    const duplicated = { ...step, id: `step-${Date.now()}`, stepNumber: steps.length + 1 };
    onChange([...steps, duplicated]);
  };

  return (
    <div className="space-y-3">
      {steps.map((step, index) => (
        <div key={step.id} className="bg-white rounded-lg border border-background-200/70 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-semibold flex items-center justify-center whitespace-nowrap">
                {step.stepNumber}
              </span>
              <input
                type="text"
                value={step.name}
                onChange={(e) => updateStep(index, { name: e.target.value })}
                className="text-sm font-medium text-foreground-950 bg-transparent border-b border-transparent hover:border-background-300/60 focus:border-primary-300 focus:outline-none"
                placeholder="Step name..."
              />
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => moveStep(index, 'up')}
                disabled={index === 0}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-background-100 cursor-pointer disabled:opacity-30 disabled:cursor-default"
                title="Move up"
              >
                <i className="ri-arrow-up-s-line text-xs" />
              </button>
              <button
                onClick={() => moveStep(index, 'down')}
                disabled={index === steps.length - 1}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-background-100 cursor-pointer disabled:opacity-30 disabled:cursor-default"
                title="Move down"
              >
                <i className="ri-arrow-down-s-line text-xs" />
              </button>
              <button
                onClick={() => duplicateStep(index)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-background-100 cursor-pointer"
                title="Duplicate"
              >
                <i className="ri-file-copy-line text-xs" />
              </button>
              <button
                onClick={() => removeStep(index)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 text-red-500 cursor-pointer"
                title="Delete"
              >
                <i className="ri-delete-bin-line text-xs" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-foreground-600 mb-1">Step Type</label>
              <select
                value={step.type}
                onChange={(e) => updateStep(index, { type: e.target.value as UatStepType })}
                className="w-full px-2.5 py-1.5 text-sm border border-background-200/70 rounded-md focus:outline-none focus:border-primary-300 cursor-pointer"
              >
                {STEP_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-foreground-600 mb-1">
                {['assert_text', 'assert_api_response'].includes(step.type) ? 'Expected Result' : 'Selector / Value'}
              </label>
              <input
                type="text"
                value={step.value}
                onChange={(e) => updateStep(index, { value: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm border border-background-200/70 rounded-md focus:outline-none focus:border-primary-300"
                placeholder="e.g. button[type='submit']"
              />
            </div>
            <div>
              <label className="block text-xs text-foreground-600 mb-1">Timeout (ms)</label>
              <input
                type="number"
                value={step.timeout}
                onChange={(e) => updateStep(index, { timeout: parseInt(e.target.value) || 5000 })}
                className="w-full px-2.5 py-1.5 text-sm border border-background-200/70 rounded-md focus:outline-none focus:border-primary-300"
              />
            </div>
            <div>
              <label className="block text-xs text-foreground-600 mb-1">Retries</label>
              <input
                type="number"
                min={0}
                max={5}
                value={step.retryCount}
                onChange={(e) => updateStep(index, { retryCount: parseInt(e.target.value) || 0 })}
                className="w-full px-2.5 py-1.5 text-sm border border-background-200/70 rounded-md focus:outline-none focus:border-primary-300"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 mt-3">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={step.required}
                onChange={(e) => updateStep(index, { required: e.target.checked })}
                className="rounded border-background-300/60"
              />
              <span className="text-xs text-foreground-600 whitespace-nowrap">Required</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={step.maskValue}
                onChange={(e) => updateStep(index, { maskValue: e.target.checked })}
                className="rounded border-background-300/60"
              />
              <span className="text-xs text-foreground-600 whitespace-nowrap">Mask value</span>
            </label>
          </div>
        </div>
      ))}

      <button
        onClick={addStep}
        className="w-full py-3 rounded-lg border-2 border-dashed border-background-300/60 text-foreground-600 hover:text-foreground-950 hover:border-foreground-400 transition-colors cursor-pointer text-sm font-medium whitespace-nowrap"
      >
        <i className="ri-add-line w-4 h-4 flex items-center justify-center inline mr-1" />
        Add Step
      </button>
    </div>
  );
}
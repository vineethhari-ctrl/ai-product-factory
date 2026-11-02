import React from 'react';
import { AppWindow, Boxes } from 'lucide-react';
import type { DeliveryMode } from '../types';

/** Examples shown as suggestions only; the BA types any platform and the AI works from that name. */
const PLATFORM_SUGGESTIONS = ['SAP S/4HANA', 'SAP SuccessFactors', 'SAP BW/4HANA', 'Oracle Fusion Cloud', 'Microsoft Dynamics 365', 'Salesforce', 'ServiceNow', 'Workday'];

interface Props {
  value?: DeliveryMode;
  onChange: (d: DeliveryMode) => void;
  compact?: boolean;
}

/** What the initiative delivers: a new application, or an implementation of a package platform the business has chosen. */
export const DeliveryPicker: React.FC<Props> = ({ value, onChange, compact }) => {
  const kind = value?.kind ?? 'custom';
  const opt = (k: DeliveryMode['kind'], label: string, hint: string, Icon: typeof Boxes) => (
    <button
      type="button"
      onClick={() => onChange(k === 'package' ? { kind: 'package', platform: value?.platform } : { kind: 'custom' })}
      aria-pressed={kind === k}
      className={`flex-1 text-left rounded-lg border px-3 py-2 transition-all ${kind === k ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-500/20' : 'border-slate-300 bg-white hover:border-slate-400'}`}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-900"><Icon className="w-3.5 h-3.5 text-indigo-600" />{label}</span>
      {!compact && <span className="block text-[11px] text-slate-500 mt-0.5">{hint}</span>}
    </button>
  );
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {opt('custom', 'New application', 'Built for the business: BRD, prototype, test suite, engineering plan.', AppWindow)}
        {opt('package', 'Package implementation', 'A platform the business has chosen: adds a fit-gap and sizes configuration, development and migration.', Boxes)}
      </div>
      {kind === 'package' && (
        <div>
          <input
            type="text"
            list="delivery-platforms"
            value={value?.platform ?? ''}
            onChange={(e) => onChange({ kind: 'package', platform: e.target.value.slice(0, 80) })}
            placeholder="Platform, e.g. SAP S/4HANA, Oracle Fusion, Salesforce"
            aria-label="Platform"
            className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 placeholder:text-slate-400"
          />
          <datalist id="delivery-platforms">{PLATFORM_SUGGESTIONS.map((p) => <option key={p} value={p} />)}</datalist>
        </div>
      )}
    </div>
  );
};

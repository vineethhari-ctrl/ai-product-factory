import React, { useState } from 'react';
import { ActiveScreen, ProductDefinition } from '../types';
import { UsagePanel } from './UsagePanel';
import { 
  Factory, 
  Layers, 
  Cpu, 
  FileCheck, 
  Play, 
  GitPullRequest, 
  Package, 
  CheckCircle2, 
  ChevronRight,
  Sparkles,
  ExternalLink,
  ChevronDown,
  CheckSquare,
  RotateCcw
} from 'lucide-react';

interface HeaderProps {
  activeScreen: ActiveScreen;
  setActiveScreen: (screen: ActiveScreen) => void;
  productName: string;
  businessUnit: string;
  productDefinition: ProductDefinition | null;
  hasUnderstanding: boolean;
  hasDefinitionApproved: boolean;
  hasPrototype: boolean;
  /** Hard-resets ALL pipeline state and returns to Stage 1 */
  onResetAll: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeScreen,
  setActiveScreen,
  productName,
  businessUnit,
  productDefinition,
  hasUnderstanding,
  hasDefinitionApproved,
  hasPrototype,
  onResetAll,
}) => {
  const [showRoadmap, setShowRoadmap] = useState(false);

  const steps: Array<{
    id: ActiveScreen;
    number: number;
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    isEnabled: boolean;
    isDone: boolean;
  }> = [
    {
      id: 'create',
      number: 1,
      title: 'Upload Material',
      icon: Factory,
      isEnabled: true,
      isDone: hasUnderstanding,
    },
    {
      id: 'understanding',
      number: 2,
      title: 'Business Understanding',
      icon: Cpu,
      isEnabled: hasUnderstanding,
      isDone: !!productDefinition,
    },
    {
      id: 'definition',
      number: 3,
      title: 'BRD & Product Spec',
      icon: FileCheck,
      isEnabled: hasUnderstanding,
      isDone: hasDefinitionApproved,
    },
    {
      id: 'prototype',
      number: 4,
      title: 'Interactive Prototype',
      icon: Layers,
      isEnabled: !!productDefinition,
      isDone: hasPrototype,
    },
    {
      id: 'demo',
      number: 5,
      title: 'Service Blueprint',
      icon: Play,
      isEnabled: !!productDefinition,
      isDone: false,
    },
    {
      id: 'changes',
      number: 6,
      title: 'Change Impact',
      icon: GitPullRequest,
      isEnabled: !!productDefinition,
      isDone: false,
    },
    {
      id: 'qasuite',
      number: 7,
      title: 'Use Cases & QA',
      icon: CheckSquare,
      isEnabled: !!productDefinition,
      isDone: false,
    },
    {
      id: 'engineering',
      number: 8,
      title: 'Engineering Package',
      icon: Package,
      isEnabled: !!productDefinition,
      isDone: false,
    },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-2xs">
      {/* Top Bar: Brand & Product Meta */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
            <Factory className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-base tracking-tight">AI Product Factory</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                V0.1 Core
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              Unstructured Material → Business Understanding → Prototype → Engineering Package
            </p>
          </div>
        </div>

        {/* Current Active Product Context */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex flex-col text-right">
            <div className="text-xs font-semibold text-slate-800 truncate max-w-[280px]">
              {productName || 'New Product'}
            </div>
            <div className="text-[11px] text-slate-500">
              {businessUnit || 'Enterprise Unit'} •{' '}
              <span className="font-mono text-indigo-600 font-medium">
                {productDefinition?.version || 'v1.0 Draft'}
              </span>
            </div>
          </div>

          <UsagePanel />

          {/* New Initiative reset — always visible */}
          <button
            onClick={onResetAll}
            title="Reset all state and start a new product initiative"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rose-200 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Initiative</span>
          </button>

          {/* Future Modules Menu */}
          <div className="relative">
            <button
              onClick={() => setShowRoadmap(!showRoadmap)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span className="hidden sm:inline">Future Modules</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showRoadmap && (
              <div 
                className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-3 z-50 animate-in fade-in"
                onMouseLeave={() => setShowRoadmap(false)}
              >
                <div className="text-xs font-semibold text-slate-800 pb-1.5 border-b border-slate-100 mb-2">
                  Extensible Architecture Roadmap
                </div>
                <ul className="space-y-1.5 text-xs text-slate-600">
                  <li className="flex items-center justify-between p-1.5 rounded hover:bg-slate-50">
                    <span>AI Quality Engineering</span>
                    <span className="text-[10px] text-slate-400 font-mono">Planned</span>
                  </li>
                  <li className="flex items-center justify-between p-1.5 rounded hover:bg-slate-50">
                    <span>Test Case & UAT Generation</span>
                    <span className="text-[10px] text-slate-400 font-mono">Planned</span>
                  </li>
                  <li className="flex items-center justify-between p-1.5 rounded hover:bg-slate-50">
                    <span>Legacy App Modernisation</span>
                    <span className="text-[10px] text-slate-400 font-mono">Planned</span>
                  </li>
                  <li className="flex items-center justify-between p-1.5 rounded hover:bg-slate-50">
                    <span>Production Deployment Assistant</span>
                    <span className="text-[10px] text-slate-400 font-mono">Planned</span>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Primary Flow Stepper Navigation */}
      <div className="bg-slate-50/80 border-t border-slate-200/80 overflow-x-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-1 sm:gap-2 min-w-max">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isActive = activeScreen === step.id;

            return (
              <React.Fragment key={step.id}>
                {idx > 0 && (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                )}
                <button
                  disabled={!step.isEnabled}
                  onClick={() => setActiveScreen(step.id)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                      : step.isEnabled
                      ? 'text-slate-700 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200'
                      : 'text-slate-400 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isActive
                        ? 'bg-white text-indigo-700'
                        : step.isDone
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {step.isDone && !isActive ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      step.number
                    )}
                  </span>
                  <span>{step.title}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </header>
  );
};

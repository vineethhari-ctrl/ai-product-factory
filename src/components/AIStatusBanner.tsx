import React from 'react';
import { AlertTriangle, Info, RefreshCw, X } from 'lucide-react';
import type { AIStatus } from '../services/aiSession';

interface AIStatusBannerProps {
  status: AIStatus;
  /** Re-runs the same AI step; absent when the step cannot be re-run from here. */
  onRetry?: () => void;
  isRetrying?: boolean;
  onDismiss: () => void;
}

/** What the BA can do about each kind of failure, in plain language. */
const ADVICE: Record<string, string> = {
  busy: "The AI provider's servers are overloaded. This usually clears within a few minutes: click Retry.",
  quota: "The free quota or rate limit of this API key is used up for now. Wait a minute and Retry, or try again tomorrow.",
  'unavailable-model': 'Your API key cannot use this model. The second model was tried as well; ask your admin to set a model your key can use in .env.',
  key: 'The API key in .env was rejected. Check GEMINI_API_KEY (or ANTHROPIC_API_KEY), then restart the app.',
  'cut-off': 'The AI answer was too long and got cut off. Click Retry; if it repeats, tell your admin.',
  'bad-answer': 'The AI answered in the wrong format. Click Retry; a second try usually works.',
  refused: 'The AI declined to answer this content. Check the material for anything sensitive, then Retry.',
  network: 'The AI service could not be reached. Check the internet connection, then Retry.',
};

/** Shown under the header when the AI could not answer (or the offline engine stood in for it), with a Retry button. */
export const AIStatusBanner: React.FC<AIStatusBannerProps> = ({ status, onRetry, isRetrying, onDismiss }) => {
  if (status.outcome === 'offline-no-key') {
    return (
      <div className="mx-4 mt-4 rounded-xl border border-slate-300 bg-white px-4 py-3 flex items-start gap-3 shadow-xs" role="status">
        <Info className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
        <div className="flex-1 text-xs text-slate-700">
          <span className="font-bold text-slate-900">No AI key is set up, so the offline engine made this "{status.button}" result.</span>{' '}
          Add <span className="font-mono">GEMINI_API_KEY</span> to the <span className="font-mono">.env</span> file and restart the app to let the AI do it.
        </div>
        <button onClick={onDismiss} className="text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const failures = status.failures ?? [];
  const kinds = [...new Set(failures.map((f) => f.kind))];
  const advice = kinds.map((k) => ADVICE[k]).filter(Boolean);

  return (
    <div className="mx-4 mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3 shadow-xs" role="alert">
      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
      <div className="flex-1 space-y-1.5 text-xs text-amber-950">
        {status.outcome === 'failed' ? (
          <>
            <p className="font-bold text-sm">The AI could not answer "{status.button}". Nothing was changed.</p>
            <p>Your previous result is kept. The offline engine is used only when no AI key is set up, so click Retry.</p>
          </>
        ) : (
          <>
            <p className="font-bold text-sm">
              The AI was not available for "{status.button}", so the offline engine made this result.
            </p>
            <p>The offline result is a starting point only: it follows your wording but does not design like the AI.</p>
          </>
        )}
        {failures.length > 0 && (
          <ul className="list-disc pl-5 space-y-0.5">
            {failures.map((f, i) => <li key={i}>{f.message}.</li>)}
          </ul>
        )}
        {advice.map((a, i) => <p key={i} className="font-semibold">{a}</p>)}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={isRetrying}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-300 text-slate-950 font-bold text-xs rounded-lg shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? 'Retrying...' : 'Retry with AI'}
          </button>
        )}
        <button onClick={onDismiss} className="text-amber-700 hover:text-amber-950 cursor-pointer" aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

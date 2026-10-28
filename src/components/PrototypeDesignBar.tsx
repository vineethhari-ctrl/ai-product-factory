import { designedScreenCount } from '../services/prototypeState';
import React, { useRef, useState } from 'react';
import { ImagePlus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import type { ProductDefinition } from '../types';
import { readReferenceImage } from '../services/referenceImage';

interface PrototypeDesignBarProps {
  definition: ProductDefinition;
  referenceImage: string | null;
  setReferenceImage: (dataUrl: string | null) => void;
  onRedesign: () => void;
  isGenerating: boolean;
}

/**
 * Who designed the screens (AI or offline engine), an optional reference screen the AI should
 * follow, and a button to have the AI design (or redesign) every screen.
 */
export const PrototypeDesignBar: React.FC<PrototypeDesignBarProps> = ({
  definition, referenceImage, setReferenceImage, onRedesign, isGenerating,
}) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const total = definition.screens.length;
  const byAI = designedScreenCount(definition);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      setReferenceImage(await readReferenceImage(file));
    } catch (err: any) {
      setError(err?.message || 'This image could not be read.');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-4 shadow-xs text-xs">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${byAI > 0 ? 'bg-violet-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="space-y-0.5 min-w-0">
          <p className="font-bold text-slate-900 text-sm">
            {byAI === 0
              ? 'Screens made by the offline engine'
              : byAI === total
                ? `All ${total} screens designed by the AI`
                : `${byAI} of ${total} screens designed by the AI`}
          </p>
          <p className="text-slate-600">
            {byAI === total
              ? 'The AI designed each screen from your process, users and rules.'
              : 'Click "Design with AI" to have the AI design every screen from your process, users and rules.'}{' '}
            A reference screen is optional: the AI copies its layout, never its data. Use one without client names or real data, because the image is sent to the AI provider.
          </p>
          {error && <p className="text-red-600 font-semibold">{error}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {referenceImage ? (
          <div className="flex items-center gap-2">
            <img src={referenceImage} alt="Reference screen" className="h-12 w-20 object-cover rounded-md border border-slate-300" />
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-slate-700">Reference screen</span>
              <button
                onClick={() => setReferenceImage(null)}
                className="inline-flex items-center gap-1 text-slate-500 hover:text-red-600 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => fileInput.current?.click()}
            title="Do not upload screens that show client names or real data: the image is sent to the AI provider."
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-dashed border-slate-300 hover:border-indigo-400 hover:text-indigo-700 text-slate-600 font-semibold rounded-lg cursor-pointer"
          >
            <ImagePlus className="w-4 h-4" /> Add reference screen (optional)
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }}
        />
        <button
          onClick={onRedesign}
          disabled={isGenerating}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-300 text-white font-bold rounded-lg shadow-xs cursor-pointer"
        >
          <Wand2 className="w-4 h-4" />
          {isGenerating ? 'AI is designing...' : byAI > 0 ? 'Redesign with AI' : 'Design with AI'}
        </button>
      </div>
    </div>
  );
};

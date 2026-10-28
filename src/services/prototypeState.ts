import type { ProductDefinition } from '../types';

/**
 * Has the Build Prototype design step (research, then design) produced this prototype? The BRD also writes a UI
 * blueprint for every screen marked origin 'AI'; that is a first draft and does not count, or the button would
 * never call the AI. Offline designs, placeholder screens and pre-blueprint UI never count either.
 */
export function isPrototypeDesigned(def: ProductDefinition): boolean {
  return def.screens.length > 0 && def.screens.every((s) => s.confidence !== 'MISSING' && s.ui?.origin === 'AI' && s.ui?.designed === true);
}

export const designedScreenCount = (def: ProductDefinition) => def.screens.filter((s) => s.ui?.designed === true).length;

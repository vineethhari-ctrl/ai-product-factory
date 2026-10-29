import type { ProductDefinition } from '../types';

/**
 * Has the Build Prototype design step (research, then design) produced this prototype? The BRD also writes a UI
 * blueprint for every screen marked origin 'AI'; that is a first draft and does not count, or the button would
 * never call the AI. Offline designs, placeholder screens and pre-blueprint UI never count either. A screen the factory
 * itself added (addedBy 'FACTORY', for example the ledger) is not the AI's work and is not asked of it.
 */
export function isPrototypeDesigned(def: ProductDefinition): boolean {
  const own = def.screens.filter((s) => s.ui?.addedBy !== 'FACTORY');
  return own.length > 0 && own.every((s) => s.confidence !== 'MISSING' && s.ui?.origin === 'AI' && s.ui?.designed === true);
}

/** Screens the design step produced. A screen the factory added is never counted as the AI's. */
export const designedScreenCount = (def: ProductDefinition) => def.screens.filter((s) => s.ui?.designed === true && s.ui?.addedBy !== 'FACTORY').length;

/** Screens the factory added on its own (not designed by the AI). */
export const factoryScreenCount = (def: ProductDefinition) => def.screens.filter((s) => s.ui?.addedBy === 'FACTORY').length;

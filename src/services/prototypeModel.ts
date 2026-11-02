import type { ProductDefinition, ScreenDefinition } from '../types';

/**
 * What the prototype shows for a definition: the screens in menu order, the roles to try, whether a role is read-only and
 * what the page header's main button says. Pure, so the in-app prototype and the exported stand-alone file always agree.
 */

export interface PrototypeRole { name: string; role: string; permissions: string[]; }

/** Document screens first: creating and working documents is what the application is for. */
export function prototypeScreens(definition: ProductDefinition): ScreenDefinition[] {
  if (definition?.screens && definition.screens.length > 0) {
    const isDoc = (s: ScreenDefinition) => s.layoutType === 'transaction' && !!s.ui?.document;
    return [...definition.screens.filter(isDoc), ...definition.screens.filter((s) => !isDoc(s))];
  }
  if (definition?.modules && definition.modules.length > 0) {
    return definition.modules.map((m, idx) => ({
      id: `scr-derived-${idx}`,
      name: m.name,
      module: m.name,
      layoutType: 'dashboard' as const,
      components: [`${m.name} Header & Metrics`, 'Status Allocation Grid', 'Priority Alerts Stream', 'Interactive Workbench'],
      purpose: m.description,
      confidence: (m.confidence || 'CONFIRMED') as ScreenDefinition['confidence'],
      evidence: [] as string[],
    }));
  }
  return [
    {
      id: 'scr-main',
      name: `${definition.productName || 'Product'} Dashboard`,
      module: 'Core Module',
      layoutType: 'dashboard' as const,
      components: ['Status Overview Panel', 'Primary Data Grid', 'Action Toolbar', 'Notifications Feed'],
      purpose: `Primary operational dashboard for ${definition.productName || 'the product'}`,
      confidence: 'INFERRED' as const,
      evidence: [] as string[],
    },
  ];
}

export function prototypeRoles(definition: ProductDefinition): PrototypeRole[] {
  if (definition?.personas && definition.personas.length > 0) {
    return definition.personas.map((p) => ({ name: p.name, role: p.role, permissions: p.permissions || ['Standard Access'] }));
  }
  return [
    { name: 'Primary User', role: 'Operator', permissions: ['Standard Access', 'Workflow Execution'] },
    { name: 'Manager / Supervisor', role: 'Manager', permissions: ['Managerial Review', 'Escalations'] },
    { name: 'Audit & Compliance', role: 'Auditor', permissions: ['Read Only Audit Logs'] },
  ];
}

export const isReadOnlyRole = (role: PrototypeRole): boolean =>
  role.permissions.some((p) => p.toLowerCase().includes('read only') || p.toLowerCase().includes('auditor'));

/** A sample person for the signed-in user: the prototype is not about the BA using the factory. */
export const SAMPLE_USERS = ['Priya Raman', 'Marcus Chen', 'Elena García', 'Samuel Okafor', 'Hannah Weber', 'Diego Alvarez'];
export const sampleUserFor = (roleIdx: number): string => SAMPLE_USERS[roleIdx % SAMPLE_USERS.length];

/** Form, document and phone screens carry their own main button; the page header would repeat it. */
export function shellActionFor(screen: ScreenDefinition | undefined): string | undefined {
  const ui = screen?.ui;
  if (!screen || !ui) return undefined;
  if (screen.layoutType === 'form-wizard') return undefined;
  if (screen.layoutType === 'transaction' && ui.document) return undefined;
  if (ui.device === 'phone') return undefined;
  return ui.primaryActions[0];
}

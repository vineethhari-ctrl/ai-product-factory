import { validateRecord } from '../services/validationEngine';
import { normalizeDefinitionConstraints } from '../../server/constraints';
import type { DataEntityDefinition, ProductDefinition } from '../types';

/**
 * In the stand-alone prototype file there is no server, but a form screen still asks `/api/validate-record` for a verdict
 * (EntityForm). This answers that one call in the page itself with the same engine and the same sanitising the server uses,
 * so the form behaves exactly as in the app. Any other `/api/` call is answered 404: the file never reaches a network.
 */
export function installValidationShim(): void {
  const realFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : undefined;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    if (/\/api\/validate-record$/.test(url)) {
      try {
        const body = JSON.parse(String(init?.body ?? '{}'));
        const shell = { dataEntities: [body.entity as DataEntityDefinition] } as ProductDefinition;
        const entity = normalizeDefinitionConstraints(shell).definition.dataEntities[0];
        const issues = validateRecord(entity, body.record ?? {}, body.mode ?? 'create', { existing: body.existing });
        return json(issues.length ? 422 : 200, { valid: issues.length === 0, issues });
      } catch (e) {
        return json(400, { error: (e as Error).message || 'Invalid request.' });
      }
    }
    if (/\/api\//.test(url)) return json(404, { error: 'This is a stand-alone prototype: there is no server.' });
    return realFetch ? realFetch(input as RequestInfo, init) : json(404, {});
  };
}

/**
 * Who is using the factory and on which project, sent with every /api call so the server can meter
 * AI usage (server/usage.ts). Identity is self-declared: enough for team accountability, not security.
 */

const USER_KEY = 'apf.user';
const PROJECT_KEY = 'apf.projectId';

export const AI_NOTICE_EVENT = 'apf:ai-notice';
export const USAGE_CHANGED_EVENT = 'apf:usage-changed';

const read = (key: string) => {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
};
const write = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* private mode: keep in memory only */ }
};

let memoryUser = '';
let memoryProject = '';

export function getUser(): string {
  return read(USER_KEY) || memoryUser;
}

export function setUser(name: string) {
  memoryUser = name.trim();
  write(USER_KEY, memoryUser);
  window.dispatchEvent(new Event(USAGE_CHANGED_EVENT));
}

export function getProjectId(): string {
  let id = read(PROJECT_KEY) || memoryProject;
  if (!id) id = newProjectId();
  return id;
}

/** Called on New Initiative: the next AI calls count against a fresh project. */
export function newProjectId(): string {
  const id = `PRJ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  memoryProject = id;
  write(PROJECT_KEY, id);
  window.dispatchEvent(new Event(USAGE_CHANGED_EVENT));
  return id;
}

const isApi = (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);
};

/** Adds the identity headers to /api calls and relays the server's AI notices. Call once at start-up. */
export function installAiSession() {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isApi(input)) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('X-User', getUser() || 'anonymous');
    headers.set('X-Project-Id', getProjectId());
    const response = await original(input, { ...init, headers });
    const notice = response.headers.get('X-AI-Notice');
    if (notice) {
      window.dispatchEvent(new CustomEvent(AI_NOTICE_EVENT, { detail: decodeURIComponent(notice) }));
      window.dispatchEvent(new Event(USAGE_CHANGED_EVENT));
    }
    return response;
  };
}

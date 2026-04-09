import { AtpAgent, type AtpSessionData, type AtpSessionEvent } from "@atproto/api";

const SESSION_KEY = "trailcast_session";

function loadPersistedSession(): AtpSessionData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AtpSessionData;
  } catch {
    return null;
  }
}

function persistSession(evt: AtpSessionEvent, sess?: AtpSessionData) {
  if (typeof window === "undefined") return;
  if (evt === "create" || evt === "update") {
    if (sess) localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function clearPersistedSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}

let _agent: AtpAgent | null = null;

export function getAgent(): AtpAgent {
  if (!_agent) {
    _agent = new AtpAgent({
      service: "https://bsky.social",
      persistSession: persistSession,
    });
  }
  return _agent;
}

export async function loginWithPassword(
  identifier: string,
  password: string,
): Promise<void> {
  const agent = getAgent();
  await agent.login({ identifier, password });
}

export async function resumeSession(): Promise<boolean> {
  const saved = loadPersistedSession();
  if (!saved) return false;
  try {
    const agent = getAgent();
    await agent.resumeSession(saved);
    return agent.hasSession;
  } catch {
    clearPersistedSession();
    return false;
  }
}

export function logout(): void {
  clearPersistedSession();
  _agent = null;
}

export function hasActiveSession(): boolean {
  return _agent?.hasSession ?? false;
}

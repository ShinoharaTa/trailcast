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

/**
 * AtpSessionEvent → localStorage の同期。
 *
 * `@atproto/api` 側の挙動:
 *   - "create" / "update": session を保存
 *   - "expired" / "create-failed": session は破棄 (sess は undefined)
 *   - "network-error": refresh が一時的なネットワーク不調等で失敗。
 *     agent 側は session を保持 (sess は元の session を渡してくる) ため、
 *     こちらでも localStorage を消してはいけない。
 *
 * 以前は create/update 以外を全て logout 扱いして localStorage を消していたため、
 * 一瞬の通信不調で勝手にログアウトされる現象が出ていた。
 */
function persistSession(evt: AtpSessionEvent, sess?: AtpSessionData) {
  if (typeof window === "undefined") return;
  switch (evt) {
    case "create":
    case "update":
      if (sess) localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
      return;
    case "network-error":
      // 一時的失敗。session が渡されている場合のみ書き戻し、無ければ何もしない
      // (既存の保存値をそのまま温存する)。
      if (sess) localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
      return;
    case "expired":
    case "create-failed":
    default:
      localStorage.removeItem(SESSION_KEY);
      return;
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

/**
 * 永続化済みの session を agent に流し込んでセッションを復元する。
 *
 * `@atproto/api` の `agent.resumeSession()` は内部で必ず refreshSession を
 * 走らせるため、一時的なネットワーク不調でも reject する。reject = ログアウト
 * とは限らず、session 自体は agent に残っているケースがある (drs:
 *   "a rejected promise from this method indicates a failure to refresh the
 *    session after resuming it but does not indicate a failure to set the
 *    session itself")
 *
 * そのため:
 *   - resumeSession が成功 → そのまま hasSession を返す
 *   - reject されても agent.hasSession === true → 一時的失敗とみなし、
 *     localStorage は消さず、保存値もそのまま (ログイン状態は維持)
 *   - reject かつ agent.hasSession === false → 認証エラー等で本当に死亡。
 *     localStorage を破棄して未ログイン扱い
 */
export async function resumeSession(): Promise<boolean> {
  const saved = loadPersistedSession();
  if (!saved) return false;
  const agent = getAgent();
  try {
    await agent.resumeSession(saved);
    return agent.hasSession;
  } catch (e) {
    if (agent.hasSession) {
      console.warn("resumeSession refresh failed, keeping session", e);
      return true;
    }
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

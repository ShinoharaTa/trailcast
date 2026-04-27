import { Agent } from "@atproto/api";
import {
  BrowserOAuthClient,
  type OAuthSession,
} from "@atproto/oauth-client-browser";

// 旧 App Password セッションのキー。OAuth 移行時に強制ログアウトする目印。
const LEGACY_SESSION_KEY = "trailcast_session";

// OAuth 用 scope。`atproto` は必須、`transition:generic` は app.bsky.* /
// com.atproto.repo.* を含む既存 lexicon 操作を一括許可するための互換 scope。
const OAUTH_SCOPE = "atproto transition:generic";

const HANDLE_RESOLVER = "https://bsky.social";

let _client: BrowserOAuthClient | null = null;
let _session: OAuthSession | null = null;
let _agent: Agent | null = null;
type InitResult = { session: OAuthSession | null; state?: string | null };

let _initPromise: Promise<InitResult> | null = null;

/**
 * 旧来の App Password セッションが localStorage に残っていれば消す。
 * OAuth 移行時の取り残し対策。1 度だけ走れば十分なので副作用無しで呼んで OK。
 */
function clearLegacySession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    // quota / denied: silent
  }
}

/**
 * 現在の origin から OAuth `client_id` を組み立てる。
 *
 * - 公開ドメイン (https://...) では `${origin}/client-metadata.json` を返す。
 *   実際の JSON は `scripts/prepare-client-metadata.mjs` がブランチに応じて
 *   `public/client-metadata.json` に書き出している。
 * - localhost / 127.0.0.1 / [::1] のローカル開発では loopback client モードを
 *   使い、特殊な `http://localhost?redirect_uri=...&scope=...` 形式の client_id
 *   を組み立てる (atproto OAuth 仕様。client metadata はサーバ側にハードコード)。
 *
 * NOTE: WebCrypto は HTTPS もしくは 127.0.0.1 でしか動かないため、`localhost`
 *   で開発する場合は library が自動で 127.0.0.1 にリダイレクトしてくれる。
 */
function buildClientId(): string {
  if (typeof window === "undefined") {
    throw new Error("OAuth client requires browser context");
  }
  const origin = window.location.origin;
  const isLoopback =
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1") ||
    origin.startsWith("http://[::1]");
  if (isLoopback) {
    const redirect = `${origin}/auth/callback`;
    return `http://localhost?redirect_uri=${encodeURIComponent(
      redirect,
    )}&scope=${encodeURIComponent(OAUTH_SCOPE)}`;
  }
  return `${origin}/client-metadata.json`;
}

async function getOAuthClient(): Promise<BrowserOAuthClient> {
  if (_client) return _client;
  clearLegacySession();
  _client = await BrowserOAuthClient.load({
    clientId: buildClientId(),
    handleResolver: HANDLE_RESOLVER,
  });
  return _client;
}

function attachSession(session: OAuthSession): void {
  _session = session;
  _agent = new Agent(session);
}

function detachSession(): void {
  _session = null;
  _agent = null;
}

/**
 * アプリ起動時に 1 度だけ呼ぶ初期化。
 *
 * - URL に OAuth コールバックパラメータが乗っていれば自動で取り込む
 *   (`/auth/callback?code=...&state=...` を踏んで戻ってきたケース)。
 * - それ以外は IndexedDB に保存済みのセッションを復元する。
 *
 * 多重呼び出しは 1 つの promise にまとめる (StrictMode で再マウントしても安全)。
 */
export async function initAuth(): Promise<{
  did: string;
  isCallback: boolean;
} | null> {
  if (!_initPromise) {
    _initPromise = (async (): Promise<InitResult> => {
      const client = await getOAuthClient();
      const result = await client.init();
      if (result?.session) {
        attachSession(result.session);
        return { session: result.session, state: result.state };
      }
      return { session: null };
    })();
  }
  const result = await _initPromise;
  if (!result.session) return null;
  return {
    did: result.session.sub,
    // `state` が付いていれば「いま OAuth コールバックから戻ってきた」ことを示す。
    isCallback: result.state != null,
  };
}

/**
 * ハンドル / DID / PDS URL のいずれかを受け取り、認可サーバへリダイレクトする。
 * 戻り値の Promise は基本的に解決しない (リダイレクト発生のため)。
 * AbortSignal でキャンセルされた場合や、ユーザーがブラウザ戻るで離脱した場合に
 * reject する。
 */
export async function startSignIn(identifier: string): Promise<never> {
  const client = await getOAuthClient();
  await client.signIn(identifier, {
    // CSRF + コールバック識別用に簡易 state。中身は今は使っていない。
    state: crypto.randomUUID(),
  });
  // signIn は通常リダイレクトで離脱するためここまで来ない。
  throw new Error("OAuth redirect did not occur");
}

/**
 * 現在のセッションをサーバ側で revoke し、ローカル状態もクリアする。
 */
export async function signOutCurrent(): Promise<void> {
  if (_session) {
    try {
      await _session.signOut();
    } catch (e) {
      console.warn("[auth] signOut failed", e);
    }
  }
  detachSession();
  clearLegacySession();
}

/**
 * 認証済みでない場合に投げる用の Agent ゲッター。
 * 既存コールサイトとの互換のため同期で返すが、initAuth() が完了している前提。
 */
export function getAgent(): Agent {
  if (!_agent) {
    throw new Error(
      "AT Protocol agent is not initialized. Did you call initAuth() first?",
    );
  }
  return _agent;
}

export function getOptionalAgent(): Agent | null {
  return _agent;
}

export function hasActiveSession(): boolean {
  return _agent !== null;
}

/**
 * ログイン中ユーザーの DID を返す。
 * Agent が未初期化なら例外。
 */
export function getMyDid(): string {
  const agent = getAgent();
  return agent.assertDid;
}

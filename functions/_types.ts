/**
 * Cloudflare Pages Functions (Workers) の最小限のグローバル型宣言。
 *
 * 全プロジェクトに `@cloudflare/workers-types` を `lib` 追加すると DOM 型と
 * 衝突する (Request / Response / fetch のシグネチャ差分等) ので、
 * functions/ 配下で必要な分だけここで宣言する。
 */

export interface CfHtmlRewriterElement {
  setInnerContent(content: string): void;
  remove(): void;
  append(content: string, options?: { html?: boolean }): void;
}

export interface CfHtmlRewriterHandlers {
  element?: (el: CfHtmlRewriterElement) => void | Promise<void>;
}

export interface CfHtmlRewriter {
  on(selector: string, handlers: CfHtmlRewriterHandlers): CfHtmlRewriter;
  transform(response: Response): Response;
}

declare global {
  const HTMLRewriter: {
    new (): CfHtmlRewriter;
  };
}

/**
 * D1 の最小限の型。`@cloudflare/workers-types` を丸ごと入れると DOM 型と
 * 衝突するため、使う分だけ宣言する (このファイルの方針に合わせる)。
 */
export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface IndexEnv {
  DB?: D1Database;
}

/** Pages Functions のハンドラに渡るコンテキスト (使う分だけ) */
export interface PagesFunctionContext<Env = IndexEnv> {
  request: Request;
  env: Env;
}

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

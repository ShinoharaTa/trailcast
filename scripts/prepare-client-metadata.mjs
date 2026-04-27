#!/usr/bin/env node
/**
 * デプロイ環境に応じて public/client-metadata.json を生成する。
 *
 * 判定ロジック:
 *   1. 明示的な環境変数 TRAILCAST_ENV ("prod" | "dev") があればそれを使用
 *   2. それ以外は Cloudflare Pages の CF_PAGES_BRANCH を見る
 *      - "main" -> prod
 *      - それ以外 (dev / preview / 未設定) -> dev
 *
 * 元データ: config/oauth/client-metadata.{prod,dev}.json
 * 出力先  : public/client-metadata.json (gitignore 対象)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(__filename), "..");

function detectEnv() {
  const explicit = process.env.TRAILCAST_ENV;
  if (explicit === "prod" || explicit === "dev") return explicit;

  const branch = process.env.CF_PAGES_BRANCH;
  if (branch === "main") return "prod";
  return "dev";
}

const env = detectEnv();
const sourcePath = resolve(
  projectRoot,
  `config/oauth/client-metadata.${env}.json`,
);
const outDir = resolve(projectRoot, "public");
const outPath = resolve(outDir, "client-metadata.json");

if (!existsSync(sourcePath)) {
  console.error(`[prepare-client-metadata] source not found: ${sourcePath}`);
  process.exit(1);
}

const raw = readFileSync(sourcePath, "utf8");
const parsed = JSON.parse(raw);

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

const branchInfo = process.env.CF_PAGES_BRANCH
  ? ` (CF_PAGES_BRANCH=${process.env.CF_PAGES_BRANCH})`
  : "";
console.log(
  `[prepare-client-metadata] env=${env}${branchInfo} -> ${outPath} (client_id=${parsed.client_id})`,
);

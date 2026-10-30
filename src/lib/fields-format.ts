// 記録項目の値を表示用の文字列にする純関数。仕様は docs/custom-fields.md。

import type { ResolvedValue } from "@/lib/fields";

/** 定義から消えた option id の表示名 */
export const UNKNOWN_OPTION_LABEL = "未定義の選択肢";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 秒を "h:mm:ss" (1 時間以上) か "m:ss" (1 時間未満) にする */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

/**
 * 解決済みの値を表示用の文字列にする (項目名は含まない)。
 * - select: 選んだ選択肢名を「・」区切り。定義に無い id は「未定義の選択肢」
 * - number: "値 単位" (単位が無ければ値だけ。丸めない)
 * - duration: formatDuration
 * - text: そのまま
 */
export function formatResolvedValue(resolved: ResolvedValue): string {
  const { field } = resolved;
  switch (field.type) {
    case "select": {
      const byId = new Map((field.options ?? []).map((o) => [o.id, o.label]));
      return (resolved.optionIds ?? [])
        .map((id) => byId.get(id) ?? UNKNOWN_OPTION_LABEL)
        .join("・");
    }
    case "number": {
      const value = resolved.value ?? "";
      return field.unit && value ? `${value} ${field.unit}` : value;
    }
    case "duration":
      return resolved.seconds === undefined
        ? ""
        : formatDuration(resolved.seconds);
    case "text":
      return resolved.text ?? "";
  }
  return "";
}

const COLON_PATTERN = /^(\d+)(?::(\d{1,2}))?:(\d{1,2})$/;
const JA_UNIT_PATTERN = /^(?:(\d+)時間(半)?)?(?:(\d+)分(半)?)?(?:(\d+)秒)?$/;
const EN_UNIT_PATTERN = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i;
const MINUTES_PATTERN = /^\d+(?:\.\d+)?$/;

/**
 * 時間の自由入力を合計秒にする。NFKC → trim して、空なら null (値なし)。
 * - "h:mm:ss" / "m:ss"。2 つ目以降は 0〜59
 * - "1時間23分45秒" / "83分" / "1時間半" / "2分半" (各部は省略可、空白は無視)
 * - "1h23m45s" / "83m" / "90s" (大文字小文字は無視)
 * - 数字だけ (小数可) は分。秒に四捨五入
 * それ以外 (負数を含む) と、合計秒が安全な整数に収まらないものは "invalid"。
 */
export function parseDurationInput(input: string): number | null | "invalid" {
  const text = input.normalize("NFKC").trim();
  if (!text) return null;
  const seconds = parseDurationText(text);
  if (seconds === "invalid" || !Number.isSafeInteger(seconds)) return "invalid";
  return seconds;
}

function parseDurationText(text: string): number | "invalid" {
  const colon = COLON_PATTERN.exec(text);
  if (colon) {
    const [, first, middle, last] = colon;
    const h = middle === undefined ? 0 : Number(first);
    const m = Number(middle ?? first);
    const s = Number(last);
    if ((middle !== undefined && m > 59) || s > 59) return "invalid";
    return h * 3600 + m * 60 + s;
  }

  if (MINUTES_PATTERN.test(text)) return Math.round(Number(text) * 60);

  const compact = text.replace(/\s+/g, "");
  const ja = JA_UNIT_PATTERN.exec(compact);
  if (ja) {
    const [, h, hHalf, m, mHalf, s] = ja;
    if (h === undefined && m === undefined && s === undefined) return "invalid";
    // 「半」は単位の末尾に付くものだけ (「1時間半10分」「1時間半30秒」は不正)
    if (
      (hHalf && (m !== undefined || s !== undefined)) ||
      (mHalf && s !== undefined)
    ) {
      return "invalid";
    }
    return (
      Number(h ?? 0) * 3600 +
      (hHalf ? 1800 : 0) +
      Number(m ?? 0) * 60 +
      (mHalf ? 30 : 0) +
      Number(s ?? 0)
    );
  }

  const en = EN_UNIT_PATTERN.exec(compact);
  if (en) {
    const [, h, m, s] = en;
    if (h === undefined && m === undefined && s === undefined) return "invalid";
    return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
  }

  return "invalid";
}

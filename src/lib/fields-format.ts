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

/** 時間の入力欄 (時・分・秒) ごとの文字列。入力途中の空欄を保つため数値にしない */
export interface DurationParts {
  h: string;
  m: string;
  s: string;
}

/** 秒を時・分・秒の入力欄の文字列に分ける */
export function splitSeconds(seconds: number): DurationParts {
  return {
    h: String(Math.floor(seconds / 3600)),
    m: String(Math.floor((seconds % 3600) / 60)),
    s: String(seconds % 60),
  };
}

/**
 * 時・分・秒の入力を合計秒にする。
 * 全部空なら null (値なし)、分・秒が 59 を超えたら "invalid"。
 */
export function joinSeconds(parts: DurationParts): number | null | "invalid" {
  if (!parts.h && !parts.m && !parts.s) return null;
  const h = Number(parts.h || "0");
  const m = Number(parts.m || "0");
  const s = Number(parts.s || "0");
  if (m > 59 || s > 59) return "invalid";
  return h * 3600 + m * 60 + s;
}

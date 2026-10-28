// post.location の record 形式とアプリ内の Location (数値) の変換 (#64)。
//
// lexicon には浮動小数の型が無いので、緯度経度高度は decimal string で保存する
// (community.lexicon.location.geo と同じ形)。2026-10 以前の record は JSON number を
// 持つことがあるので、読み取りは number / string の両方を受ける。既存 record は書き換えない。
// 画面は Location だけを扱い、変換はこのファイルに閉じる。

import { DECIMAL_PATTERN } from "@/lib/fields";
import type { Location, LocationRecord } from "@/lib/types";

/** 小数 7 桁 (約 1cm) に丸め、末尾の 0 と "." を落とす。"-0" は "0"。DECIMAL_PATTERN を満たす */
export function formatCoordinate(n: number): string {
  let s = n.toFixed(7);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
}

/** number か decimal string の有限値。それ以外は null */
function toCoordinate(raw: unknown): number | null {
  let n: number;
  if (typeof raw === "number") n = raw;
  else if (typeof raw === "string" && DECIMAL_PATTERN.test(raw)) n = Number(raw);
  else return null;
  return Number.isFinite(n) ? n : null;
}

/**
 * record の location を数値にする。number でも decimal string でも受ける。
 * - latitude は [-90, 90]、longitude は [-180, 180] の有限値。外れたら null
 * - altitude は任意。不正なら altitude だけ落として lat/lng は返す
 * - object でない・必須が無い・NaN・DECIMAL_PATTERN 不一致 → null
 */
export function parseLocation(raw: unknown): Location | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const latitude = toCoordinate(r.latitude);
  const longitude = toCoordinate(r.longitude);
  if (latitude === null || latitude < -90 || latitude > 90) return null;
  if (longitude === null || longitude < -180 || longitude > 180) return null;
  const altitude = toCoordinate(r.altitude);
  return altitude === null ? { latitude, longitude } : { latitude, longitude, altitude };
}

/** 保存用。3 値とも formatCoordinate。altitude が undefined ならキーを作らない */
export function locationToRecord(loc: Location): LocationRecord {
  const out: LocationRecord = {
    latitude: formatCoordinate(loc.latitude),
    longitude: formatCoordinate(loc.longitude),
  };
  if (loc.altitude !== undefined) out.altitude = formatCoordinate(loc.altitude);
  return out;
}

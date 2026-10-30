# Trailcast 残 issue 実装仕様（#64 / #74 / #62 / #31）

作成: 2026-10-28 / 担当: spec-writer
対象: `origin/main` @ d99acfb（#79 統合済み。記録項目・絞り込み・記録帳まで入っている）
データモデルは [custom-fields.md](./custom-fields.md)、記録モードは [record-mode.md](./record-mode.md) が正。
本書はその差分仕様。配置先: `docs/remaining-spec.md`

implementer への共通申し送り:
- 1 PR = 1 ブランチ、base は `main`。PR 本文に `Closes #<issue>`。
- 既存 record の書き戻しは `{ ...stripRecordMeta(x), 変更分 }`（列挙しない）。
- 純関数は `src/lib/*.ts` に置き vitest（jsdom 無し、TZ=Asia/Tokyo）で検証。UI は `npm run build` / `lint` の通過を PR に貼る。
- スクリーンショットは撮れない（ヘッドレス）。

推奨する着手順（`thread-detail-screen.tsx` の衝突を減らす）:
`#64-PR1 → #74 → #62 → #31-PR1 → #31-PR2 → #64-PR2`。順序を変えても壊れないが、`thread-detail-screen.tsx` を触る PR（#74 / #62 / #31-PR2 / #64-PR2）は直列にマージする。

---

## 1. #64 lexicon の文字数上限と `location` の型

### 1.1 何のために
日本語ユーザーが lexicon 上の上限に早く当たる状態（label 20 バイト = 日本語 6 文字）を直し、
他クライアントや将来の PDS 検証で弾かれないようにする。あわせて lexicon 仕様に無い
`"type": "number"` を無くし、atproto のデータモデル（浮動小数不可）に沿った保存形式に移す。

### 1.2 現状（コードで確認した事実）
- 4 本の lexicon の string はすべて `maxLength` のみ。`maxGraphemes` は 0 件。
- コード側の上限定数はすべて grapheme 単位（`sliceGraphemes`）:
  `MAX_TAG_LENGTH` 64 / `MAX_TAG_GROUP_LABEL_LENGTH` 20（tags.ts）、
  `MAX_FIELD_LABEL_LENGTH` 20 / `MAX_FIELD_UNIT_LENGTH` 8 / `MAX_TEXT_VALUE_LENGTH` 200（fields.ts）。
  `MAX_NUMBER_VALUE_LENGTH` 32 と `MAX_FIELD_ID_LENGTH` 16 は ASCII 前提で `.length`。
- 投稿本文は `MAX_TEXT = 200` で `text.slice(0, 200)`（UTF-16 code unit）。スレッドの
  title / description は `<input maxLength={100|500}>`（code unit）。code unit 数 ≥ grapheme 数なので
  いずれも maxGraphemes に対して保守的。**触らない。**
- `tags.ts:20` のコメントは既に「lexicon の maxLength は UTF-8 バイト長」に直っている（issue 本文は古い）。
- `location` は post lexicon で `latitude / longitude / altitude` が `"type": "number"`。
  読み手: `thread-detail-screen.tsx:1243-1246`（`toFixed(4)` 表示）、`checkpoint-edit-screen.tsx:74,181-186`
  （state 初期化・表示・書き戻し）。書き手: `checkpoint-post-screen.tsx:105,319,524-562`
  （Geolocation / EXIF → 数値で保存、写真の位置との `===` 比較）、`checkpoint-edit-screen.tsx:94`。
  `src/lib/exif.ts` は数値を返す。`functions/`（OGP / インデックス）は location を読まない。
  `src/lib/stores/thread-store.ts` の `PostRecord.location` は未使用の旧 store（触らない）。
- atproto lexicon 仕様: 型は boolean / integer / string / bytes / cid-link / blob / array / object /
  params / token / ref / union / unknown（number は無い）。`unknown` もオブジェクト限定で
  「中身も data model に従う（float 不可）」。`maxLength` は UTF-8 バイト、`maxGraphemes` は書記素。
- コミュニティ lexicon `community.lexicon.location.geo` は latitude / longitude / altitude を **string** で持つ。

### 1.3 推測
- 既に `location` 付きの post（数値で保存）が本番 PDS に存在しうる。件数は不明。
  → **読み取りは number / string の両対応が必須**。書き換えはしない（データモデル的に不正なまま
  残るが、Trailcast 自身と Bluesky PDS は今まで通り読める）。

### 1.4 決定
- **D-1** すべての「人が書く string」に `maxGraphemes`（= 今の `maxLength` の値）を付け、
  `maxLength` は **×10**（Bluesky の 300/3000 と同じ慣習）に広げる。ASCII 固定の string
  （`fieldDef.id` / `fieldOption.id` / `selectValue.field` 等の id、`numberValue.value`）は
  `maxLength` のまま、`maxGraphemes` を付けない。
- **D-2** `location` の緯度経度高度は **decimal string** で保存する（`community.lexicon.location.geo`
  と同形、`numberValue.value` と同じ `DECIMAL_PATTERN`）。読み取りは number / string 両対応。
  既存 record は書き換えない。U-1 参照。
- **D-3** `location` は inline object のまま（ref 化しない。差分を最小に）。
- **D-4** `src/lib/location.ts` を新設し、変換はそこに閉じる。画面は `Location`（数値）だけを扱う。
- **D-5** lexicon と定数の整合は vitest で固定する（`src/lexicons/lexicon.test.ts`）。

### 1.5 PR 分割
| # | ブランチ | 内容 | 依存 |
|---|---|---|---|
| 64-1 | `fix/lexicon-graphemes` | `maxGraphemes` 追加・`maxLength` 拡大、定数コメント、整合テスト | — |
| 64-2 | `fix/lexicon-location-string` | `location` を string 化、`location.ts`、読み書き 4 箇所、テスト | 64-1（テストファイルを共有） |

両方 `Refs #64`、64-2 に `Closes #64`。

### 1.6 PR 64-1: 変更ファイル
| ファイル | 変更 |
|---|---|
| `src/lexicons/net.shino3.trailcast.post.json` | `text` 200→`maxGraphemes:200, maxLength:2000`、`tags.items` 64→64/640、`textValue.text` 200→200/2000 |
| `src/lexicons/net.shino3.trailcast.thread.json` | `title` 100→100/1000、`description` 500→500/5000、`tagGroups.items.label` 20→20/200、`tagGroups.items.tags.items` 64→64/640、`fieldDef.label` 20→20/200、`fieldDef.unit` 8→8/80、`fieldOption.label` 64→64/640、`tags.items` 64→64/640、`defaultTags.items` 64→64/640 |
| `src/lexicons/net.shino3.trailcast.tagIndex.json` | `tagEntry.tag` 64→64/640 |
| `src/lib/tags.ts` | `MAX_TAG_LENGTH` / `MAX_TAG_GROUP_LABEL_LENGTH` のコメントを「grapheme 単位。lexicon の maxGraphemes と一致させる」に |
| `src/lib/fields.ts` | `MAX_FIELD_LABEL_LENGTH` / `MAX_FIELD_UNIT_LENGTH` / `MAX_TEXT_VALUE_LENGTH` のコメント同上。`MAX_NUMBER_VALUE_LENGTH` / `MAX_FIELD_ID_LENGTH` は「ASCII のみなので lexicon の maxLength（バイト）と一致」と明記 |
| `src/lexicons/lexicon.test.ts` | **新規**（§1.8） |
| `docs/custom-fields.md` | §4 の lexicon 案の `maxLength` を本 PR の値に更新（履歴として残す場合は脚注でもよい） |

表記例（`fieldDef.label`）:
```jsonc
"label": { "type": "string", "maxGraphemes": 20, "maxLength": 200 }
```
`bookmark.json` に長さ付き string は無い。`id` 系・`numberValue.value` は変更しない。

### 1.7 PR 64-2: 変更ファイル
| ファイル | 変更 |
|---|---|
| `src/lexicons/net.shino3.trailcast.post.json` | `location.properties.{latitude,longitude,altitude}` を `{"type":"string","maxLength":32}` に。description に「WGS84 の 10 進度を 10 進文字列で。2026-10 以前の record は JSON number を持つことがあり、読み手は両方を受ける」と書く |
| `src/lib/types.ts` | `Location`（数値、アプリ内）はそのまま。`LocationRecord` を追加し `PostRecord.location?: LocationRecord` に変更 |
| `src/lib/location.ts` | **新規**（§1.8） |
| `src/lib/location.test.ts` | **新規** |
| `src/components/screens/checkpoint-post-screen.tsx` | 保存時 `location: location ? locationToRecord(location) : undefined`（319 行付近） |
| `src/components/screens/checkpoint-edit-screen.tsx` | `useState(parseLocation(post.location))`（74 行）、保存時 `locationToRecord`（94 行） |
| `src/components/screens/thread-detail-screen.tsx` | 表示（1243 行付近）を `parseLocation(cp.location)` 経由に。null なら表示しない |
| `src/lexicons/lexicon.test.ts` | 「`type` は lexicon 仕様の型のみ」「location の 3 プロパティは string」を追加 |
| `docs/architecture.md` | post 表の `location` の型を `{ latitude: string, longitude: string, altitude?: string }` に。旧 record の注記 |

### 1.8 純関数

`src/lib/location.ts`:
```ts
import type { Location, LocationRecord } from "@/lib/types";

/** 小数 7 桁 (約 1cm) に丸め、末尾の 0 と "." を落とす。"-0" は "0"。DECIMAL_PATTERN を満たす */
export function formatCoordinate(n: number): string;

/**
 * record の location を数値にする。number でも decimal string でも受ける。
 * - latitude は [-90, 90]、longitude は [-180, 180] の有限値。外れたら null
 * - altitude は任意。不正なら altitude だけ落として lat/lng は返す
 * - object でない・必須が無い・NaN・DECIMAL_PATTERN 不一致 → null
 */
export function parseLocation(raw: unknown): Location | null;

/** 保存用。3 値とも formatCoordinate。altitude が undefined ならキーを作らない */
export function locationToRecord(loc: Location): LocationRecord;
```
`src/lib/types.ts`:
```ts
/** record 上の位置。#64 以降は decimal string、それ以前の record は number */
export interface LocationRecord {
  latitude: string | number;
  longitude: string | number;
  altitude?: string | number;
}
```

`src/lexicons/lexicon.test.ts`（JSON を import して走査するだけ。実行時依存なし）:
- 4 本の JSON を再帰走査し、`type: "string"` で `maxGraphemes` を持つものは `maxLength >= maxGraphemes * 4`。
- `maxGraphemes` を持たない長さ付き string は許可リスト（`fieldDef.id`, `fieldOption.id`, `selectValue.field`,
  `selectValue.options.items`, `numberValue.field`, `numberValue.value`, `durationValue.field`, `textValue.field`,
  64-2 以降は `location.*`）に限られる。
- 定数の一致: `MAX_TAG_LENGTH === post.tags.items.maxGraphemes === thread.tags.items.maxGraphemes === thread.defaultTags.items.maxGraphemes === tagGroups.items.tags.items.maxGraphemes === fieldOption.label.maxGraphemes === tagEntry.tag.maxGraphemes`、
  `MAX_TAG_GROUP_LABEL_LENGTH === tagGroups.items.label.maxGraphemes`、`MAX_FIELD_LABEL_LENGTH === fieldDef.label.maxGraphemes`、
  `MAX_FIELD_UNIT_LENGTH === fieldDef.unit.maxGraphemes`、`MAX_TEXT_VALUE_LENGTH === textValue.text.maxGraphemes`、
  `MAX_NUMBER_VALUE_LENGTH === numberValue.value.maxLength`、`MAX_FIELD_ID_LENGTH === fieldDef.id.maxLength`。
- 配列上限の一致: `MAX_TAGS_PER_POST === post.tags.maxLength`、`MAX_FIELDS === thread.fields.maxLength === post.fields.maxLength`、
  `MAX_FIELD_OPTIONS === fieldDef.options.maxLength`、`MAX_TAG_INDEX_ENTRIES === tagIndex.tags.maxLength`、
  `MAX_TAGS_PER_THREAD === thread.tags.maxLength`、`MAX_DEFAULT_TAGS === thread.defaultTags.maxLength`。
- （64-2）走査したすべての `type` が `{boolean, integer, string, bytes, cid-link, blob, array, object, params, token, ref, union, unknown, record}` に含まれる。

### 1.9 受け入れ条件
- [ ] 64-1: 日本語 20 文字の項目名、8 文字の単位、64 文字のタグが lexicon 上の `maxLength` 以内（`maxGraphemes` 以内かつ UTF-8 バイト数が `maxLength` 以内）。
- [ ] 64-1: 既存 record は値を変えずに新 lexicon に適合する（広げる方向のみ。`npm test` の整合テストが通る）。
- [ ] 64-2: 新規投稿で位置情報を付けると `location.latitude` が `"35.6812362"` のような文字列で保存される。
- [ ] 64-2: 数値の `location` を持つ旧 post がタイムラインで従来どおり `35.6812, 139.7671` と表示される。
- [ ] 64-2: 旧 post を編集して保存すると `location` が文字列に正規化される。位置情報を触らない編集でも同様（`parseLocation → locationToRecord` を通るため）。
- [ ] 64-2: 投稿画面で「写真の位置を使う」の選択状態（`===` 比較）が壊れない（比較は `Location` 数値同士のまま）。
- [ ] `npm test` / `npm run lint` / `npm run build` 通過。

### 1.10 テストケース（`location.test.ts`）
- `formatCoordinate`: `35.68123456789 → "35.6812346"`、`139 → "139"`、`-0.00000001 → "0"`、`1e-7 → "0.0000001"`、`-139.5 → "-139.5"`。すべて `DECIMAL_PATTERN` を満たす。
- `parseLocation`: number 入力 / string 入力 / 混在 / `latitude: 91` → null / `longitude: "abc"` → null / `altitude: "x"` → altitude 無しで返す / `null`・配列・必須欠落 → null。
- 往復: `parseLocation(locationToRecord(loc))` が `loc` と 1e-7 以内で一致。altitude 無しならキーが無い。

---

## 2. #74 記録帳で数値・時間の範囲絞り込み

> **注記（2026-10-28）**: §5 のユーザー判断により **duration は範囲絞り込みの対象外（number のみ）**。本節の duration に関する記述（D-4、parseRangeBound / numericValueOf / formatRangeBound の duration 分岐、単位「分」、duration のエラー文言・テスト）は無効。

### 2.1 何のために
「80 kg 以上」「60 分以内」のように number / duration 項目で記録を絞れるようにする。
record-mode.md §8 U-1 で見送った分。select・自由タグ・検索と同じ AND の枠組みに入れる。

### 2.2 現状（事実）
- `RecordFilter = { fields, tags, query, unrecorded }`（record.ts）。`applyRecordFilter` は
  unrecorded → fields → tags → query の順。タイムラインは `{ timeline: true }` で fields / tags のみ。
- 絞り込みバー `FieldFilterBar` はタイムラインと記録帳で共有（props 同じ、記録帳は `className=""`）。
- チップ件数はファセット方式（`fieldFilterGroups` / `freeTagChips` が「自分以外の条件」で base を作る）。
- `summarizeNumber / summarizeDuration` で値の抽出ロジック（`isValidDecimal`、`seconds`）がある。
- 時間の入力は投稿画面で 時 / 分 / 秒 の 3 欄（`FieldInputs`）。

### 2.3 決定
- **D-1** 範囲は `RecordFilter.ranges` に持ち、**タイムラインと記録帳の両方に効く**（バーが共有で、
  select と同じ「項目の条件」だから）。record-mode.md §3.1「項目 × タグ × 検索 × 未記録: すべて AND」に
  「× 範囲」を足す。§3.3 のとおり URL には載せない。
- **D-2** `ranges` は **入力欄の生文字列**を持つ（`{ min: string; max: string }`）。解釈は読み取り側
  （`effectiveRange`）で行う。入力途中の不正値で state が揺れず、Clear / 復元が単純になる。
- **D-3** 境界は両端を含む。値を持たない投稿は（範囲が設定された項目では）一致しない。項目間 AND。
- **D-4** duration の入力単位は **分**（小数可、`1.5` = 90 秒。秒に四捨五入）。U-1 参照。
- **D-5** 範囲の行は select のチップ群の下、自由タグの上。折りたたまない（1 項目 1 行で軽い）。
- **D-6** ファセット件数は範囲も「他条件」に含める（select チップ・自由タグ・他項目の範囲）。
- **D-7** 入力中の再計算は遅延させない（投稿は多くて数百件、`useMemo` で足りる）。

### 2.4 変更ファイル（1 PR: `feature/fields-range-filter`、`Closes #74`）
| ファイル | 変更 |
|---|---|
| `src/lib/fields.ts` | 「範囲絞り込み (#74)」節を追加（§2.5）。`fieldFilterGroups` / `freeTagChips` / `filterPostsByFieldsAndTags` に省略可の `ranges` 引数 |
| `src/lib/fields.test.ts` | 追加分のテスト |
| `src/lib/record.ts` | `RecordFilter.ranges`、`EMPTY_RECORD_FILTER.ranges = {}`、`isRecordFilterActive`、`applyRecordFilter`（両モードで範囲を当てる） |
| `src/lib/record.test.ts` | 追加分 |
| `src/components/ui/field-filter-bar.tsx` | 範囲の行、props `ranges` / `onRangeChange`、空判定・filtering 判定に範囲を含める |
| `src/components/record/record-log.tsx` | `ranges` の配線、`useMemo` deps、クリア |
| `src/components/screens/thread-detail-screen.tsx` | `setRange` コールバック、prune effect、`clearFilter` / `scrollToPost` で `ranges: {}` も空に |
| `docs/record-mode.md` | §3.1 / §3.2 / §5.2 に範囲を追記、§8 U-1 を「#74 で実装」に |

### 2.5 純関数（`src/lib/fields.ts` に追加）
```ts
/** 入力欄の生文字列。number は値、duration は分。両方空のキーは持たない */
export interface RangeInput { min: string; max: string }
export type RangeSelection = Record<string, RangeInput>;
export const EMPTY_RANGE_INPUT: RangeInput = { min: "", max: "" };

/** number / duration 項目か */
export function isRangeField(def: FieldDef): boolean;

/**
 * 境界 1 つを数値にする。trim 後に空なら null、解釈できなければ "invalid"。
 * number: DECIMAL_PATTERN かつ MAX_NUMBER_VALUE_LENGTH 以内 → Number()
 * duration: DECIMAL_PATTERN かつ 0 以上の「分」→ Math.round(分 × 60) 秒
 * select / text の def には常に "invalid"
 */
export function parseRangeBound(raw: string, def: FieldDef): number | null | "invalid";

/** 解釈できた境界だけ。両方 null なら null（= 条件にしない）。不正な側は無視する */
export function effectiveRange(
  input: RangeInput | undefined, def: FieldDef,
): { min: number | null; max: number | null } | null;

/** 投稿のその項目の数値。number は Number(value)（不正な decimal は null）、duration は seconds。無ければ null */
export function numericValueOf(post: HasFieldValues, def: FieldDef): number | null;

/** 境界を更新した新しい選択。両方空になったキーは削除。入力は変更しない */
export function setRangeBound(
  ranges: RangeSelection, fieldId: string, bound: "min" | "max", raw: string,
): RangeSelection;

/** 定義に無い・範囲項目でない id、両方空のキーを落とす。変化が無ければ同じ参照 */
export function pruneRangeSelection(ranges: RangeSelection, defs: FieldDef[]): RangeSelection;

/** 生文字列が 1 つでも入っているか（不正値でも true。クリアボタンの表示に使う） */
export function hasRangeInput(ranges: RangeSelection): boolean;

/**
 * 範囲で絞る。effectiveRange が null の項目は条件にしない。項目間 AND。
 * 値の無い投稿は一致しない。両端を含む。条件が無ければ同じ参照
 */
export function filterPostsByRanges<T extends HasFieldValues>(
  posts: T[], defs: FieldDef[], ranges: RangeSelection,
): T[];

export interface RangeFilterRow {
  field: FieldDef;
  input: RangeInput;                       // 無ければ EMPTY_RANGE_INPUT
  active: boolean;                         // effectiveRange !== null
  invalid: { min: boolean; max: boolean }; // parseRangeBound === "invalid"
  /** 全投稿での値の最小・最大（placeholder 用）。値が無ければ null。duration は秒 */
  span: { min: number; max: number } | null;
  /** 他条件（select・タグ・他項目の範囲）を当てた上で、この範囲に一致する件数 */
  count: number;
  /** 他条件を当てた上で、値を持つ投稿数 */
  withValue: number;
}
/**
 * 絞り込みバーの範囲行。定義順。対象は isRangeField の定義のうち
 * 「archived でなく、全投稿で値を持つ投稿が 1 件以上」か「入力が空でない」もの。
 * count / withValue の base は filterPostsByRanges(filterPostsByTags(filterPostsByFields(posts, defs, selection), tagKeys), ranges から当該項目を除いたもの)
 */
export function rangeFilterRows(
  posts: HasFieldValues[], defs: FieldDef[], selection: FieldSelection, tagKeys: string[], ranges: RangeSelection,
): RangeFilterRow[];

/** 入力欄・placeholder 用。number は String(n)、duration は 分（小数 1 桁、末尾 0 は落とす） */
export function formatRangeBound(value: number, def: FieldDef): string;

// 既存関数のシグネチャ変更（末尾に省略可の引数）
export function fieldFilterGroups(posts, defs, selection, tagKeys, ranges?: RangeSelection): FieldFilterGroup[];
  // base = filterPostsByRanges(filterPostsByTags(filterPostsByFields(posts, defs, others), tagKeys), ranges ?? {})
export function freeTagChips(posts, defs, selection, tagKeys, ranges?: RangeSelection): FreeTagChip[];
  // base = filterPostsByRanges(filterPostsByFields(posts, defs, selection), ranges ?? {})
export function filterPostsByFieldsAndTags<T>(posts, defs, selection, tagKeys, ranges?: RangeSelection): T[];
  // 項目 → タグ → 範囲。すべて空なら同じ参照
```

`src/lib/record.ts`:
```ts
export interface RecordFilter {
  fields: FieldSelection;
  tags: string[];
  ranges: RangeSelection;   // 追加。両モードで効く
  query: string;
  unrecorded: boolean;
}
// isRecordFilterActive: fields / tags / hasRangeInput(ranges) は timeline でも見る
// applyRecordFilter: unrecorded → fields → tags → ranges → query（timeline: true は unrecorded / query を飛ばす）
```

### 2.6 UI（`FieldFilterBar`）
- props 追加: `ranges: RangeSelection`、`onRangeChange: (fieldId: string, bound: "min" | "max", raw: string) => void`。
- `rows = useMemo(() => rangeFilterRows(posts, defs, selection, tagKeys, ranges))`。
  `groups.length === 0 && tags.length === 0 && rows.length === 0` なら `null`（今の条件に追加）。
- 行の見た目（select の項目行の後、自由タグの前。`space-y-2.5` の中）:
  - 見出し行: `field.label`（既存の `text-[11px] text-white/40`）。
  - 本体: `[min] 〜 [max] 単位` を 1 行に。入力は `type="text" inputMode="decimal"`、`w-20`、
    既存 `FieldInputs` の `inputClass` を `py-1.5 text-sm md:text-xs` に詰めたもの。
    `aria-label` = `${label} の下限` / `${label} の上限`。`placeholder` = `span` があれば
    `formatRangeBound(span.min)` / `formatRangeBound(span.max)`、無ければ空。
    単位: number は `def.unit`（無ければ出さない）、duration は「分」。
  - 右端: `active` なら件数バッジ `count`（既存 `countBadge` と同じ）と「×」ボタン（`aria-label="${label} の範囲を解除"`、
    min / max とも `""` にする = `onRangeChange` を 2 回）。
  - `invalid.min || invalid.max` なら行の下に `text-[11px] text-red-400`:
    number「数字で入力してください」、duration「分を数字で入力してください」。
- `filtering = Object.keys(selection).length > 0 || tagKeys.length > 0 || hasRangeInput(ranges)`。
  「クリア」は親の `onClear`（親側で `ranges: {}` も空にする）。
- `fieldFilterGroups` / `freeTagChips` の呼び出しに `ranges` を渡す。
- 見出し「絞り込む / タグで絞り込む」の分岐は変えない。

`ThreadDetailScreen`:
- `const setRange = useCallback((fieldId, bound, raw) => setFilter(prev => ({ ...prev, ranges: setRangeBound(prev.ranges, fieldId, bound, raw) })), [])`。
- prune effect（`[posts, defs]`）に `pruneRangeSelection(prev.ranges, defs)` を追加（同じ参照なら更新しない）。
- `clearFilter`: `{ ...prev, fields: {}, tags: [], ranges: {} }`。`scrollToPost` で隠れる場合の解除も同じ 3 つ。
- `visiblePosts` は `applyRecordFilter(..., { timeline: true })` のままで範囲が効く。
- `FieldFilterBar` に `ranges={filter.ranges} onRangeChange={setRange}`。

`RecordLog`:
- `update({ ranges: setRangeBound(filter.ranges, fieldId, bound, raw) })`。`rows` の `useMemo` deps に `filter.ranges`。
- `FieldFilterBar` の `onClear` は `update({ fields: {}, tags: [], ranges: {} })`。
- `isPostUnrecorded` 等は変えない（範囲は「記録あり」の判定に関係しない）。

### 2.7 受け入れ条件
- [ ] 重量 kg の項目で下限 `80` を入れると、値 80 以上の投稿だけ残り、値の無い投稿は消える。上限だけ・両方も同様。両端を含む。
- [ ] クリアタイムの項目で上限 `60`（分）を入れると 3600 秒以下の投稿だけ残る。`1.5` は 90 秒として扱う。
- [ ] 範囲 × select × 自由タグ × 検索が AND になり、「N / total 件を表示中」の N と一覧が一致する。
- [ ] 範囲を入れた状態で select チップの件数が、範囲を当てた上の数になる（ファセット）。
- [ ] 不正な入力（`abc`、`-5` 分）は赤い注記が出て、絞り込みには効かない（他の条件はそのまま）。
- [ ] タイムラインと記録帳で範囲の入力が共有され、切り替えても残る。「クリア」で両方消える。
- [ ] 範囲項目の定義を非表示にする・削除すると、その入力が自動で消える（0 件から抜けられない状態にならない）。
- [ ] number / duration の無いスレッドでは範囲の行が出ず、見た目が今と同じ。
- [ ] `npm test` / `lint` / `build` 通過。

### 2.8 テストケース
`fields.test.ts`:
- `parseRangeBound`: number `"80"` → 80 / `" 12.5 "` → 12.5 / `""` → null / `"abc"` → "invalid" / `"1e3"` → "invalid" / 33 文字 → "invalid"。duration `"1.5"` → 90 / `"0"` → 0 / `"-1"` → "invalid" / `"0.004"` → 0（四捨五入）。select def → "invalid"。
- `effectiveRange`: 両方空 → null / min だけ / max 不正で min 有効 → `{min, max: null}`。
- `numericValueOf`: number の不正 decimal → null / duration / 値なし / fallback 投稿（tags のみ）→ null。
- `setRangeBound`: 追加 / 片側だけ空に / 両方空でキー削除 / 入力を変更しない。
- `pruneRangeSelection`: 定義に無い id / select の id / 両方空 を落とす / 変化なしで同じ参照。
- `filterPostsByRanges`: 両端を含む / 値なしは不一致 / 項目間 AND / 条件なしで同じ参照 / 不正入力は無視。
- `rangeFilterRows`: 定義順 / archived で非 active は出ない / 値を持つ投稿が無く入力も空なら出ない / `span` が全投稿基準 / `count` が他条件（select・タグ・他項目の範囲）を反映し自項目は当てない / `invalid` フラグ。
- `fieldFilterGroups` / `freeTagChips` / `filterPostsByFieldsAndTags`: `ranges` を渡すと件数が減る / 省略時は従来と同じ結果。
- `formatRangeBound`: number `12.5` → `"12.5"`、duration `90` → `"1.5"`、`3600` → `"60"`。

`record.test.ts`:
- `applyRecordFilter`: `ranges` が timeline でも効く / unrecorded・query と AND。
- `isRecordFilterActive`: 範囲の生文字列だけで true（timeline でも）。`EMPTY_RECORD_FILTER` は false。

---

## 3. #62 自分の旧投稿をタグから記録項目へ書き換える（任意）

### 3.1 何のために
tags からの読み取り（fallback）に頼っている旧投稿を `post.fields` に移し、選択肢を改名しても
追従するようにする。所有者の **自分の投稿だけ**を、本人の明示的な操作で、1 件ずつ書き換える。
custom-fields.md §3「書き込みルール」・§7「任意の書き換え（PR 6）」の実装。

### 3.2 現状（事実）
- 編集画面の保存は `buildEditedPostFields(post, defs, values, tags)` で「tags から読み取った選択を fields に書き、
  そのタグを tags から外す」を既にやっている（`checkpoint-edit-screen.tsx:83-98`）。本 issue は
  これと**同じ結果**を、画面を開かずに複数件に適用するもの。
- `updatePost` は putRecord 後に `notifyPostIndexed`（インデックスの cid 更新）と `touchThread`
  （スレッド `updatedAt` を now に）を呼ぶ。OG backfill は「活動ではない」として `updatedAt` を進めない前例がある。
- 一括処理の UI 前例: `og-backfill.ts` / `og-backfill-modal.tsx`（confirm → running → done、`AbortSignal` で停止、
  失敗は数えて続行）。
- `listPostsForThread` は全件取得済み。画面の `posts` に参加者の投稿も混ざる（`parseAtUri(post.uri).repo` で区別）。
- 記録帳に「整理」行（未記録チップ）がある（`record-log.tsx`）。
- dev（`127.0.0.1`）と本番は同じ PDS・同じアカウントに書く（OAuth の client_id が違うだけ）。

### 3.3 決定
- **D-1** 対象は `parseAtUri(post.uri).repo === myDid` かつ `post.fields` が**プロパティ不在**かつ
  `resolveFieldValues` に `source: "tags"` の値が 1 件以上ある投稿。参加者の投稿は書けないので対象外。
  `fields` を持つ投稿は（tags に選択肢名が残っていても）対象外。
- **D-2** 一致するタグが無い旧投稿には `fields: []` を**書かない**（書く必要が生じるのは、後から
  一致する選択肢を足したときだけ。そのときは本ツールの対象に自然に入る）。U-1 参照。
- **D-3** 書き込み内容は `buildEditedPostFields(post, defs, fieldValuesFromResolved(resolveFieldValues(post, defs)), post.tags ?? [])`
  の結果と同一にする（編集画面で何も触らず保存したのと同じ）。本文・写真・位置情報・`checkpointAt` は触らない。
  `location` の正規化（#64-2）も**しない**（論点を混ぜない）。
- **D-4** 書き込みは `rewritePost`（新設）: putRecord + `notifyPostIndexed`、**`touchThread` は呼ばない**
  （整理は活動ではない。OG backfill と同じ）。
- **D-5** 1 件ずつ直列。失敗は記録して次へ。「停止」は処理中の 1 件を終えてから止める（OG backfill と同じ）。
- **D-6** 再開は「もう一度開く」。対象は毎回 `posts` から計算し直すので、完了した分は自然に外れ、
  失敗した分・中断した分だけ残る。進捗の永続化はしない。
- **D-7** ドライラン = プレビュー画面。対象件数と先頭 20 件の変更内容を見せ、ここが確認ダイアログを兼ねる
  （二重の確認ダイアログは出さない）。「1 件だけ書き換える」を置き、本番 PDS で安全に試せるようにする。
- **D-8** 入口は記録帳の「整理」行（所有者のみ、対象 1 件以上のとき）。U-2 参照。
- **D-9** 終了したスレッド（`endedAt`）でも実行できる（投稿の編集は終了後も可能なため）。

### 3.4 変更ファイル（1 PR: `feature/fields-migrate-posts`、`Closes #62`）
| ファイル | 変更 |
|---|---|
| `src/lib/fields-migrate.ts` | **新規**。計画・record 組み立て・実行ループ（§3.5） |
| `src/lib/fields-migrate.test.ts` | **新規** |
| `src/lib/pds/posts.ts` | `rewritePost(rkey, record)` を追加（`updatePost` から `touchThread` を抜いたもの。コメントで用途を書く） |
| `src/components/record/field-migrate-panel.tsx` | **新規**。preview / running / done の 3 相 |
| `src/components/record/record-log.tsx` | 「整理」行に入口ボタン。props `migrateCount?: number`、`onOpenMigrate?: () => void` |
| `src/components/screens/thread-detail-screen.tsx` | `ModalKind` に `"fields-migrate"`、`migratePlans` の `useMemo`、`Modal` 内で `FieldMigratePanel` をマウント、閉じたら `refresh()` |
| `docs/custom-fields.md` | §7「任意の書き換え」を本節へのリンクに |

### 3.5 純関数（`src/lib/fields-migrate.ts`）
```ts
import type { FieldDef, FieldValue, PostRecord, PostWithMeta } from "@/lib/types";

export interface MigrationPlan {
  post: PostWithMeta;
  /** 書き込む fields（sanitize 済み。空でも [] — custom-fields §3 のルール） */
  fields: FieldValue[];
  /** 書き込む tags（sanitize 済み）。空なら undefined（キーを書かない） */
  tags: string[] | undefined;
  /** tags から外れるタグ（元の表記、元の順） */
  movedTags: string[];
  /** プレビュー用: 項目ごとに移る選択肢名 */
  moved: { field: FieldDef; labels: string[] }[];
}

/**
 * 対象なら計画、対象外なら null。
 * - post.fields がプロパティとして存在する → null
 * - defs に入力できる項目（非 archived）が無い → null（buildEditedPostFields が fields を書かないため）
 * - resolveFieldValues(post, defs) に source "tags" の値が無い → null
 * 書き込み内容は buildEditedPostFields(post, defs, fieldValuesFromResolved(resolved), post.tags ?? []) と同一
 */
export function planFieldMigration(post: PostWithMeta, defs: FieldDef[]): MigrationPlan | null;

/** 自分の repo の投稿だけを対象に。checkpointAt 昇順（sortByCheckpoint "asc"）。myDid が null なら [] */
export function planFieldMigrations(
  posts: PostWithMeta[], defs: FieldDef[], myDid: string | null,
): MigrationPlan[];

/** putRecord する record。{ ...stripRecordMeta(post), fields, tags }。tags が undefined ならキーを削除する */
export function migratedPostRecord(plan: MigrationPlan): PostRecord;

export interface MigrationFailure { uri: string; title: string; message: string }
export interface MigrationProgress {
  total: number;
  done: number;        // 成功 + 失敗
  succeeded: number;
  failed: number;
  aborted: boolean;    // 停止で途中終了した
  failures: MigrationFailure[];
  currentUri?: string;
}

/**
 * 1 件ずつ順に書く。失敗は failures に積んで続行。signal.aborted なら次に進まず aborted = true。
 * write は差し替え可能（テスト用）。既定は rewritePost(plan.post.rkey, migratedPostRecord(plan))。
 * 各件の前後で onProgress を呼ぶ（og/backfill.ts と同じ）。
 */
export async function runFieldMigration(
  plans: MigrationPlan[],
  opts?: {
    onProgress?: (p: MigrationProgress) => void;
    signal?: AbortSignal;
    write?: (plan: MigrationPlan) => Promise<void>;
  },
): Promise<MigrationProgress>;

/** プレビュー行の見出し。splitPostText(post.text).title を使う */
export function migrationRowTitle(plan: MigrationPlan): string;
```

`src/lib/pds/posts.ts`:
```ts
/**
 * 投稿の整理用の書き戻し（記録項目への移行 #62 など）。
 * updatePost と違い touchThread を呼ばない（整理は活動ではないので一覧の並びを動かさない）。
 * cid が変わるのでインデックスへの通知はする。
 */
export async function rewritePost(rkey: string, record: PostRecord): Promise<PostWithMeta>;
```

### 3.6 UI

`RecordLog`（整理行）:
- props: `migrateCount?: number`（親が `planFieldMigrations(...).length` を渡す）、`onOpenMigrate?: () => void`。
- 行の表示条件を `defs.length > 0 && (showUnrecorded || (canEdit && (migrateCount ?? 0) > 0))` に広げる。
- 未記録チップの右に、`canEdit && migrateCount > 0` のときだけボタン:
  文言「タグを記録項目に書き換え」+ 件数バッジ。見た目は未記録チップと同じ形で色は indigo
  （`border-dashed border-indigo-400/40 text-indigo-300 hover:bg-indigo-500/10`）。`onOpenMigrate`。

`FieldMigratePanel`（`src/components/record/field-migrate-panel.tsx`。`Modal` の中に描く。`maxWidth="md"`）:
```ts
props: { plans: MigrationPlan[]; onClose: (result: MigrationProgress | null) => void }
```
- phase `"preview"`:
  - 見出し「過去の投稿を記録項目に書き換えますか？」
  - 本文: 「あなたの投稿 **N 件** が、タグから記録項目を読み取っています。タグを記録項目の値に書き換え、
    対応するタグをタグ欄から外します。自由タグ・本文・写真・位置情報は変わりません。」
  - 注記（`text-xs text-white/40` の箇条書き）: 「参加者の投稿は対象になりません」「書き換えた投稿は編集画面で
    保存したのと同じ形になります。元のタグには戻せません」「処理中はこのタブを開いたままにしてください」
  - 一覧（先頭 20 件、`max-h-56 overflow-y-auto`）: 1 行 = `M/D`（`font-mono`）+ `migrationRowTitle`（truncate）+
    2 行目に `moved` を「項目名: 選択肢・選択肢」で。21 件目以降は「ほか n 件」。
  - ボタン: 「やめる」（`onClose(null)`）/ 「1 件だけ書き換える」（`plans.slice(0, 1)` で実行）/
    「N 件すべて書き換える」（主ボタン）。
- phase `"running"`: 見出し「書き換えています」、`done / total 件`、進捗バー、`currentUri` の投稿の
  `migrationRowTitle`、「停止」ボタン（`abort()`。モーダルの閉じる・ESC・背景クリックも停止にする）。
- phase `"done"`: 見出し「書き換えが完了しました」（aborted なら「停止しました」）。
  「成功 N 件 / 失敗 M 件（/ 未処理 K 件）」。失敗があれば `failures` を最大 10 件（タイトル + message）と
  「もう一度開くと、失敗した分と未処理の分だけが対象に残ります」。「閉じる」→ `onClose(progress)`。
- 実行は `runFieldMigration(plans, { onProgress: setProgress, signal })`。`AbortController` は `useRef`。

`ThreadDetailScreen`:
- `const migratePlans = useMemo(() => planFieldMigrations(posts, defs, myDid), [posts, defs, myDid])`
  （所有者でなければ `[]` になるが、`isOwner` の判定は early return の後なので `myDid` 基準でよい）。
- `RecordLog` に `migrateCount={migratePlans.length} onOpenMigrate={() => setModal("fields-migrate")}`。
- `modal === "fields-migrate"` で `<FieldMigratePanel plans={migratePlans} onClose={(r) => { closeModal(); if (r && r.succeeded > 0) void refresh(); }} />`。
  `modalMaxWidth` は `"md"` を返すよう分岐を足す（型を `"md" | "lg" | "2xl" | "3xl"` に広げる）。
- running 中は `Modal` の `onClose` で閉じない（パネル側で `onClose` を握り、停止にする）: `Modal` には
  パネルが持つ `requestClose` を渡す。既存の `og-backfill-modal.tsx` の `handleRequestClose` と同じ構造。

### 3.7 dev と本番が同じ PDS を使う点
- 本ツールはスレッド単位・自分の投稿のみ・「1 件だけ」で試せる。dev で試すときは **試験用スレッド**を作り、
  旧形式の投稿（`fields` 無し + 選択肢名のタグ）を 2〜3 件手で作ってから実行する。
  「ナゾトキ記録」で試すなら「1 件だけ」から。
- 環境ガードは入れない（本番と同じ挙動を dev で確認する価値の方が大きい）。

### 3.8 受け入れ条件
- [ ] 「ナゾトキ記録」（所有者）で記録帳を開くと、整理行に「タグを記録項目に書き換え 60」（タグ無し 16 件を除いた概数）のボタンが出る。参加者・未ログインには出ない。
- [ ] プレビューの件数と、先頭 20 件の「項目名: 選択肢」がタイムラインの表示（fallback の値）と一致する。
- [ ] 「1 件だけ書き換える」で 1 件だけ putRecord され、閉じると件数が 1 減り、その投稿のタグ欄から選択肢名のタグが消え、項目の値は変わらず表示される。
- [ ] 「すべて書き換える」の後、各項目チップの件数が実行前と一致する（読み取り元が tags → fields に変わるだけ）。
- [ ] 書き換え後の record は `fields` に `$type` 付きの `selectValue` を持ち、`tags` は自由タグだけ（空ならキー無し）。`text / images / location / exif / sourceRef / checkpointAt / createdAt` が変わらない。
- [ ] スレッドの `updatedAt` が変わらない（ダッシュボードの並びが動かない）。
- [ ] 「停止」で処理中の 1 件を終えて止まり、done に「停止しました」と未処理件数が出る。もう一度開くと未処理分だけが対象。
- [ ] 1 件の putRecord を失敗させる（ネットワーク切断等）と、失敗として数えて次に進み、done に失敗一覧が出る。
- [ ] 1 つだけの select に旧タグが 2 つ一致する投稿は、両方 `fields` に残る（`keepMultiple`）。
- [ ] `fields: []` を持つ投稿、参加者の投稿、一致タグの無い投稿は対象に含まれない。
- [ ] `npm test` / `lint` / `build` 通過。

### 3.9 テストケース（`fields-migrate.test.ts`）
- `planFieldMigration`: 対象（tags のみ・一致あり）/ `fields: []` → null / `fields` あり → null / 一致なし → null / 全項目 archived → null / 自由タグが残る / single に 2 つ一致 → 両方残り両タグが外れる / 大文字小文字違いのタグも外れる / `moved` が項目順。結果の `fields / tags` が `buildEditedPostFields(...)` と `JSON.stringify` で一致する。
- `planFieldMigrations`: 他人の repo を除く / `myDid: null` → [] / checkpointAt 昇順。
- `migratedPostRecord`: `uri / cid / rkey` を含まない / `tags` undefined でキーが無い / 他のプロパティ（`images`, `exif`, `sourceRef`, `location`）がそのまま。
- `runFieldMigration`（`write` をモック）: 全成功 / 2 件目が reject → failed 1・続行・failures に message / `signal` を 1 件目の後に abort → done 1・aborted true / `onProgress` の呼び出し回数と最後の値。

---

## 4. #31 共通ヘッダの導入: 履歴ベースの戻る

### 4.1 何のために
「プロフィール → スレッド → 戻る」でホームに飛ばされる導線を直し、戻る・アカウント導線を
全画面で同じ位置に置く。

### 4.2 現状（コードで確認した事実）
- 画面遷移は `src/app/page.tsx` の `currentScreen` 分岐。`useNavigation`（`use-navigation.ts`）が
  `history.pushState / replaceState` と `popstate` で URL と同期する。`history.state` は常に `{}`。
  コメントに「アプリ内に『戻る』は持たない」と明記。`navigate` は push 後に `window.scrollTo(0, 0)`。
- `replace: true` の使用: `login-screen.tsx:22`（ログイン後 → home）、`thread-create-screen.tsx:66`
  （作成後 → detail）、`thread-detail-screen.tsx:826`（削除後 → home）。
- `HomeLink`（`home-link.tsx`）の配置: `settings-screen.tsx:130`、`thread-create-screen.tsx:76`、
  `user-profile-screen.tsx:101` は本文フローの先頭（`<div className="mb-6">`、`-ml-2`）。
  `thread-detail-screen.tsx:1075` だけ **固定ヘッダー**（`fixed inset-x-0 top-0 z-40`、行は `h-14 max-w-3xl px-3`）
  の中で、背景層（高さ 80、`opacity = progress`）と各ボタンの黒半透明の丸背景（`0.35 * (1 - progress)`）が
  スクロールで変わる。タイトルは `progress * 1.4 - 0.4` で浮き出る。
- スレッド詳細のヘッダー右側: ブックマーク（ログイン中かつ非所有者、`aria-pressed`）、共有、
  ログインピル（未ログイン）、編集（所有者）。すべてアイコンのみ + `aria-label`。
- `ViewSwitch` は `sticky top-14 z-30 h-10`（ヘッダー 56px の直下）、日付バッジは `sticky top-24 z-10`。
  タイムライン容器は `pt-10`。
- ダッシュボード（`home-screen.tsx`）にヘッダーは無く、本文にプロフィール / 設定 / 新しいスレッドのボタン。
  ランディング（未ログインの `/`）は全面レイアウトでログインフォーム内蔵。
- プロフィール画面は所有者に設定の歯車（`user-profile-screen.tsx:168-182`）。
- 静的エクスポート（`output: "export"`）+ `functions/_middleware.ts` の SPA フォールバック。
  共有 URL から直接開くと `history.state` は null、履歴はそのページ 1 件。
- `auth-store` は `did / handle` を持つ。アバターは持たない。

### 4.3 決定
- **D-1** 「戻る」は **アプリ内の履歴深さ**で判断する。`history.state.depth` を push で +1、replace で据え置き、
  初回ロードで 0 に初期化。`depth > 0` なら `history.back()`、0 なら `navigate("home")`。
  これで共有 URL から入った人は home へ、アプリ内で辿った人は 1 つ前へ戻る。リロードしても
  `history.state` は残るので深さは保たれる。
- **D-2** 共通ヘッダー `AppHeader` は**各画面が自分で描く**（page.tsx で一括しない）。スレッド詳細の
  タイトル・アクションは画面しか知らないため。固定（`fixed top-0 h-14 z-40`）で全画面同じ位置。
- **D-3** 左端: home は Trailcast マーク、それ以外は「戻る」（`canGoBack` に関わらず常に出す。
  履歴が無ければ home に行く）。
- **D-4** 右端のアカウント導線: ログイン中は `UserIcon` 1 つ（→ 自分のプロフィール。設定はプロフィール画面と
  ダッシュボードに既にある）、未ログインは「ログイン」ピル。U-1 参照。
- **D-5** 画面固有のアクション（ブックマーク / 共有 / 編集）は `actions` として渡す。モバイルはアイコンのみ +
  `aria-label` / `title`、`md` 以上はアイコン + テキストのピルにして「見た目のラベル」を出す。U-3 参照。
- **D-6** ランディング（未ログインの `/`）と `/auth/callback` にはヘッダーを出さない。U-2 参照。
- **D-7** スレッド詳細の透過・フェード挙動は `overlay` + `progress` として `AppHeader` に移す。
  `ViewSwitch` の `top-14` と日付バッジの `top-24` は変えない（ヘッダー高さ 56px を維持）。
- **D-8** モーダル（投稿・編集・共有）は URL を持たないので、戻るボタンとは無関係のまま。
  ブラウザの戻るでモーダルを閉じる対応はしない（別 issue）。
- **D-9** `HomeLink` は 31-2 で削除。`use-navigation.ts` の「戻るは持たない」コメントを書き換える。
- **D-10** ダッシュボード本文のプロフィール / 設定ボタン（#26）は残す。

### 4.4 PR 分割
| # | ブランチ | 内容 | 依存 |
|---|---|---|---|
| 31-1 | `feature/app-header` | 履歴深さ + `back / canGoBack`、`AppHeader`、`ChevronLeftIcon`、settings / profile / create / login / home に適用 | — |
| 31-2 | `feature/app-header-thread-detail` | スレッド詳細のヘッダーを `AppHeader(overlay)` に置き換え、`HomeLink` 削除 | 31-1 |

31-1 は `Refs #31`、31-2 に `Closes #31`。

### 4.5 変更ファイル
31-1:
| ファイル | 変更 |
|---|---|
| `src/lib/nav-history.ts` | **新規**。深さの純関数（§4.6） |
| `src/lib/nav-history.test.ts` | **新規** |
| `src/lib/use-navigation.ts` | `depth` state、`back()`、`canGoBack`。`NavigationProps` に `back` / `canGoBack` を追加 |
| `src/app/page.tsx` | `nav = { navigate, params, back, canGoBack }` |
| `src/components/ui/icons.tsx` | `ChevronLeftIcon` 追加 |
| `src/components/ui/app-header.tsx` | **新規**（§4.7） |
| `src/components/screens/settings-screen.tsx` | `HomeLink` ブロックを削除、`<AppHeader leading="back" title="設定" maxWidth="3xl" />`、外側 `py-8` → `pb-8 pt-22` |
| `src/components/screens/user-profile-screen.tsx` | 同上。`title` = `profile?.handle ? "@" + handle : identifier`、`maxWidth="5xl"` |
| `src/components/screens/thread-create-screen.tsx` | 同上。`title="新しいスレッド"`、`maxWidth="2xl"` |
| `src/components/screens/login-screen.tsx` | `<AppHeader leading="back" title="ログイン" />`（画面構造は既存に合わせる） |
| `src/components/screens/home-screen.tsx` | ログイン中のダッシュボードに `<AppHeader leading="logo" maxWidth="5xl" />`、外側 `py-8` → `pb-8 pt-22`。ランディングは触らない |

31-2:
| ファイル | 変更 |
|---|---|
| `src/components/screens/thread-detail-screen.tsx` | 固定ヘッダー（1060〜1148 行付近）を `<AppHeader leading="back" overlay progress={progress} title={thread.title} maxWidth="3xl" actions={...} onLogin={() => setLoginOpen(true)} />` に。`HomeLink` / 各ボタンのインライン style を削除。not-found の「ホームに戻る」は残す |
| `src/components/ui/home-link.tsx` | 削除 |
| `src/lib/use-navigation.ts` | 仕様メモのコメントを「戻るは履歴深さで判断（nav-history.ts）」に |

### 4.6 純関数（`src/lib/nav-history.ts`）
```ts
export interface NavState { depth: number }

/** history.state から深さを読む。{ depth: 0 以上の整数 } 以外は 0 */
export function readDepth(state: unknown): number;

/** push するときの state（深さ +1） */
export function pushedState(current: unknown): NavState;

/** replace するときの state（深さ据え置き） */
export function replacedState(current: unknown): NavState;
```
`useNavigation`:
- mount 時: `const d = readDepth(history.state)`; `history.state` が `NavState` でなければ
  `history.replaceState({ depth: d }, "", 現在の path)`。`setDepth(d)`。
- `popstate`: `setDepth(readDepth(history.state))`（既存の `onPop` に追加）。
- `navigate`: push → `history.pushState(pushedState(history.state), "", next)` + `setDepth(d => d + 1)`。
  replace → `history.replaceState(replacedState(history.state), "", next)`（depth 不変）。
  同一 path のときは今までどおり何もしない。
- `back = useCallback(() => { if (depth > 0) history.back(); else navigate("home"); }, [depth, navigate])`。
- 戻り値に `back` と `canGoBack: depth > 0` を追加。`NavigationProps` 型も拡張。
- `scrollTo(0,0)` は push のときだけ（今と同じ）。`history.back()` のスクロール位置はブラウザの復元に任せる。

### 4.7 UI（`src/components/ui/app-header.tsx`）
```ts
export interface HeaderAction {
  key: string;
  label: string;            // aria-label / title / md 以上の表示文字
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;        // aria-pressed（ブックマーク）
  tone?: "default" | "accent";   // accent = text-amber-300（ブックマーク済み）
}
export interface AppHeaderProps {
  navigate: NavigationProps["navigate"];
  back: NavigationProps["back"];
  leading: "logo" | "back";
  title?: string;
  /** 0..1。overlay のときタイトルと背景の不透明度。省略時 1 */
  progress?: number;
  /** ヒーローの上に透過で重ねる（スレッド詳細） */
  overlay?: boolean;
  actions?: HeaderAction[];
  /** 未ログイン時の「ログイン」の動作。省略時 navigate("login") */
  onLogin?: () => void;
  /** 本文のコンテナ幅に合わせる。既定 "5xl" */
  maxWidth?: "2xl" | "3xl" | "5xl";
}
```
- 外枠: `fixed inset-x-0 top-0 z-40`（`pointer-events-none`、行は `pointer-events-auto`。今のスレッド詳細と同じ）。
- 背景: `overlay` なら今のグラデーション層（高さ 80、`opacity = progress`）。そうでなければ
  `h-14 bg-surface-950/90 backdrop-blur border-b border-white/5`。
- 行: `mx-auto flex h-14 max-w-{maxWidth} items-center gap-2 px-3`。
- 左: `leading === "back"` → `size-10 rounded-full` ボタン、`ChevronLeftIcon`、`aria-label="戻る"`、`onClick={back}`。
  `leading === "logo"` → `TrailcastMarkIcon` のボタン（`aria-label="Trailcast"`、`navigate("home")`）。
- タイトル: `min-w-0 flex-1 truncate px-1 text-[15px] font-semibold`。`overlay` なら
  `opacity = max(0, progress * 1.4 - 0.4)`、`aria-hidden = progress < 0.3`（今と同じ）。それ以外は常に表示。
  `title` が無ければ空の `flex-1` スペーサー。
- アクション: `size-10 rounded-full`。`md:` では `md:w-auto md:px-3 md:gap-1.5` にしてラベルを
  `<span className="hidden md:inline text-xs font-medium">` で出す。`overlay` なら各ボタンに
  `backgroundColor: rgba(0,0,0,0.35*(1-progress))` と `blur(6px)`（`progress < 0.95` のとき）。今の style をそのまま。
- アカウント: `useAuthStore` を読む。ログイン中 → `UserIcon` ボタン（`aria-label="プロフィール"`、
  `navigate("user-profile", { userIdentifier: handle ?? did })`）。未ログイン → 既存のログインピル
  （スレッド詳細の `from-indigo-500 to-violet-500` のもの）、`onLogin ?? (() => navigate("login"))`。
  `isLoading` 中はどちらも出さない。
- 各画面の本文: `pt-22`（56px + 32px）。`py-8` を `pb-8 pt-22` に置き換える。

スレッド詳細（31-2）の `actions`:
```ts
[
  ...(isAuthenticated && !isOwner ? [{ key: "bookmark", label: bookmarkRkey ? "ブックマーク済み" : "ブックマーク",
      icon: <StarIcon filled={Boolean(bookmarkRkey)} className="size-5" />, onClick: toggleBookmark,
      disabled: bookmarkRkey === undefined || bookmarkBusy, pressed: Boolean(bookmarkRkey),
      tone: bookmarkRkey ? "accent" : "default" }] : []),
  { key: "share", label: "共有", icon: <ShareIcon className="size-5" />, onClick: () => setModal("share") },
  ...(isOwner ? [{ key: "edit", label: "編集", icon: <EditIcon className="size-5" />, onClick: handleEditThread }] : []),
]
```
`progress` の計算（`heroRef` / scroll effect）は画面に残す。

### 4.8 受け入れ条件
- [ ] ダッシュボード → プロフィール → スレッド → 「戻る」でプロフィールに戻り、もう一度「戻る」でダッシュボードに戻る。
- [ ] 共有 URL（スレッド詳細）を新しいタブで直接開いて「戻る」を押すとホーム（未ログインならランディング）に行く。サイト外に出ない。
- [ ] スレッド詳細でリロードしてから「戻る」を押しても、リロード前と同じ戻り先になる。
- [ ] スレッド作成 → 詳細（replace）→ 「戻る」で `/new` に戻らずダッシュボードに戻る。
- [ ] スレッド削除 → ホーム（replace）の後、ブラウザの戻るで削除済み URL に戻っても「スレッドが見つかりません」が出て落ちない（今と同じ）。
- [ ] 全画面でヘッダーが `top-0` に固定され、本文がヘッダーに隠れない（settings / profile / create / login / dashboard / thread-detail）。
- [ ] スレッド詳細のヒーローの上でヘッダーが透過し、スクロールでタイトルが浮き出る（今の挙動と同じ）。`ViewSwitch` と日付バッジの貼り付き位置が変わらない。
- [ ] ログイン中はヘッダー右端の人型アイコンで自分のプロフィールへ行ける。未ログインはスレッド詳細で「ログイン」を押すとログインモーダルが開く（今と同じ）。
- [ ] `md` 以上でスレッド詳細のアクションに「共有」「編集」「ブックマーク」の文字が出る。モバイルはアイコンのみで `aria-label` がある。
- [ ] `HomeLink` への参照が残っていない（`grep -r HomeLink src` が空）。
- [ ] `npm test` / `lint` / `build` 通過。

### 4.9 テストケース（`nav-history.test.ts`）
- `readDepth`: `null` → 0 / `{}` → 0 / `{ depth: 3 }` → 3 / `{ depth: -1 }` → 0 / `{ depth: "2" }` → 0 / `{ depth: 1.5 }` → 0。
- `pushedState`: `null` → `{ depth: 1 }` / `{ depth: 2 }` → `{ depth: 3 }`。
- `replacedState`: `null` → `{ depth: 0 }` / `{ depth: 2 }` → `{ depth: 2 }`。
- 手動確認（jsdom 無しのため）: §4.8 の 1〜5 を PR 本文にチェックリストとして貼る。

---

## 5. ユーザー判断（2026-10-28 決定）

| # | 決定 |
|---|---|
| #64 U-1 | **A**。緯度経度を decimal string に。読み取りは number / string 両対応。既存 record は書き換えない |
| #74 U-1 | **推薦を変更**: duration は範囲絞り込みの対象外（**number のみ**）。§2 の duration に関する記述（D-4、parseRangeBound の duration、単位「分」、エラー文言など）は無効。duration 項目には範囲の行を出さない |
| #62 U-1 | **A**。一致タグの無い旧投稿には何も書かない |
| #62 U-2 | **A**。記録帳の「整理」行 |
| #31 | **保留**。着手するときは推薦案（U-1 A / U-2 A / U-3 A）でまずモックを作り、ユーザー確認後に実装 |

## 6. 追加の決定: duration 項目の扱い（2026-10-28、#85）

- 投稿・編集画面の duration 入力を、時・分・秒の 3 欄から**自由入力 1 欄**に変える。保存は従来どおり `durationValue.seconds`（整数秒）。
- 解析 `parseDurationInput(input: string): number | null | "invalid"`（`src/lib/fields-format.ts`）。NFKC → trim。空なら null。受け付ける形:
  - `h:mm:ss` / `m:ss`（例 `1:23:45` → 5025、`23:45` → 1425）。コロン区切りの 2 つ目以降は 0〜59
  - 日本語単位: `1時間23分45秒`、`83分`、`90秒`、`1時間`、`1時間半`（= 90 分）、`2分半`（= 150 秒）。各部は省略可、空白は無視
  - 英字単位: `1h23m45s`、`83m`、`90s`（大文字小文字無視）
  - 数字だけ（小数可）は**分**とみなす（`45` → 2700、`1.5` → 90）。秒に四捨五入
  - 上記以外・負数は "invalid"（入力欄にエラー「時間の形式で入力してください（例: 1:23:45、83分）」、送信不可）
- 編集画面の初期値は `formatDuration(seconds)` の文字列。入力中の文字列は state に保持し、blur で正規化表示はしない（ユーザーの入力を書き換えない）。
- 表示（タイムラインのチップ、記録帳）は従来どおり `formatDuration`。
- **ふりかえり（5b / 5c）の集計から duration を外す**: 数値カード（件数/合計/平均/最大/最小）、推移、月別の指標の選択肢に duration 項目を出さない。number だけ。
- 範囲絞り込み（#74）も number のみ（§5）。

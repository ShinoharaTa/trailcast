# Trailcast 記録モード（絞り込み / 記録帳 / ふりかえり）実装仕様

作成: 2026-10-27 / 担当: spec-writer
対象: `origin/integration/custom-fields` @ d2ed786（#63 / #65 / #66 / #70 入り）
対応 issue: #60（PR4）, #61（PR5）。データモデルは [custom-fields.md](./custom-fields.md) が正。
配置先: `docs/record-mode.md`

---

## 0. 何のために

謎解き・筋トレ・サイクリングの記録を、**後から探して見返す（記録帳）** と
**傾向をつかむ（ふりかえり）** ができるようにする。今のスレッド詳細はタイムラインしか
なく、タグの絞り込みも `tagGroups`（文字列集合）前提で、記録項目（#63 で入った
`thread.fields` / `post.fields`）を活かせていない。

ユーザー決定（固定）:
- スレッド詳細の最上位に「タイムライン / 記録」の切り替え。「記録」の中に
  「記録帳 / ふりかえり」のタブ。
- 既存のタイムラインの見た目は壊さない。モック（`trailcast-record-mode.html`）の
  構成・雰囲気に合わせる。
- スレッドごとに既定の表示を所有者が選べる。
- 未設定の投稿を拾うチップを置く。

---

## 1. 現状の事実（コードで確認）と推測

### 事実
- **投稿は既に全件取得している。** `listPostsForThread()`（`src/lib/pds/threads.ts`）は
  所有者 + 参加者（インデックス上位 24 人）の repo を `listAllRecordsViaPds` で
  cursor が尽きるまで読む（100 件/ページ × 50 ページ = repo あたり 5000 件で打ち切り、
  超えたら `console.warn`）。画面の `posts` state は常に全件。
  → **集計のための追加ページングは不要。** 全モードが同じ `posts` を純関数で加工する。
- 絞り込みの現状: `selectedTagKeys: string[]`（AND）。`TagFilterBar` は
  `countTags → groupTagCounts(counts, thread.tagGroups)` でチップを出し、
  `countWithTagAdded` が 0 件になるチップを無効化。`PostTags` の各タグも同じトグル。
- `groupTagCounts` の UI 側の消費者は `TagFilterBar` のみ。`fields.test.ts:120` 付近で
  変換の件数一致テストが参照している。
- `thread-edit-screen.tsx` は `initialSection?: "tagGroups"` でタググループ節へ
  スクロールする。記録項目節には ref が無い。
- fields 系の純関数（`src/lib/fields.ts`）に `resolveFieldValues`（fallback 込み）、
  `countSelectOptions`（定義順 + 末尾 `FIELD_UNSET`）、`filterPostsByFields`
  （項目内 OR / 項目間 AND / `FIELD_UNSET` で未設定一致）、`summarizeNumber` /
  `summarizeDuration`（count/sum/avg/min/max）、`initialFreeTagsForEdit`
  （選択肢扱いになったタグを除いた自由タグ）が揃っている。
- 表示は `formatResolvedValue` / `formatDuration`（`fields-format.ts`）。
- URL は `/{did|handle}/{rkey}` のみ。`parsePathname` はクエリ文字列を見ない。
  3 段目以降のパスは thread-detail として無視される。
- `ThreadRecord.sortOrder` は「既定と同じなら書かない」慣習（`thread-edit-screen.tsx:339`）。
- テストは vitest、`src/**/*.test.ts`、jsdom なし（`vitest.config.mts`）。
- 依存にグラフライブラリは無い。`@atproto/api` + Next が主なバンドル。
- タイムラインの日付グループは `toDateString()`（**ブラウザのローカル時刻**）。

### 推測
- 「ナゾトキ記録」76 件が現状の最大。参加者が多い Public スレッドでも数百件規模。
  O(posts × defs) の素朴な集計を `useMemo` で回せば十分。
- スマホ（375px）幅が主。横に長いグラフは横スクロール容器に入れれば足りる。

---

## 2. PR 分割

| # | ブランチ | 論点 | 依存 | 目安 |
|---|---|---|---|---|
| **4** | `feature/fields-filter` | タイムラインの絞り込みを「select 項目 + 自由タグ」に置き換え。`groupTagCounts` 経路の廃止 | #63/#65/#66 | 中 |
| **5a** | `feature/record-mode-log` | 「タイムライン / 記録」切り替え、記録帳（検索・絞り込み・一覧・未記録チップ）、既定表示の保存（lexicon `defaultView`） | 4 | 中 |
| **5b** | `feature/record-review-stats` | ふりかえり: 期間切替、KPI、select の件数・割合、number/duration の合計/平均/最大最小 | 5a | 中 |
| **5c** | `feature/record-review-charts` | ふりかえりのグラフ: 月別（件数 / 数値の合計・平均）、数値の推移、ヒートマップ。SVG 手書き | 5b | 中 |

- issue: 4 = #60、5a = #72、5b = #73、5c = #61。各 PR 本文に `Closes #<それぞれ>`、5a/5b は加えて `Refs #61`。
- 各 PR は単独でリリース可能: 4 は従来機能の置き換え、5a は記録帳だけでも使える、
  5b はグラフ無しの数字だけで成立、5c は装飾。
- 5a で lexicon の `defaultView` に `"review"` まで入れておく（5b で UI が追いつくまでは
  `"log"` にフォールバック。§4.4）。

---

## 3. 共通の設計判断（全 PR に効く）

### 3.1 絞り込みの意味論
- select 項目: **項目内 OR、項目間 AND**（`filterPostsByFields` のまま）。
- 自由タグ: **AND**（`filterPostsByTags` のまま）。
- 項目 × タグ × 検索 × 未記録: すべて AND。
- 「自由タグ」= `initialFreeTagsForEdit(post, defs)`。選択肢と一致したタグは
  項目側のチップにだけ出す（二重に出さない）。

### 3.2 チップの件数と無効化（ファセット方式）
モックに合わせ、件数は「**その項目以外の条件**を当てた上での該当数」にする。
- 項目内が OR なので、この数 = そのチップを足したときに増える件数。
- 自由タグも同じ考え（`countWithTagAdded(項目で絞った posts, tagKeys, key)`）。
- 表示: `total`（全投稿での件数）> 0 のチップだけ出す。選択中は total に関係なく出す。
- 無効化: 未選択かつファセット件数 0。
- archived の選択肢は非 archived の後ろに並べ、`title="入力画面では非表示の選択肢"`、
  文字色をひと段階落とす（`text-white/40`）。ラベルに「(旧)」は付けない。
- 未設定チップ: 項目ごとに `FIELD_UNSET`（ラベル「未設定」）。
  `countSelectOptions` の末尾要素をそのまま使う。

### 3.3 状態の持ち方
- 絞り込みは **URL に載せない**（モーダル類と同じ。`parsePathname` を触らない）。
- 表示モードも URL に載せない。初期値はスレッドの `defaultView`（§4.4）。
  閲覧者側の最後の選択は保存しない（§8 U-2）。
- すべての hook は `ThreadDetailScreen` の early return（`loading` / `!thread`）より
  **上**に置く。既存コメント（1039 行目）のとおり、下では hook を使えない。

### 3.4 日付の扱い
- 日付キー・月キーは **ブラウザのローカル時刻**（タイムラインの `toDateString()` と同じ）。
- 純関数は `now: Date` を引数で受け取る（テストで固定する）。
- `vitest.config.mts` の `test` に `env: { TZ: "Asia/Tokyo" }` を足し、テストの ISO 文字列は
  `+09:00` 付きで書く。

### 3.5 fields が無いスレッド
- PR4: 自由タグのチップだけのフラット表示（従来の `rest` 相当）。見出しは「タグで絞り込む」。
  `tagGroups` によるグループ分け表示は **廃止**（§8 D-1）。
- 5a: 記録帳は検索 + 自由タグで使える。未記録チップは出さない（項目が無いので）。
- 5b/5c: 件数系の KPI・月別・ヒートマップは出す。項目別の節は出さない。

---

## 4. PR4: `feature/fields-filter`（#60）

### 4.1 変更ファイル
| ファイル | 変更 |
|---|---|
| `src/lib/fields.ts` | 絞り込み UI 用の純関数を追加（§4.2） |
| `src/lib/fields.test.ts` | 追加分のテスト |
| `src/lib/tags.ts` | `groupTagCounts` / `GroupedTagCounts` に `@deprecated`（tagGroups 撤去時に削除）。関数は残す（テストが参照） |
| `src/components/ui/field-filter-bar.tsx` | **新規**。`TagFilterBar` を置き換える `FieldFilterBar`（5a で記録帳からも使う） |
| `src/components/screens/thread-detail-screen.tsx` | `TagFilterBar` 削除、`FieldFilterBar` 利用、state 追加、`PostFieldValues` の select 値をトグル可能に、空状態の文言 |
| `src/components/screens/thread-edit-screen.tsx` | `initialSection` を `"fields"` に変更（§4.4） |
| `docs/custom-fields.md` | §8 表の 4・5 行目に本書へのリンク |

### 4.2 追加する純関数（`src/lib/fields.ts`）

```ts
/** 項目 id → 選択した option id（FIELD_UNSET を含む）。空配列のキーは持たない */
export type FieldSelection = Record<string, string[]>;

/** 選択肢を押したときの新しい選択。あれば外し、無ければ足す。空になったキーは削除。入力は変更しない */
export function toggleFieldOption(
  selection: FieldSelection, fieldId: string, optionId: string,
): FieldSelection;

/**
 * 定義に無い項目・選択肢、全投稿で件数 0 の選択肢を選択から落とす。
 * 変化が無ければ同じ参照を返す（setState の無駄な更新を避ける）。
 * FIELD_UNSET は未設定件数 > 0 のときだけ残す。
 */
export function pruneFieldSelection(
  selection: FieldSelection, defs: FieldDef[], posts: HasFieldValues[],
): FieldSelection;

/** 自由タグ（選択肢扱いのタグを除く）の件数。countTags と同じ並び */
export function countFreeTags(posts: HasFieldValues[], defs: FieldDef[]): TagCount[];

export interface FieldFilterChip {
  optionId: string;            // option id または FIELD_UNSET
  label: string;               // option.label / "未設定"
  archived: boolean;
  total: number;               // 全投稿での件数
  count: number;               // 他条件（他項目 + タグ）を当てた上での件数
  active: boolean;
  disabled: boolean;           // !active && count === 0
}
export interface FieldFilterGroup { field: FieldDef; chips: FieldFilterChip[] }

/**
 * 絞り込みバーに出す select 項目ごとのチップ。
 * - 対象は type === "select" の定義（archived 含む）。定義順
 * - chips は options 順で非 archived → archived、最後に FIELD_UNSET
 * - total === 0 かつ非選択のチップは含めない。chips が空になった項目は返さない
 * - 項目が archived か、全投稿を通して値が 1 件も無い（未設定だけ）項目は、
 *   その項目の選択肢（FIELD_UNSET 含む）が 1 つも選択されていなければ返さない。
 *   値の有無は他条件を当てる前の total で判定する（他項目で絞って 0 件になっただけなら出す）。
 *   選択中なら解除できるように出す。archived な選択肢の扱いは上のとおり
 * - count は filterPostsByTags(filterPostsByFields(posts, defs, selection から当該項目を除いたもの), tagKeys) に対する countSelectOptions
 */
export function fieldFilterGroups(
  posts: HasFieldValues[], defs: FieldDef[], selection: FieldSelection, tagKeys: string[],
): FieldFilterGroup[];

export interface FreeTagChip extends TagCount { active: boolean; disabled: boolean; facetCount: number }
/**
 * 自由タグのチップ。並びは countFreeTags（件数順）。
 * facetCount = countWithTagAdded(filterPostsByFields(posts, defs, selection), tagKeys, key)
 * disabled = !active && facetCount === 0
 */
export function freeTagChips(
  posts: HasFieldValues[], defs: FieldDef[], selection: FieldSelection, tagKeys: string[],
): FreeTagChip[];

/** 項目 → タグの順で絞る。両方空なら同じ参照を返す */
export function filterPostsByFieldsAndTags<T extends HasFieldValues>(
  posts: T[], defs: FieldDef[], selection: FieldSelection, tagKeys: string[],
): T[];
```

境界条件:
- `defs` が空 → `fieldFilterGroups` は `[]`、`countFreeTags` は `countTags` と同じ、
  `pruneFieldSelection` は `{}`。
- `selection` に select 以外の項目 id があっても無視（`filterPostsByFields` と同じ）。
- 1 つだけの select で 2 値以上持つ旧投稿は全値を数える（custom-fields §5）。

### 4.3 UI

`FieldFilterBar` props:
```ts
{
  posts: PostWithMeta[];             // 絞り込み前の全投稿
  defs: FieldDef[];                  // thread.fields ?? []
  selection: FieldSelection;
  tagKeys: string[];
  onToggleOption: (fieldId: string, optionId: string) => void;
  onToggleTag: (key: string) => void;
  onClear: () => void;
  matchedCount: number;
  canEdit?: boolean;                 // 所有者
  onEditFields?: () => void;         // 記録項目の編集を開く
  hasLegacyTagGroups?: boolean;      // thread.tagGroups が残っている（変換案内の文言用）
}
```
- 見た目は今の `TagFilterBar` のまま（角丸パネル、チップ、クリア、件数表示）。
- 見出し: defs があれば「絞り込む」、無ければ「タグで絞り込む」。
- 項目ごとの行: 見出し = `field.label`（今のグループ見出しと同じスタイル）。
  チップ = `label` + 件数（`count`）。`FIELD_UNSET` チップは点線枠（モックの `.chip.todo`
  相当。色は amber ではなく `border-dashed border-white/20`）。
- 自由タグの行: 項目の下にフラットで `#tag` + 件数（`facetCount`）。
- 所有者リンク（右上、今の「グループを編集」の位置）:
  - defs あり → 「記録項目を編集」
  - defs なし & `hasLegacyTagGroups` → 「記録項目に変換」
  - どちらも無し → 「記録項目を追加」
  いずれも `onEditFields`。
- 何もチップが無い（投稿にタグも項目値も無い）なら `null`（今と同じ）。
- 絞り込み中の件数表示: 「N / total 件を表示中」。「すべてのタグを含む」の文言は削除。

`ThreadDetailScreen`:
- state: `fieldSelection: FieldSelection`（新規）、`selectedTagKeys`（既存）。
- `visiblePosts = filterPostsByFieldsAndTags(orderedPosts, defs, fieldSelection, selectedTagKeys)`。
- 既存の「消えたタグを選択から落とす」effect に加え、`pruneFieldSelection` を
  `[posts, thread.fields]` で回す。
- `PostFieldValues`: select 項目の値は `<button>` にし、押すと
  `onToggleOption(field.id, optionId)`（複数値は値ごとにボタン）。number/duration/text は
  今のまま `<span>`。選択中の値はタグと同じ強調（`bg-indigo-500/30 text-indigo-100`）。
- 空状態の文言: 「条件に合うチェックポイントはありません」。
- `modal` の `"thread-edit-tags"` を `"thread-edit-fields"` に改名し、
  `initialSection="fields"` を渡す。
- import から `groupTagCounts` を外す。`countWithTagAdded` は `freeTagChips` 内に移るので
  画面からは外す。

### 4.4 `thread-edit-screen.tsx`
- `initialSection?: "fields"` に変更。記録項目の節（「記録項目」見出しの `div`）に ref を
  付け、開いたら 50ms 後に `scrollIntoView`。tagGroups 節への自動スクロールと
  「空グループを 1 つ用意する」処理は削除。
- 他は触らない。

### 4.5 受け入れ条件
- [ ] fields の無いスレッド: 自由タグのフラットなチップで絞り込める（挙動は現状と同じ。グループ分け表示だけ無くなる）。
- [ ] 「ナゾトキ記録」で変換（#66 の変換ボタン）後、各項目のチップ件数が変換前のグループ件数と一致する（投稿は無変換）。
- [ ] `fields: []` を持つ投稿は、タグが選択肢名と同じでも項目側に数えられず、自由タグとして出る。
- [ ] 同一項目で 2 つ選ぶと OR、別項目で選ぶと AND になり、件数表示と一覧が一致する。
- [ ] チップの件数は他条件を当てた数になり、0 件のチップは押せない。
- [ ] 投稿カードの項目値（select）を押すと、その選択肢で絞り込まれる。
- [ ] 所有者には「記録項目を編集 / 変換 / 追加」のリンクが出て、スレッド編集の記録項目節が開く。
- [ ] 投稿の削除・編集で消えた選択肢・タグが選択から落ちる（0 件で抜けられない状態にならない）。
- [ ] `npm test` / `npm run lint` / `npm run build` が通る。

### 4.6 テストケース（`fields.test.ts`）
- `toggleFieldOption`: 追加 / 削除 / 空になったらキー削除 / 入力を変更しない。
- `pruneFieldSelection`: 定義に無い id を落とす / total 0 を落とす / `FIELD_UNSET` は未設定 > 0 で残す / 変化なしなら同じ参照。
- `countFreeTags`: 選択肢と一致するタグ（大小文字違い含む）を除く / `fields: []` の投稿のタグは残る / defs 空なら countTags と同じ。
- `fieldFilterGroups`: 定義順・options 順 / archived が後ろ / total 0 は出ない（選択中は出る）/ count は他項目 + タグを当てた数で自項目は当てない / `FIELD_UNSET` 末尾 / select 以外の定義は無視 / chips 空の項目は返さない / 値なし項目・archived 項目は出ない（選択中は出る）/ 他項目の絞り込みで 0 件になった項目は出る。
- `freeTagChips`: facetCount が項目条件を反映 / 選択中は disabled にならない。
- `filterPostsByFieldsAndTags`: 両方空なら同じ参照 / AND になる。
- 既存の「変換後の件数一致」テストは `fieldFilterGroups` でも同じ数になることを 1 本追加。

---

## 5. PR5a: `feature/record-mode-log`

### 5.1 変更ファイル
| ファイル | 変更 |
|---|---|
| `src/lexicons/net.shino3.trailcast.thread.json` | `defaultView` 追加（§5.4） |
| `src/lib/types.ts` | `ThreadView` 型、`ThreadRecord.defaultView?: ThreadView` |
| `src/lib/record.ts` | **新規**。記録帳の純関数（§5.2） |
| `src/lib/record.test.ts` | **新規** |
| `vitest.config.mts` | `test.env.TZ = "Asia/Tokyo"` |
| `src/components/ui/post-field-values.tsx` | **新規**。`PostFieldValues` を thread-detail-screen から移動（記録帳でも使う） |
| `src/components/record/view-switch.tsx` | **新規**。「タイムライン / 記録」+「記録帳 / ふりかえり」 |
| `src/components/record/record-log.tsx` | **新規**。記録帳パネル |
| `src/components/screens/thread-detail-screen.tsx` | view state、`RecordFilter` へ統合、パネル切り替え、投稿アンカー |
| `src/components/screens/thread-edit-screen.tsx` | 「既定の表示」の設定 |
| `docs/architecture.md` | thread record 表に `defaultView` |
| `docs/record-mode.md` | 本書 |

### 5.2 純関数（`src/lib/record.ts`）

```ts
export type ThreadView = "timeline" | "log" | "review";
export const THREAD_VIEWS: readonly ThreadView[] = ["timeline", "log", "review"];
export const DEFAULT_THREAD_VIEW: ThreadView = "timeline";

/**
 * 初期表示。未設定・未知の値は "timeline"。
 * available に無い値（5a 時点の "review"）は "log" に落とす。
 */
export function effectiveDefaultView(
  thread: Pick<ThreadRecord, "defaultView">,
  available: readonly ThreadView[] = THREAD_VIEWS,
): ThreadView;

/** 保存用。既定 ("timeline") なら undefined（sortOrder と同じ慣習） */
export function defaultViewForRecord(view: ThreadView): ThreadView | undefined;

export interface RecordFilter {
  fields: FieldSelection;   // PR4
  tags: string[];           // tagKey
  query: string;            // 記録帳のみ
  unrecorded: boolean;      // 記録帳のみ
}
export const EMPTY_RECORD_FILTER: RecordFilter;
export function isRecordFilterActive(f: RecordFilter, opts?: { timeline?: boolean }): boolean;
  // timeline: true なら fields / tags だけを見る

/** 記録項目が 1 つでも定義され、かつ値が 1 つも解決できない投稿（archived 項目の値も「記録あり」） */
export function isPostUnrecorded(post: HasFieldValues, defs: FieldDef[]): boolean;
export function countUnrecorded(posts: HasFieldValues[], defs: FieldDef[]): number;

/**
 * 検索語の正規化。normalize("NFKC") → trim → toLocaleLowerCase → 空白で分割（全角空白含む）。空なら []
 * NFKC で全角英数は半角（ＮＡＮＩＣＡ → nanica）、半角カナは全角（ｶﾌｪ → カフェ）に揃う
 */
export function parseQuery(query: string): string[];

/**
 * 検索対象の文字列（normalize("NFKC") → 小文字。parseQuery と同じ正規化）。本文、自由タグ、解決済みの項目値の表示文字列
 * （formatResolvedValue）、項目名は含めない。
 */
export function postSearchText(post: PostWithMetaLike, defs: FieldDef[]): string;

/** 全語を含む（AND, 部分一致）。query が空なら同じ参照 */
export function searchPosts<T extends PostLike>(posts: T[], defs: FieldDef[], query: string): T[];

/**
 * 記録帳の絞り込み。順に unrecorded → fields → tags → query。
 * opts.timeline が true なら fields / tags のみ（タイムライン用）。
 */
export function applyRecordFilter<T extends PostLike>(
  posts: T[], defs: FieldDef[], filter: RecordFilter, opts?: { timeline?: boolean },
): T[];

/** checkpointAt の並び替え（安定）。不正な日付は末尾 */
export function sortByCheckpoint<T extends { checkpointAt: string }>(posts: T[], order: ThreadSortOrder): T[];

/** 記録帳の 1 行に出す本文。先頭行を title、残りを note（空なら undefined）。title が無ければ「（本文なし）」 */
export function splitPostText(text: string | undefined): { title: string; note?: string };
```

`PostLike = { text?: string; tags?: string[]; fields?: FieldValue[]; checkpointAt: string }`。

### 5.3 UI

#### ViewSwitch（`view-switch.tsx`）
- タイムライン直上（`FieldFilterBar` の上）に置く。`sticky top-14 z-30 h-10` で、固定ヘッダー
  （56px）の直下に貼り付き、下端が `top-24`（96px）に来るので既存の DateBadge の
  sticky と重ならない。背景 `bg-surface-950/90 backdrop-blur`。
- 2 分割のセグメント（モックの `.seg` を 2 列に）: 「タイムライン」「記録」。
  サブ文言（「旅の流れで読む」等）は高さの都合で出さない。`aria-pressed`。
- 「記録」のときだけ、パネル内先頭に「記録帳 / ふりかえり」のタブ（非 sticky、
  `role="tablist"`）。5a では「ふりかえり」タブは **出さない**（5b で追加）。
- 切り替えで `window.scrollTo` はしない（ヘッダー下にあるため不要）。

#### ThreadDetailScreen
- `const [view, setView] = useState<ThreadView>("timeline")`。
  `thread.uri` が変わったときだけ `effectiveDefaultView(thread, ["timeline","log"])` で
  初期化（`refresh()` で thread オブジェクトが入れ替わっても上書きしない。前回の uri を
  ref で持つ）。
- `const [filter, setFilter] = useState<RecordFilter>(EMPTY_RECORD_FILTER)`。PR4 の
  `fieldSelection` / `selectedTagKeys` はここに統合。prune の effect は `filter.fields` /
  `filter.tags` に対して回す。
- タイムライン: `applyRecordFilter(orderedPosts, defs, filter, { timeline: true })`。
- 記録帳: `<RecordLog posts={posts} thread={thread} filter={filter} onFilterChange={...} onOpenPost={scrollToPost} canEdit={isOwner} onEditFields={...} />`。
- 各投稿カードの外側 `div` に `data-post-uri={cp.uri}` を付ける。
- `scrollToPost(uri)`: `setView("timeline")`、`filter.query / unrecorded` は残したまま
  （タイムラインは見ない）。該当投稿がタイムラインの条件で隠れる場合は `fields` と `tags`
  を空にする。`requestAnimationFrame` 2 回待ってから `querySelector([data-post-uri])` を
  `scrollIntoView({ block: "center" })`。
- FAB・モーダル・Lightbox は両モード共通で今のまま。
- タイムラインの空状態（投稿 0 件）の文言は今のまま。

#### RecordLog（`record-log.tsx`）
モックの記録帳パネルに合わせる。
- ツールバー（上から）:
  1. 検索欄: `<input type="search" inputMode="search" placeholder="本文・タグ・項目で探す">`。
     `useDeferredValue` で反映。
  2. `FieldFilterBar`（PR4）。props は同じ。`posts` は **unrecorded / query を当てる前の全件**。
  3. 未記録チップ（defs があるときだけ）: 行見出し「整理」、チップ「未記録 N」
     （点線 amber、モックの `.chip.todo`）。`countUnrecorded(posts, defs)` が 0 なら行ごと出さない。
- 結果バー: 「**N** 件」+ 右に「新しい順 / 古い順」トグル（初期値 `effectiveSortOrder(thread)`）
  + 絞り込み中なら「クリア」（`filter` を `EMPTY_RECORD_FILTER` に）。
- 一覧（`<ul>`）: 1 行 = `grid-cols-[62px_1fr]`
  - 左: `M/D` と年（`font-mono`、年は小さく）。同じ日が続いても毎行出す（一覧なので）。
  - 右: `splitPostText` の title（`font-semibold`、1 行 truncate）、note（`text-white/40`、
    `line-clamp-2`、`whitespace-pre-line`）、`PostFieldValues`（PR4 と同じトグル付き）、
    自由タグ（`PostTags` と同じ見た目・トグル）、写真があれば「写真 n」の小さな表示、
    `isPostUnrecorded` なら「未記録」（amber の小文字）。
  - 行全体はボタンではなく、左の日付部分とタイトルを `<button>` にして `onOpenPost(uri)`
    （チップのトグルと競合させない）。
- 空状態: 「条件に合う記録はありません」+「クリア」。
- 投稿 0 件: 「まだチェックポイントがありません」。

#### thread-edit-screen
- 「チェックポイントの並び順」の下に「既定の表示」節: `role="radiogroup"`、
  「タイムライン」「記録帳」（5b で「ふりかえり」を追加）。初期値
  `effectiveDefaultView(thread, 利用可能な値)`。
- 保存: `defaultView: defaultViewForRecord(view)`。dirty 判定に `view !== 初期値` を追加。
- 終了スレッドでもこの設定は編集可（表示の話なので凍結しない）。

### 5.4 lexicon 追加（`net.shino3.trailcast.thread`）
```jsonc
"defaultView": {
  "type": "string",
  "knownValues": ["timeline", "log", "review"],
  "description": "Which view the thread detail opens in: 'timeline' (default when absent), 'log' (searchable list), or 'review' (stats). Display preference only; does not affect stored posts."
}
```

### 5.5 受け入れ条件
- [ ] 「タイムライン / 記録」を切り替えてもタイムラインの見た目・挙動（日付バッジ、年区切り、FAB、編集・削除）が変わらない。
- [ ] 記録帳で検索語を入れると本文・自由タグ・項目値のいずれかに部分一致する投稿だけ残る（AND、大小文字無視）。
- [ ] 記録帳の項目チップ・自由タグチップはタイムラインと同じ選択を共有し、切り替えても維持される。
- [ ] 「未記録」チップで、項目値が 1 つも無い投稿だけになる。fields の無いスレッドでは出ない。
- [ ] 記録帳の行を押すとタイムラインのその投稿までスクロールする（絞り込みで隠れていた場合は項目・タグの絞り込みが解除される）。
- [ ] 所有者がスレッド編集で「記録帳」を既定にすると、次回以降そのスレッドは記録帳で開く。参加者・未ログインの閲覧でも同じ。未設定なら `defaultView` を record に書かない。
- [ ] `defaultView: "review"` の record を 5a で開くと記録帳で開く。
- [ ] 旧 record（`defaultView` なし）はタイムラインで開く。
- [ ] `npm test` / `lint` / `build` 通過。

### 5.6 テストケース（`record.test.ts`）
- `effectiveDefaultView`: 未設定 → timeline / 未知の文字列 → timeline / "review" が available に無い → log / ある → review。
- `defaultViewForRecord`: timeline → undefined / log → "log"。
- `isPostUnrecorded` / `countUnrecorded`: defs 空 → false / fallback で解決できる旧投稿 → false / `fields: []` → true / archived 項目にだけ値 → false。
- `parseQuery`: 全角空白 / 大文字 / 空。
- `postSearchText` / `searchPosts`: 本文一致 / 自由タグ一致 / 選択肢名一致（fallback の投稿も）/ number の値と単位 / 項目名では一致しない / 2 語 AND / 空 query で同じ参照。
- `applyRecordFilter`: 順序に依らず AND / `timeline: true` で query・unrecorded を無視。
- `sortByCheckpoint`: 安定 / 不正日付は末尾。
- `splitPostText`: 1 行 / 複数行 / 空 / 先頭の空行を飛ばす。

---

## 6. PR5b: `feature/record-review-stats`

### 6.1 変更ファイル
| ファイル | 変更 |
|---|---|
| `src/lib/review.ts` / `review.test.ts` | **新規**。集計の純関数 |
| `src/components/record/record-review.tsx` | **新規**。ふりかえりパネル（数字だけ） |
| `src/components/record/view-switch.tsx` | 「ふりかえり」タブ追加 |
| `src/components/screens/thread-detail-screen.tsx` | `available` に `"review"`、`RecordReview` のマウント、「記録帳へ」ジャンプ |
| `src/components/screens/thread-edit-screen.tsx` | 既定の表示に「ふりかえり」 |

### 6.2 純関数（`src/lib/review.ts`）

```ts
export type PeriodKey = "all" | "3m" | "1y" | `y:${number}`;
export interface Period { key: PeriodKey; label: string }   // "全期間" "直近3か月" "直近1年" "2026年"

/** 固定 3 つ + 投稿がある年（新しい順、最大 5）。投稿が 0 件なら固定 3 つだけ */
export function availablePeriods(posts: { checkpointAt: string }[], now: Date): Period[];

/** [from, to) をローカル時刻で。all は両方 null。3m = now の 3 か月前の同時刻から、1y 同様、y:N = その年 */
export function periodRange(key: PeriodKey, now: Date): { from: Date | null; to: Date | null };
export function filterByPeriod<T extends { checkpointAt: string }>(posts: T[], key: PeriodKey, now: Date): T[];

/** "YYYY-MM-DD"（ローカル）。不正なら null */
export function dayKey(iso: string): string | null;
export function monthKey(iso: string): string | null;   // "YYYY-MM"

export interface ReviewKpis {
  count: number;
  activeDays: number;                            // dayKey のユニーク数
  perMonth: number | null;                       // count / spanMonths（count 0 なら null）
  spanMonths: number;                            // 最初〜最後の投稿の月数（最低 1、小数）
  busiestDay: { day: string; count: number } | null;
}
export function reviewKpis(posts: { checkpointAt: string }[]): ReviewKpis;

export interface OptionShare {
  optionId: string; label: string; archived: boolean;
  count: number;
  share: number;        // count / total（0..1）。total 0 なら 0
}
/**
 * select 項目の分布。countSelectOptions を件数降順（同数は options 順）に並べ替え、
 * share の分母は posts.length（未設定を含む）。unset は別に返す。
 * count 0 の選択肢は含めない。
 */
export function optionShares(posts: HasFieldValues[], def: FieldDef): { total: number; items: OptionShare[]; unset: number };

export interface NumericCard extends NumericSummary {
  /** 時系列（checkpointAt 昇順）。推移グラフ（5c）用 */
  series: { at: string; value: number }[];
}
export function numericCard(posts: PostLike[], def: FieldDef): NumericCard;   // number / duration 共通

/** number は scale 桁で丸め（scale 未設定は 1 桁）、duration は formatDuration。null は "—" */
export function formatStat(value: number | null, def: FieldDef): string;
```

### 6.3 UI（`record-review.tsx`）
モックの ふりかえり パネルに合わせる。上から:
1. 期間チップ（`availablePeriods`）。初期値 `"all"`。state は `RecordReview` 内（記録帳と共有しない）。
2. KPI 4 枚（モックの `.kpis`、2 列 × 2 行 on mobile）:
   「記録」count 件 / 「活動日」activeDays 日 / 「月あたり」perMonth（小数 1 桁）/
   「1 日最多」busiestDay.count 件（下に日付 `M/D`）。
3. select 項目ごとの節（`optionShares`）: 見出し = `field.label`、副題「複数選択は延べ数」
   （`multiple` のときのみ）。横棒（モックの `.bar`、`fill` は単色 indigo）+ 右に「N件 P%」。
   上位 8 件、残りは「ほか n 件を表示」で展開。末尾に未設定（unset > 0 のとき、点線）。
   **棒を押すと記録帳へ**: `onJumpToLog({ fields: { [field.id]: [optionId] } })`
   → 親が `filter` をそれだけに置き換え、`view = "log"`。期間は持ち越さない（記録帳に
   期間が無いため。画面に「期間は記録帳に引き継がれません」とは書かない）。
4. number / duration 項目ごとのカード（`numericCard`）: 見出し = label（+ unit）。
   行に 件数 / 合計 / 平均 / 最大 / 最小（duration は 最長 / 最速 と表記）。count 0 なら
   「この期間の記録はありません」。
5. 項目が無いスレッドは 1・2 だけ。
- text 項目は出さない。archived 項目は値が 1 件以上あるときだけ出す。
- `thread-detail-screen`: `available` を `THREAD_VIEWS` に、`defaultView: "review"` で
  ふりかえりが開く。

### 6.4 受け入れ条件
- [ ] 「ナゾトキ記録」で、種類・成否・団体の件数が記録帳の全件チップの件数と一致する。
- [ ] 期間「直近3か月」で件数・分布が変わり、「全期間」で戻る。年チップは投稿のある年だけ出る。
- [ ] 分布の棒を押すと記録帳がその選択肢で絞られた状態で開く。
- [ ] number 項目で `12.5` と `7` の 2 件 → 合計 19.5、平均 9.8（scale 1）、最大 12.5、最小 7。
- [ ] duration 項目は `m:ss` / `h:mm:ss` で、最速 = 最小。
- [ ] 項目の無いスレッドで KPI だけ出て落ちない。投稿 0 件で落ちない。
- [ ] `defaultView: "review"` で開くとふりかえりが初期表示。

### 6.5 テストケース（`review.test.ts`）
- `periodRange` / `filterByPeriod`: all / 3m の境界（ちょうど 3 か月前は含む、now は含む）/ y:2025 の 1/1 00:00 と 12/31 23:59:59 / 不正日付は除外。
- `availablePeriods`: 年の並び（新しい順）/ 最大 5 / 投稿 0 件。
- `dayKey` / `monthKey`: JST の日付跨ぎ（`2026-06-30T23:30:00+09:00` → `2026-06-30`、UTC 換算で日が変わるケース）。
- `reviewKpis`: 同日 3 件 → activeDays 1、busiestDay / 1 件だけ → spanMonths 1, perMonth = 1 / 0 件 → null。
- `optionShares`: 降順・同数は定義順 / 分母に未設定を含む / count 0 は含まない / multiple の延べ数 / archived。
- `numericCard`: series が昇順 / 不正な decimal を除外 / duration の秒 / count 0 → null。
- `formatStat`: scale 0/1/3、duration、null。

---

## 7. PR5c: `feature/record-review-charts`

### 7.1 グラフライブラリの判断材料

| 案 | 追加サイズ（概算, gzip） | スマホ表示 | 実装 | 運用 | 評価 |
|---|---|---|---|---|---|
| A. インライン SVG を手書き（モックと同じ）。座標計算は純関数 | 0 | 横スクロール容器で自由に制御。タップは `<title>` のみ | 中（3 種類のレイアウト関数） | 無し | ◎ |
| B. recharts | 約 90〜100 kB（d3 一式を含む） | レスポンシブ容器はあるが、横スクロールや 26 週ヒートマップは自作になる | 小〜中 | 依存の追従 | △ |
| C. uPlot / chart.js 等の軽量系 | 12〜65 kB | canvas。ダークテーマ・フォントを CSS 変数で合わせにくい。ヒートマップは結局自作 | 中 | 依存の追従 | ○ |

**推薦: A。** 必要なのは 月別の棒 / 推移の折れ線 / ヒートマップの 3 つで、いずれも
モックで 20〜40 行の SVG。座標計算を純関数に切り出せば vitest（jsdom 無し）で
テストでき、バンドルも増えない。インタラクティブなツールチップは要らない
（`<title>` で十分）。

### 7.2 変更ファイル
| ファイル | 変更 |
|---|---|
| `src/lib/review.ts` / `review.test.ts` | 月別・推移・ヒートマップのデータ関数とレイアウト関数を追加 |
| `src/components/record/charts.tsx` | **新規**。`MonthlyBars` / `Sparkline` / `Heatmap` |
| `src/components/record/record-review.tsx` | 3 節を追加 |

### 7.3 純関数（`src/lib/review.ts` に追加）

```ts
/** from の月から to の月まで "YYYY-MM" を昇順で（両端含む）。from > to なら [] */
export function monthKeysBetween(from: Date, to: Date): string[];

export type MonthlyMetric =
  | { kind: "count" }
  | { kind: "sum" | "avg"; fieldId: string };      // number / duration 項目

export interface MonthlyPoint { month: string; value: number | null }  // count は 0、sum/avg は値が無い月は null
/**
 * 月別の系列。範囲は period が all なら 最初の投稿の月〜now の月、
 * それ以外は periodRange の月〜。投稿 0 件なら []
 */
export function monthlySeries(
  posts: PostLike[], defs: FieldDef[], metric: MonthlyMetric, key: PeriodKey, now: Date,
): MonthlyPoint[];

/** 棒グラフの座標。values の null は 0 高さ。top は最大値を 5 の倍数に切り上げ（最小 5） */
export interface BarLayout { width: number; height: number; top: number; bars: { x: number; y: number; w: number; h: number; label: string; value: number | null }[]; gridlines: { y: number; value: number }[] }
export function barLayout(points: MonthlyPoint[], opts: { barWidth?: number; gap?: number; height?: number; padLeft?: number; padBottom?: number }): BarLayout;

/** 折れ線（等間隔 x）。最新 limit 件。1 件なら点だけ */
export interface SparklineLayout { d: string; area: string; last: { x: number; y: number } | null; min: number; max: number }
export function sparklineLayout(values: number[], opts: { width: number; height: number; limit?: number }): SparklineLayout;

/** 直近 weeks 週（今日を含む週の土曜まで）。日曜始まり。 */
export interface HeatmapCell { day: string; count: number; week: number; dow: number }
export function heatmapCells(posts: { checkpointAt: string }[], now: Date, weeks?: number): { cells: HeatmapCell[]; monthLabels: { week: number; label: string }[] };
/** 0 / 1 / 2 / 3+ の 4 段階 */
export function heatLevel(count: number): 0 | 1 | 2 | 3;
```

### 7.4 UI
- **月別**（KPI の下）: 見出し「月ごとの記録」+ 右に指標セレクト（`<select>`）:
  「件数」+ number/duration 項目ごとに「<label> 合計」「<label> 平均」。初期値 件数。
  `barLayout` を `<svg>` に描く。棒は indigo 単色、棒の上に値（件数は整数、sum/avg は
  `formatStat`）。横幅 = 月数 × 44px、`overflow-x: auto` の容器、**初期スクロール位置は右端**
  （最新月が見える）。
- **ヒートマップ**（月別の下）: 見出し「活動した日 <small>直近 26 週</small>」。
  期間チップに依存せず常に直近 26 週（§8 D-3）。11px の角丸セル、14px ピッチ、
  曜日ラベルは 日/火/木/土。セルに `<title>YYYY/M/D n件</title>`。色は
  `rgba(129,140,248,.45/.7)` / `#a5b4fc`、0 件は `white/5`。
- **推移**: 5b の number/duration カードに `Sparkline`（高さ 90px、最新 30 件、
  左下「30回前」右下「最新」のラベル。件数が 30 未満なら「N回前」）。1 件以下なら描かない。
- `prefers-reduced-motion` は関係なし（アニメーション無し）。

### 7.5 受け入れ条件
- [ ] 月別が期間に連動し、投稿の無い月も 0 で並ぶ。指標を「距離 合計」にすると月別の合計が出る。
- [ ] 月別の横スクロールが最新月から始まる。
- [ ] ヒートマップが直近 26 週で、投稿のある日に色が付く。JST の 23:30 の投稿がその日に乗る。
- [ ] 推移が checkpointAt 昇順で、最新が右端。
- [ ] `npm run build` 後の `out/` の JS 合計が 5b から 10 kB 以上増えていない（概算の確認。`du -sh out/_next/static/chunks`）。

### 7.6 テストケース
- `monthKeysBetween`: 同月 / 年跨ぎ / 逆順。
- `monthlySeries`: count は 0 埋め / sum は値無し月 null / avg / all の範囲が最初の投稿〜now / 3m の範囲。
- `barLayout`: top の切り上げ（7 → 10、0 → 5）/ null は h 0 / 幅 = n × (barWidth+gap) + padLeft。
- `sparklineLayout`: 1 件 / 同値のみ（min == max で 0 除算しない）/ limit 切り詰めが最新側。
- `heatmapCells`: セル数 = weeks × 7 / 先頭が日曜 / 今日が含まれる / monthLabels は各月の最初の週に 1 つ。
- `heatLevel`: 0/1/2/3/10。

---

## 8. 決定事項と未決事項

### 決定（この仕様で固定。implementer は迷わない）
- **D-1** `groupTagCounts` の UI 経路は PR4 で廃止。関数は `@deprecated` で残し、tagGroups 撤去時に消す。fields が無く tagGroups だけのスレッドはフラット表示 + 所有者に「記録項目に変換」リンク。
- **D-2** 絞り込み・表示モードは URL に載せない。
- **D-3** ヒートマップは期間に依らず直近 26 週。
- **D-4** 記録帳の行タップでタイムラインの該当投稿へスクロール（編集はタイムラインで行う。記録帳に編集・削除は置かない）。
- **D-5** ふりかえり → 記録帳のジャンプは期間を持ち越さない。
- **D-6** グラフは手書き SVG（§7.1）。ライブラリは入れない。
- **D-7** 日付はブラウザのローカル時刻。テストは TZ=Asia/Tokyo 固定。
- **D-8** 既定表示 `defaultView` はスレッド record（所有者設定、全閲覧者に効く）。既定値なら書かない。
- **D-9** select の割合の分母は期間内の投稿数（未設定を含む）。multiple は延べ数。
- **D-10** 絞り込みバーに、archived な項目と値が 1 件も無い項目は出さない（その項目を選択中なら出す）。自由タグの選択は絞り込みバーに出るもの（`countFreeTags`）を基準に掃除する。

### 決定（ユーザー判断済み 2026-10-27、すべて推薦どおり）
- **U-1** number / duration の範囲絞り込みは今回入れない。別 issue。
- **U-2** 閲覧者が最後に選んだ表示は端末に記憶しない（localStorage を使わない）。
- **U-3** ふりかえりの期間チップは「全期間 / 直近3か月 / 直近1年 / 年ごと（最大 5）」。
- **U-4** PR5 は 5a / 5b / 5c の 3 分割。
- **U-5** 「成否 × 種類」のクロス集計と「メモ」（自動の一言）は今回入れない。

---

## 9. implementer への申し送り（共通）
- 1 PR = 1 ブランチ。基点は `integration/custom-fields`。PR の base も同ブランチ。
- 既存 record の書き戻しは `{ ...stripRecordMeta(thread), 変更分 }`。`defaultView` を落とさない。
- `thread-detail-screen.tsx` が肥大しているので、新しい UI は `src/components/record/` に置き、
  画面側は state と配線だけにする。
- スクリーンショットは撮れない（ヘッドレス）。`npm run build` と vitest の結果を PR 本文に貼る。
- モックの CSS 変数は使わず、既存の Tailwind トークン（`bg-surface-950`, `text-white/40`,
  `indigo-500` 系）で同じ見た目を作る。

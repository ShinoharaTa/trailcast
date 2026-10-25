# Trailcast カスタムフィールド（記録項目）データモデル仕様

作成: 2026-10-25 / 担当: spec-writer
対象: ~/workspace/trailcast（main @ fd610c3）

---

## 0. 何のために

スレッド（謎解き・筋トレ・サイクリング等）ごとに、投稿者が **自分で定義した軸**
（種類 / 成否 / クリアタイム / 重量 / 距離…）で記録を取り、絞り込み（記録帳）と
集計（ふりかえり）ができるようにする。今の `tags + tagGroups` は「文字列の集合」で
しかなく、数値や「1 つだけ選ぶ」が表せない。

---

## 1. 現状の事実（コードで確認）と推測

### 事実
- `post.tags: string[]`（先頭 # なし、比較は `tagKey()` で小文字化）。上限 50。
- `thread.tagGroups: {label, tags[]}[]`。lexicon の description に
  *"Display-level curation only; post.tags remains the source of truth"* と明記。
  `groupTagCounts()` はグループ定義順を尊重し、未使用タグは count 0 で返す。
- 絞り込み・集計はすべて **クライアント側の純関数**（`src/lib/tags.ts`:
  `countTags / filterPostsByTags / countWithTagAdded`）。D1 (`db/schema.sql`) は
  `post_uri / thread_uri / author_did / cid / checkpoint_at / indexed_at` のみで、
  タグも本文も持たない。→ フィールド追加で **D1 スキーマ変更は不要**。
- Bluesky クロスポスト (`buildCrosspostText`) は `post.tags` を `#tag` 行に展開し
  `facet#tag` を張る。300 grapheme に収まる分だけ載せる。
- 投稿画面 (`checkpoint-post-screen.tsx`) は `tagGroups / defaultTags / threadTags`
  を props で受け、`TagInput` に渡している。参加者も所有者のスレッド record を
  読んでこれらを使う構造は既にある。
- 既存 record の書き戻しは `{ ...stripRecordMeta(existing), 変更分 }` が規約
  （フィールドを落とした事故の再発防止）。新フィールドもこの規約に乗る。
- `location` が lexicon で `"type": "number"` を使っている。**AT Protocol の
  lexicon 仕様に浮動小数型は無い**（`integer` のみ）が、PDS は未知の lexicon を
  検証しないので実害は出ていない。
- テストランナーは未導入（`package.json` に test script なし、`*.test.*` なし）。
- lexicon 検証コードはクライアントに無い（`src/lib/pds/*` に validate なし）。

### 推測
- 「ナゾトキ記録」76 件のうちタグ無し 16 件は、グループ導入前の投稿か、
  ただのメモ。→ どのフィールドにも該当しない「未設定」として扱えばよい。
- Public スレッド参加者の投稿数はまだ少ない（インデクサーは A+C 方式のまま）。
  参加者データのマイグレーション負荷は小さい。

---

## 2. 論点 1: フィールド定義をどこに持つか

| 案 | 内容 | メリット | デメリット | 実装 | 運用 |
|---|---|---|---|---|---|
| 1-A スレッド record に埋め込み | `thread.fields: fieldDef[]` | 1 回の getRecord で定義まで揃う。参加者も今の tagGroups と同じ経路で読める。dangling 参照なし | 複数スレッドでの再利用は「コピー」になる | 小 | 無し |
| 1-B 別 record（テンプレート） | `net.shino3.trailcast.fieldSet` を作り thread から at-uri 参照 | 複数スレッドで共有。定義の一元管理 | 閲覧ごとに 1 hop 増える（他人の repo を読む参加者は 2 回）。テンプレ変更が全スレッドに波及して事故る。削除で参照切れ | 中 | 無し（PDS のみ） |
| 1-C 埋め込み + 「他スレッドからコピー」 | 1-A に加え、スレッド作成/編集画面で既存スレッドの定義を複製できる | 1-A の単純さを保ちつつ再利用の要望を満たす。テンプレ record は後から足せる | 複製後は独立（それが狙い） | 小+α | 無し |

**推薦: 1-C。** 正本は各スレッドで閉じる。テンプレート record（1-B）は
「複数スレッドにまたがる集計」の要望が出た段階で、`fields[].templateId` のような
出自メモを足す形で後付けできる。今は作らない。

---

## 3. 論点 2: 値をどこに持つか

### 比較

| 観点 | 案A: tags に寄せる | 案B: `fields` 新設（tags と無関係） | 案C: ハイブリッド（推薦） |
|---|---|---|---|
| 内容 | tagGroups に `kind: single/multi` を足し、値はタグ文字列のまま。数値だけ別 | post に `fields` を新設し、選択も数値もここ。tags は触らない | post に `fields` 新設（選択は option **id**、数値は値）。tags は自由タグとして残す。**読み取り時に tag→option の fallback** |
| 既存 76 件の互換 | ◎ 何もしない | ✗ 書き換えないと空 | ◎ fallback で無変換で見える。書き換えは任意 |
| Bluesky ハッシュタグ | ◎ そのまま | △ option→#tag の変換を別途 | ○ option.label を `#` 化して tags と合流（1 関数） |
| 絞り込み・集計 | △ 文字列集合のまま。数値は結局別系統 → 二重実装 | ◎ 型が分かる | ◎ 型が分かる。fallback 分が 1 関数増える |
| 改名耐性 | ✗ 選択肢の改名 = 全投稿の書き換え | ◎ id 参照 | ◎ id 参照（fallback 分だけ label 依存） |
| 名前空間衝突 | ✗ 「成功」が 2 グループにあると区別不能 | ◎ | ◎ |
| 「1 つだけ選ぶ」の表現 | △ UI でしか守れない | ◎ | ◎ |
| 未入力と「該当なし」の区別 | ✗ | ◎ | ◎ |
| lexicon としての素直さ | △ tagGroups の意味が二重化 | ◎ | ○ tags と fields が併存するが役割が明確 |
| 参加者データ（他人の repo） | ◎ 触らなくてよい | ✗ 書き換えられない | ◎ fallback で読める |
| 実装コスト | 小 | 中 | 中 |

### 推薦: 案C（ハイブリッド）

**理由**
1. 数値が入る時点で `fields` は避けられない。ならば選択系も同じ箱に入れて、
   **構造化された値は `fields`、自由記述の分類は `tags`** と役割を割り切る方が、
   絞り込み・集計の実装が一本になる（案A は永久に二系統）。
2. 選択肢を **id で参照**するので、改名・並べ替えが投稿に影響しない。
   謎解きの「団体」「場所」は増える・直す・統合するが日常的に起きる。
3. 既存データと参加者データは **読み取り時 fallback**（tagKey(tag) ==
   tagKey(option.label) なら選択済みとみなす）で救う。所有者が自分の 76 件を
   書き換えるのは任意（PR 6）。

**捨てた理由**
- 案A: 改名で壊れる・衝突する・数値で結局二重実装。tagGroups の
  "display-level only" という設計意図を壊して正本化することになる。
- 案B: 所有者が書き換えられない参加者 post を切り捨てることになる。
  ハッシュタグ連携も自前で作り直し。

### 書き込みルール（案C）
- 選択フィールドの値は `fields` に **option id** で書く。同時に `tags` には
  **書かない**（二重書きのドリフト防止）。
- クロスポストは `tags ∪ 選択 option の label` を `#` 化して載せる（既存の
  重複除去・300 grapheme 制御をそのまま通す）。
- 読み取りは `resolveFieldValues(post, thread.fields)`: `post.fields` が
  あればそれ、無い post（旧データ・他クライアント）は tags から fallback。
  fallback は **option.label 完全一致（tagKey）** のみ、曖昧マッチはしない。
- タグからの読み替え（fallback）は post に `fields` プロパティが**存在しない**場合のみ。
  空配列 `[]` は「明示的に値なし」として扱い fallback しない。
- `tagGroups` は **deprecated**。変換後は thread から消す（§7）。lexicon の
  プロパティ自体は残す（既存 record が持っているため）。

---

## 4. 論点 3: フィールド型と lexicon 表現

### 型候補と評価

| 型 | 用途例 | 絞り込み | 集計 | 実装 | MVP |
|---|---|---|---|---|---|
| select (single/multi) | 種類・成否・団体・部位 | ◎ | ◎ 件数 | 小（既存チップ UI 流用） | ◎ 入れる |
| number + unit | 重量 kg・距離 km・回数 | ○ 範囲 | ◎ 合計/平均/最大 | 小 | ◎ 入れる |
| duration | クリアタイム・走行時間 | ○ | ◎ 合計/平均/最速 | 中（入力 UI） | ◎ 入れる |
| text | 一言メモ（本文と別に） | ✗ | ✗ | 小 | △ 次 |
| rating | 満足度 1-5 | ○ | ○ 平均 | 小 | △ number(min/max) で代替可 |
| boolean | 「再挑戦したい」 | ○ | ○ | 小 | ✗ single select 2 択で代替 |
| date | 公演日 | ○ | ✗ | 小 | ✗ checkpointAt がある |

**最小セット: `select`（single/multi は `multiple` フラグ）, `number`, `duration` の 3 型。**
text / rating は 2 次（lexicon の knownValues に足すだけで後方互換）。

### lexicon 案

#### `net.shino3.trailcast.thread` に追加

```jsonc
"fields": {
  "type": "array", "maxLength": 30,
  "description": "Custom input fields for checkpoints in this thread. Values live in post.fields and reference field/option by id, so labels can be renamed freely.",
  "items": { "type": "ref", "ref": "#fieldDef" }
}

// defs
"fieldDef": {
  "type": "object",
  "required": ["id", "label", "type"],
  "properties": {
    "id":       { "type": "string", "minLength": 1, "maxLength": 16,
                  "description": "Stable opaque id, unique within the thread. Never derived from label." },
    "label":    { "type": "string", "maxLength": 20 },
    "type":     { "type": "string", "knownValues": ["select", "number", "duration", "text"] },
    "multiple": { "type": "boolean", "description": "select only. true = checkboxes, false/absent = radio" },
    "options":  { "type": "array", "maxLength": 50, "items": { "type": "ref", "ref": "#fieldOption" },
                  "description": "select only" },
    "unit":     { "type": "string", "maxLength": 8, "description": "number only (kg, km, 回)" },
    "scale":    { "type": "integer", "minimum": 0, "maximum": 3,
                  "description": "number only. Decimal digits accepted in the input UI (display hint)" },
    "archived": { "type": "boolean", "description": "Hidden from the input UI; existing values still resolve" }
  }
},
"fieldOption": {
  "type": "object",
  "required": ["id", "label"],
  "properties": {
    "id":       { "type": "string", "minLength": 1, "maxLength": 16 },
    "label":    { "type": "string", "maxLength": 64,
                  "description": "Shown in UI and used as the hashtag on cross-post (normalized by normalizeTag)" },
    "archived": { "type": "boolean" }
  }
}
```

- `id` は `fieldDef / fieldOption` とも **クライアント生成の短いランダム文字列**
  （例: base32 8 文字）。label からは作らない（改名耐性のため）。
- `tagGroups` の description を "Deprecated: superseded by fields (select). Kept for
  records written before fields existed." に書き換える。

#### `net.shino3.trailcast.post` に追加

```jsonc
"fields": {
  "type": "array", "maxLength": 30,
  "description": "Values for the thread's custom fields. Each item references a thread.fields[].id. Posts without this property fall back to tags matching option labels (legacy).",
  "items": { "type": "union",
             "refs": ["#selectValue", "#numberValue", "#durationValue", "#textValue"] }
}

// defs
"selectValue":   { "type": "object", "required": ["field", "options"],
                   "properties": { "field": {"type":"string","maxLength":16},
                                   "options": {"type":"array","maxLength":50,
                                               "items":{"type":"string","maxLength":16}} } },
"numberValue":   { "type": "object", "required": ["field", "value"],
                   "properties": { "field": {"type":"string","maxLength":16},
                                   "value": {"type":"string","maxLength":32,
                                             "description":"Decimal string, e.g. \"12.5\". Lexicon has no float type; string keeps it lossless and readable by clients that do not have the thread definition"} } },
"durationValue": { "type": "object", "required": ["field", "seconds"],
                   "properties": { "field": {"type":"string","maxLength":16},
                                   "seconds": {"type":"integer","minimum":0} } },
"textValue":     { "type": "object", "required": ["field", "text"],
                   "properties": { "field": {"type":"string","maxLength":16},
                                   "text": {"type":"string","maxLength":200} } }
```

- union なので各要素は `$type: "net.shino3.trailcast.post#numberValue"` を持つ。
  他クライアントは thread 定義を見なくても値の型が分かる。
- `numberValue.value` を **decimal string** にしたのは lexicon に float が無いため。
  代替は (a) `location` と同じく非準拠の `"type":"number"`、(b) `integer` + 定義側
  `scale` で割る。(a) は前例があるが lexicon 的に不正、(b) は定義が無いと値を
  読めない。→ string に決定（§10 U-1）。
- 1 post に同じ `field` は 1 件まで。書き込み前に sanitize で後勝ち重複排除。

---

## 5. 論点 4: 改名・削除・型変更

| 操作 | 扱い | 既存値 |
|---|---|---|
| フィールド改名 / 選択肢改名 | label だけ変える | 無影響（id 参照）。ただし **fallback 対象の旧 post は label 一致が外れる** → 変換 PR 6 を促すバナー |
| 選択肢の並べ替え | options 配列順 = 表示順 | 無影響 |
| 選択肢削除 | **ソフト削除** `archived: true`。入力 UI から消え、既存値は「(旧) label」で表示・集計に残る | 保持 |
| フィールド削除 | 同上 `archived: true`。ハード削除も許すが、値は post に残り UI では「未定義のフィールド」としてまとめて表示 | 保持 |
| single → multiple | 許可（広げるだけ） | 無影響 |
| multiple → single | UI で警告。単一選択に 2 値以上ある post は、集計・絞り込みは全値を数え、表示も全値を出す（データを切り捨てない） | 保持 |
| 型変更（select→number 等） | **禁止**。新しいフィールドを作って archived にしてもらう | — |
| id 再利用 | 禁止（archived の id も予約済み扱い） | — |

---

## 6. 論点 5: Public スレッドの参加者

- 前提は **「参加者は所有者の thread record の `fields` を読んで入力する」で良い**。
  今の `tagGroups / defaultTags` と同じ経路（`checkpoint-post-screen` の props）。
- 参加者の post は参加者の repo に入り、`fields[].field / options[]` は所有者の id を指す。
  所有者は参加者 post を書き換えられないので、定義変更に対する解釈は
  **常に読み取り側（現在の定義 + archived 表示）で吸収**する。§5 のルールで足りる。
- `required` フィールドは MVP に入れない。参加者に強制できず、他クライアントも
  守らない。入力 UI 上の「おすすめ」止まり。→ 入れない（§10 U-2）。
- 所有者が `endedAt` を立てた後は参加者投稿を受けない（既存仕様）。定義も凍結する
  のが自然（ふりかえり集計が動かないように）。→ UI で編集不可にする（§10 U-3）。

---

## 7. 論点 6: 既存タグからの移行

### 自動変換（tagGroups → select フィールド）
- 所有者がスレッド編集画面で **「タググループをフィールドに変換」** を押す
  （黙って変換しない）。
- 変換規則（純関数 `convertTagGroupsToFields(groups, opts?): FieldDef[]`）:
  - 1 group → 1 `select` field。`label` = group.label、`multiple` は
    `opts.multiple(group)` の結果、省略時は `true`
    （single か判定できないので既定は広い方。所有者が後で single に変えられる）。
  - group.tags[i] → option `{ id: gen(), label: tag }`。
  - 同じ putRecord で `fields` を書き `tagGroups` を削除する。
- 76 件の post は書き換えない。読み取り fallback（§3）で option 扱いになる。
  「ナゾトキ記録」なら 種類 / 成否 / 団体・場所 の 3 フィールドがそのまま立つ。

### タグ無し 16 件
- 全フィールドが「未設定」。記録帳では「未設定」チップで拾える、ふりかえりでは
  件数に「未設定 n」を出す。削除も補完もしない。

### 任意の書き換え（PR 6、後回し可）
- 所有者の自分の post について、fallback で解決した値を `fields` に書き、
  対応した tag を `tags` から外す（自由タグはそのまま）。進捗付きで 1 件ずつ
  putRecord。参加者 post は対象外。
- 改名した後も旧 post が追従するのが利点。急がない。

### tagIndex（個人辞書）
- select の値は tagIndex に **入れない**（辞書は自由タグ用）。変換で tags から
  外れたタグは辞書に残るが、サジェストの害は小さい。放置。

---

## 8. 論点 7: PR 分割

| # | ブランチ | 内容 | 依存 | 目安 |
|---|---|---|---|---|
| 1 | `feature/fields-lexicon` | lexicon 2 本の追加、`types.ts`（FieldDef / FieldValue 型, PostRecord/ThreadRecord に optional 追加）、`src/lib/fields.ts` 純関数群（id 生成、sanitize、`resolveFieldValues` with tag fallback、`countSelect` / `aggregateNumber` / `filterByFields`、`convertTagGroupsToFields`）、`docs/architecture.md` 更新。テストランナー（vitest）もここで導入（§10 U-4） | — | 中 |
| 2 | `feature/fields-thread-edit` | スレッド編集画面にフィールド定義エディタ（追加・改名・archived・select の options・number の unit/scale・multiple）、「タググループを変換」ボタン、「他スレッドからコピー」 | 1 | 中〜大 |
| 3 | `feature/fields-post-input` | 投稿・編集画面に型別入力（select = ラジオ/チェックのチップ、number = 数値 + 単位、duration = h/m/s）。クロスポストに option label を合流 | 1 | 中 |
| 4 | `feature/fields-filter` | thread-detail の `TagFilterBar` を「select フィールド + 自由タグ」構成に置き換え（`groupTagCounts` 経路の廃止）。fallback 込み | 1, 2 | 中 |
| 5 | （別仕様）記録帳 / ふりかえり | 絞り込み一覧・集計の表示モード。number/duration の合計/平均/最大最小 | 1, 4 | 大 |
| 6 | `feature/fields-migrate-posts` | 所有者の旧 post を fields に書き換える任意ツール（設定 or スレッド編集から） | 1, 2 | 小〜中 |

- PR 1 は UI を含まないので単独でマージ可。2 と 3 は並行可。
- `implementer` に渡すときは PR 1 の関数シグネチャ一覧（下記）を仕様として添える。

### PR 3 への申し送り
- 旧投稿（`fields` を持たない post）を編集保存するときは、`resolveFieldValues` で
  解決した select を `fields` に書き戻し、対応する tag を `tags` から外す。
  全項目が未選択でも `fields` は空配列 `[]` で残す（以後 fallback させないため）。

### PR 1 で定義する関数（implementer 向け）
- `generateFieldId(): string` — 8 文字 base32。
- `sanitizeFieldsForRecord(defs: FieldDef[]): FieldDef[] | undefined` — label trim/上限、id 重複は後ろを落とす、options 無しの select を落とす、空なら undefined（`tagGroups` と同じ慣習）。
- `sanitizePostFieldsForRecord(values: FieldValue[], defs: FieldDef[]): FieldValue[] | undefined` — 定義に無い field は落とす、同 field 重複は後勝ち、select は定義にある option id だけ残す、single なら先頭 1 件、number は decimal 文字列検証。
- `resolveFieldValues(post: {tags?, fields?}, defs: FieldDef[]): ResolvedValue[]` — fields 優先、無ければ tags→option label の fallback。
- `convertTagGroupsToFields(groups: TagGroup[], opts?: { multiple?: (group: TagGroup) => boolean }): FieldDef[]` — opts 省略時は `multiple: true`。戻り値は未サニタイズ。
- `crosspostTagsFor(post, defs): string[]` — `dedupeTags([...tags, ...選択 option label])`。
- `countSelectOptions(posts, def)`, `filterPostsByFields(posts, defs, selection)`, `summarizeNumber(posts, def) → {count,sum,avg,min,max}`, `summarizeDuration` 同様。

---

## 9. 受け入れ条件（全体）

- [ ] 既存 76 件の post と「ナゾトキ記録」の thread を一切書き換えずに、変換ボタン後の絞り込み結果が変換前と一致する（グループごとの件数が同じ）。
- [ ] 選択肢を改名しても、`fields` を持つ post の絞り込み結果が変わらない。
- [ ] archived にした選択肢は入力 UI に出ず、既存 post の表示・集計には残る。
- [ ] number フィールドに `12.5` を入れた post を再読込すると `"12.5"` のまま返る（丸めない）。
- [ ] クロスポスト文面に、選択した option の label が `#label` として含まれ、`#Trailcast` との重複が落ちる。
- [ ] 参加者が所有者の定義で投稿した post を、所有者側のスレッド詳細で絞り込みできる。
- [ ] `fields` が無い thread では従来どおり（自由タグのみ）動く。
- [ ] 1 post に同じ field が 2 件入らない（sanitize で落ちる）。

---

## 10. 決定事項

### 決定（この仕様で固定）
- 定義はスレッド埋め込み（1-C）。テンプレ record は作らない。
- 値は post.fields（案C）。選択は option id、tags は自由タグ専用。
- id はランダム生成、label 参照しない。削除はソフト削除。型変更禁止。
- 既存データは読み取り fallback。書き換えは任意（PR 6）。
- MVP 型は select / number / duration。
- 表示は「タイムライン / 記録（記録帳・ふりかえりのタブ）」。

### 決定（ユーザー判断済み）
- **U-1** number の保存形式は decimal string。検証は `/^-?\d+(\.\d+)?$/` かつ 32 文字以内（指数表記・先頭 `+` は不可）。
- **U-2** `required` は入れない。fieldDef に required プロパティを作らない。
- **U-3** 終了したスレッド（`endedAt` あり）はフィールド定義を UI で編集不可にする。
- **U-4** vitest は PR 1 で導入する。
- **U-5** `convertTagGroupsToFields(groups: TagGroup[], opts?: { multiple?: (group: TagGroup) => boolean }): FieldDef[]`。opts 省略時は `multiple: true`。

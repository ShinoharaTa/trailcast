"use client";

import { useState } from "react";
import { PinIcon, CloseIcon } from "@/components/ui/icons";
import type {
  FieldDef,
  FieldValue,
  PostWithMeta,
  Location,
  TagGroup,
  ThreadWithMeta,
} from "@/lib/types";
import { parseAtUri,
  stripRecordMeta,
} from "@/lib/types";
import { updatePost } from "@/lib/pds/posts";
import { BlobImage } from "@/components/ui/blob-image";
import { TagInput } from "@/components/ui/tag-input";
import { FieldInputs } from "@/components/ui/field-inputs";
import {
  buildEditedPostFields,
  fieldValuesFromResolved,
  initialFreeTagsForEdit,
  resolveFieldValues,
} from "@/lib/fields";
import { locationToSave, parseLocation } from "@/lib/location";
import { recordTagUsage } from "@/lib/pds/tags";
import { tagKey, type TagCount } from "@/lib/tags";
import { usePendingOptions } from "@/lib/use-pending-options";

const MAX_TEXT = 200;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate(),
  )}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export interface CheckpointEditScreenProps {
  post: PostWithMeta;
  /** このスレッドで既に使われているタグ。タグ候補の上位に出す */
  threadTags?: TagCount[];
  /** 候補に出さず、タグ辞書にも数えないタグの tagKey (記録項目の選択肢名) */
  excludeTagKeys?: ReadonlySet<string>;
  /** スレッドのタググループ。候補の最上段に見出し付きで出す */
  tagGroups?: TagGroup[];
  /** スレッド (所有者) の記録項目の定義 */
  fields?: FieldDef[];
  /** select に選択肢をその場で追加できるか (スレッドの所有者で、終了していないとき) */
  canAddOptions?: boolean;
  /** 保存前に選択肢を thread.fields に書き込んだあと、書き込み後のスレッドで呼ぶ */
  onThreadUpdated?: (thread: ThreadWithMeta) => void;
  onSubmitted: () => void;
  onCancel: () => void;
}

export function CheckpointEditScreen({
  post,
  threadTags,
  excludeTagKeys,
  tagGroups,
  fields,
  canAddOptions,
  onThreadUpdated,
  onSubmitted,
  onCancel,
}: CheckpointEditScreenProps) {
  const [text, setText] = useState(post.text ?? "");
  // タグから読み取った選択肢のタグはタグ欄に出さず、項目のチップ側にだけ出す
  const [tags, setTags] = useState<string[]>(() =>
    initialFreeTagsForEdit(post, fields ?? []),
  );
  // タグから読み取った選択も、選択済みとして出す
  const [fieldValues, setFieldValues] = useState<FieldValue[]>(() =>
    fieldValuesFromResolved(resolveFieldValues(post, fields ?? [])),
  );
  // 編集画面で追加した選択肢 (所有者のみ)。保存するまで thread.fields には書かない
  const { defs, handleAddOption, writePendingOptions } = usePendingOptions({
    threadUri: post.thread,
    fields,
    canAddOptions,
    onThreadUpdated,
    fieldValues,
    setFieldValues,
  });
  const inputDefs = defs.filter((d) => !d.archived);
  const [fieldsValid, setFieldsValid] = useState(true);
  const [checkpointAt, setCheckpointAt] = useState(post.checkpointAt);
  const [location, setLocation] = useState<Location | null>(() =>
    parseLocation(post.location),
  );
  // 位置を外す操作をしたか。読めない location は外されない限り元の値を書き戻す
  const [locationRemoved, setLocationRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // 追加した選択肢を先にスレッドへ書く。失敗したら投稿は保存しない (入力は残す)
      const { defs: postDefs, values: postValues } =
        await writePendingOptions();
      // 項目があるスレッドでは、タグから読み取っていた選択を fields に移し、
      // そのタグと選んだ選択肢と同名のタグを tags から外す。項目が無ければ fields は元のまま
      const { fields: recordFields, tags: recordTags } = buildEditedPostFields(
        post,
        postDefs,
        postValues,
        tags,
      );
      await updatePost(post.rkey, {
        // 触っていないフィールド (images / exif / sourceRef など) を落とさない
        ...stripRecordMeta(post),
        text: text.trim() || undefined,
        // 旧 record の数値もここで decimal string に正規化される (#64)
        location: locationToSave(post.location, location, locationRemoved),
        tags: recordTags,
        fields: recordFields,
        checkpointAt: checkpointAt || post.checkpointAt,
      });
      // 編集で新しく付いたタグだけを辞書に加算する (再保存で回数が膨らまないように)
      const before = new Set((post.tags ?? []).map(tagKey));
      const added = (recordTags ?? []).filter((t) => !before.has(tagKey(t)));
      if (added.length > 0) await recordTagUsage(added, { exclude: excludeTagKeys });
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
      setSaving(false);
    }
  };

  const postDid = parseAtUri(post.uri).repo;
  const images = post.images ?? [];

  return (
    <>
      <h2 className="mb-6 pr-10 text-lg font-bold text-white">チェックポイントを編集</h2>
      <div className="space-y-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/50">
            チェックポイント時刻
          </label>
          <input
            type="datetime-local"
            value={toLocalInput(checkpointAt)}
            onChange={(e) => {
              const d = new Date(e.target.value);
              if (!isNaN(d.getTime())) setCheckpointAt(d.toISOString());
            }}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-base text-white outline-none focus:border-indigo-400 md:text-sm"
          />
        </div>

        <div className="relative">
          <label className="mb-1.5 block text-xs font-medium text-white/50">テキスト</label>
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 md:text-sm"
          />
          <span className="absolute bottom-3 right-3 text-xs text-white/20">
            {text.length}/{MAX_TEXT}
          </span>
        </div>

        <FieldInputs
          defs={inputDefs}
          values={fieldValues}
          onChange={setFieldValues}
          onValidityChange={setFieldsValid}
          disabled={saving}
          onAddOption={handleAddOption}
        />

        <TagInput
          value={tags}
          onChange={setTags}
          threadTags={threadTags}
          excludeKeys={excludeTagKeys}
          tagGroups={tagGroups}
          disabled={saving}
          hint="スレッド内の絞り込みに使えます"
        />

        {images.length > 0 && (
          <div>
            <label className="mb-2 block text-xs font-medium text-white/50">写真</label>
            <div className="grid grid-cols-3 gap-2">
              {images.map((img, i) => (
                <div key={i} className="overflow-hidden rounded-xl">
                  <BlobImage
                    did={postDid}
                    blobRef={img}
                    alt=""
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {location && (
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <PinIcon className="size-4 text-indigo-400" />
              <span className="text-sm text-white/70">
                {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
              </span>
            </div>
            <button
              onClick={() => {
                setLocation(null);
                setLocationRemoved(true);
              }}
              className="rounded-full p-1.5 text-white/30 transition hover:bg-red-500/10 hover:text-red-400"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !fieldsValid}
            className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
          <button
            onClick={onCancel}
            className="rounded-xl border border-white/10 px-6 py-3 text-sm font-medium text-white/50 transition hover:bg-white/5"
          >
            キャンセル
          </button>
        </div>
      </div>
    </>
  );
}

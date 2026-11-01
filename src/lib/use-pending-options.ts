"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { getThread, updateThread } from "@/lib/pds/threads";
import {
  MAX_FIELD_OPTIONS,
  appendPendingOptions,
  findOptionByLabel,
  generateFieldId,
  mergePendingOptions,
  remapSelectValues,
  sanitizeFieldsForRecord,
  selectedPendingOptions,
  type PendingFieldOption,
} from "@/lib/fields";
import {
  parseAtUri,
  stripRecordMeta,
  type FieldDef,
  type FieldValue,
  type ThreadWithMeta,
} from "@/lib/types";

export interface UsePendingOptionsParams {
  /** 選択肢を書き込むスレッドの at-uri */
  threadUri: string;
  /** スレッド (所有者) の記録項目の定義 */
  fields: FieldDef[] | undefined;
  /** スレッドの所有者か。所有者だけ選択肢をその場で追加できる */
  isOwner: boolean | undefined;
  /** 選択肢を thread.fields に書き込んだあと、書き込み後のスレッドで呼ぶ */
  onThreadUpdated?: (thread: ThreadWithMeta) => void;
  fieldValues: FieldValue[];
  setFieldValues: Dispatch<SetStateAction<FieldValue[]>>;
}

/**
 * 投稿・編集画面で「＋ 追加」した選択肢 (所有者のみ) を扱う。
 * 保存するまで thread.fields には書かず、定義の末尾に足した defs で
 * 既存の選択肢と同じように入力・保存の組み立てに使う。
 */
export function usePendingOptions({
  threadUri,
  fields,
  isOwner,
  onThreadUpdated,
  fieldValues,
  setFieldValues,
}: UsePendingOptionsParams) {
  const [pendingOptions, setPendingOptions] = useState<PendingFieldOption[]>(
    [],
  );
  const defs = mergePendingOptions(fields ?? [], pendingOptions);

  // 同じ名前 (スレッド編集と同じく大文字小文字を区別しない) の選択肢があれば
  // 追加せずにそれを選ぶ。archived なら保存時に archived を外す予定にする。
  // 追加・既存どちらも選択状態にする (1 つだけ: 置き換え / 複数: 足す)
  const handleAddOption = (fieldId: string, label: string) => {
    const def = defs.find((d) => d.id === fieldId);
    if (!def || def.type !== "select") return;
    const existing = findOptionByLabel(def.options ?? [], label);
    let optionId: string;
    if (existing) {
      optionId = existing.id;
      if (existing.archived) {
        setPendingOptions((prev) => [
          ...prev,
          {
            fieldId,
            option: { id: existing.id, label: existing.label },
            unarchive: true,
          },
        ]);
      }
    } else {
      if ((def.options?.length ?? 0) >= MAX_FIELD_OPTIONS) return;
      optionId = generateFieldId();
      setPendingOptions((prev) => [
        ...prev,
        { fieldId, option: { id: optionId, label } },
      ]);
    }
    setFieldValues((prev) => {
      const current = prev.find((v) => v.field === fieldId);
      const selected =
        current?.$type === "net.shino3.trailcast.post#selectValue"
          ? current.options
          : [];
      const next: FieldValue = {
        $type: "net.shino3.trailcast.post#selectValue",
        field: fieldId,
        options: def.multiple
          ? selected.includes(optionId)
            ? selected
            : [...selected, optionId]
          : [optionId],
      };
      return current
        ? prev.map((v) => (v.field === fieldId ? next : v))
        : [...prev, next];
    });
  };

  /**
   * 選んだ追加待ちの選択肢を thread.fields に書き込む。選ばれていないものは捨てる。
   * 書き込み直前にスレッドを取り直して足し、書き込み後の定義と値を返す。
   * 項目が消えた・非表示になった等で足せないときは Error を投げる (投稿・保存しない)。
   */
  const writePendingOptions = async (): Promise<{
    defs: FieldDef[];
    values: FieldValue[];
  }> => {
    const toWrite = selectedPendingOptions(pendingOptions, fieldValues);
    if (toWrite.length === 0) return { defs, values: fieldValues };
    // 書き込めるのは所有者の repo だけ。UI で出し分けているが念のため止める
    if (!isOwner) {
      throw new Error("選択肢を追加できるのはスレッドの所有者だけです");
    }
    const { repo, rkey } = parseAtUri(threadUri);
    const fresh = await getThread(repo, rkey);
    const merged = appendPendingOptions(fresh.fields ?? [], toWrite);
    if (!merged.ok) {
      // 取り直した定義で画面を最新にしてから止める
      onThreadUpdated?.(fresh);
      const label =
        defs.find((d) => d.id === merged.fieldId)?.label ?? "記録項目";
      throw new Error(
        merged.reason === "full"
          ? `「${label}」の選択肢が上限 (${MAX_FIELD_OPTIONS} 件) に達しているため追加できませんでした`
          : merged.reason === "archived"
            ? `「${label}」は非表示になっているため選択肢を追加できませんでした`
            : `「${label}」がスレッドから削除されているため選択肢を追加できませんでした`,
      );
    }
    let updated: ThreadWithMeta;
    try {
      updated = await updateThread(
        rkey,
        {
          // 触っていないフィールドを落とさないよう、取り直した record を土台にする
          // (ogImage もここで残る)
          ...stripRecordMeta(fresh),
          fields: sanitizeFieldsForRecord(merged.fields),
          // 編集は活動なので一覧の並びを進める (spread で古い値が入るため明示)
          updatedAt: new Date().toISOString(),
        },
        // 選択肢の追加は OG 画像に関係しないので作り直さない
        { skipOgImage: true },
      );
    } catch (e) {
      throw new Error(
        e instanceof Error
          ? `選択肢を保存できませんでした: ${e.message}`
          : "選択肢を保存できませんでした",
      );
    }
    // 書き込めたら追加待ちは定義に移ったので消す (投稿に失敗して再送しても二重に足さない)
    const values = remapSelectValues(fieldValues, merged.idMap);
    setPendingOptions([]);
    setFieldValues(values);
    onThreadUpdated?.(updated);
    return { defs: updated.fields ?? [], values };
  };

  return {
    /** 定義の末尾に追加待ちの選択肢を足した defs (archived も含む) */
    defs,
    /** 所有者でなければ undefined (FieldInputs に「＋ 追加」を出さない) */
    handleAddOption: isOwner ? handleAddOption : undefined,
    writePendingOptions,
  };
}

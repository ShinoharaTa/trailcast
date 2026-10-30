"use client";

import { useEffect, useState } from "react";
import {
  DECIMAL_PATTERN,
  MAX_FIELD_OPTIONS,
  MAX_NUMBER_VALUE_LENGTH,
  MAX_TEXT_VALUE_LENGTH,
  isBlankOptionLabel,
  toggleSelectOption,
} from "@/lib/fields";
import { MAX_TAG_LENGTH, normalizeTag } from "@/lib/tags";
import { formatDuration, parseDurationInput } from "@/lib/fields-format";
import type { FieldDef, FieldValue } from "@/lib/types";

const inputClass =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 disabled:opacity-50";

export interface FieldInputsProps {
  /** 入力させる項目 (archived は渡す前に除外する) */
  defs: FieldDef[];
  values: FieldValue[];
  onChange: (values: FieldValue[]) => void;
  disabled?: boolean;
  /**
   * 不正な入力 (decimal に合わない・長すぎる数値、解析できない時間) や
   * 「＋ 追加」に追加していない入力が残っているかが変わったときに呼ぶ。
   * 呼び出し側は false の間、送信ボタンを無効にする
   */
  onValidityChange?: (valid: boolean) => void;
  /**
   * 渡したときだけ select の末尾に「＋ 追加」を出す (投稿画面の所有者用)。
   * label は normalizeTag 済み。重複の判定と選択は呼び出し側で行う
   */
  onAddOption?: (fieldId: string, label: string) => void;
}

/**
 * スレッドの記録項目の入力欄。定義順に縦に並べる。
 * 不正な数値・時間は values に入れたまま / 外したままにして、保存時の
 * sanitizePostFieldsForRecord に落とさせる。
 */
export function FieldInputs({
  defs,
  values,
  onChange,
  disabled,
  onValidityChange,
  onAddOption,
}: FieldInputsProps) {
  // 「＋ 追加」で入力中の項目 id と、その入力値
  const [addingFieldId, setAddingFieldId] = useState<string | null>(null);
  const [optionDraft, setOptionDraft] = useState("");
  // 時間は入力された文字列のまま持つ (正規化して書き換えない)。初期値は values から作る
  const [durations, setDurations] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const v of values) {
      if (v.$type === "net.shino3.trailcast.post#durationValue") {
        out[v.field] = formatDuration(v.seconds);
      }
    }
    return out;
  });

  const fieldsValid = defs.every((def) => {
    if (def.type === "number") {
      const v = values.find((x) => x.field === def.id);
      return (
        v?.$type !== "net.shino3.trailcast.post#numberValue" ||
        (DECIMAL_PATTERN.test(v.value) &&
          v.value.length <= MAX_NUMBER_VALUE_LENGTH)
      );
    }
    if (def.type === "duration") {
      return parseDurationInput(durations[def.id] ?? "") !== "invalid";
    }
    return true;
  });
  // 「＋ 追加」の入力欄に文字が残っている間は送信させない (追加し忘れを防ぐ)
  // (入力欄が出ていないとき = 項目が消えた・上限に達したときは数えない)
  const draftPending =
    Boolean(onAddOption) &&
    !isBlankOptionLabel(optionDraft) &&
    defs.some(
      (d) =>
        d.id === addingFieldId &&
        (d.options?.length ?? 0) < MAX_FIELD_OPTIONS,
    );
  const valid = fieldsValid && !draftPending;
  useEffect(() => {
    onValidityChange?.(valid);
  }, [valid, onValidityChange]);

  if (defs.length === 0) return null;

  const valueOf = (fieldId: string) => values.find((v) => v.field === fieldId);

  /** その項目の値を差し替える。null なら外す。位置は保つ */
  const setValue = (fieldId: string, next: FieldValue | null) => {
    const idx = values.findIndex((v) => v.field === fieldId);
    if (idx === -1) {
      if (next) onChange([...values, next]);
      return;
    }
    onChange(
      next
        ? values.map((v, i) => (i === idx ? next : v))
        : values.filter((_, i) => i !== idx),
    );
  };

  const toggleOption = (def: FieldDef, optionId: string) => {
    const current = valueOf(def.id);
    // 定義に無い id は操作で残さない (archived の選択肢は定義にあるので残す)
    const known = new Set((def.options ?? []).map((o) => o.id));
    const selected =
      current?.$type === "net.shino3.trailcast.post#selectValue"
        ? current.options.filter((id) => known.has(id))
        : [];
    const options = toggleSelectOption(
      selected,
      optionId,
      Boolean(def.multiple),
    );
    setValue(
      def.id,
      options.length > 0
        ? {
            $type: "net.shino3.trailcast.post#selectValue",
            field: def.id,
            options,
          }
        : null,
    );
  };

  const cancelAddOption = () => {
    setAddingFieldId(null);
    setOptionDraft("");
  };

  const submitAddOption = (fieldId: string) => {
    const label = normalizeTag(optionDraft);
    if (!label || !onAddOption) return;
    onAddOption(fieldId, label);
    cancelAddOption();
  };

  const changeDuration = (fieldId: string, raw: string) => {
    setDurations((prev) => ({ ...prev, [fieldId]: raw }));
    const seconds = parseDurationInput(raw);
    setValue(
      fieldId,
      typeof seconds === "number"
        ? {
            $type: "net.shino3.trailcast.post#durationValue",
            field: fieldId,
            seconds,
          }
        : null,
    );
  };

  return (
    <div className="space-y-4">
      {defs.map((def) => {
        const current = valueOf(def.id);
        return (
          <div key={def.id}>
            <label className="mb-1.5 block text-xs font-medium text-white/50">
              {def.label}
            </label>

            {def.type === "select" &&
              (() => {
                const selected =
                  current?.$type === "net.shino3.trailcast.post#selectValue"
                    ? current.options
                    : [];
                // archived の選択肢は、既に選ばれているときだけ外せるように出す
                const options = (def.options ?? []).filter(
                  (o) => !o.archived || selected.includes(o.id),
                );
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {options.map((o) => {
                      const active = selected.includes(o.id);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => toggleOption(def, o.id)}
                          disabled={disabled}
                          aria-pressed={active}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                            active
                              ? "bg-indigo-500/30 text-indigo-100"
                              : "bg-white/5 text-white/60 hover:bg-white/10"
                          }`}
                        >
                          {o.label}
                          {o.archived && (
                            <span className="ml-1 text-white/40">(非表示)</span>
                          )}
                        </button>
                      );
                    })}
                    {onAddOption &&
                      (def.options?.length ?? 0) < MAX_FIELD_OPTIONS &&
                      (addingFieldId === def.id ? (
                        <>
                          <span className="flex w-full items-center gap-1.5">
                            <input
                              type="text"
                              value={optionDraft}
                              onChange={(e) => setOptionDraft(e.target.value)}
                              onKeyDown={(e) => {
                                // IME 変換中の Enter は変換確定なので無視する
                                if (e.nativeEvent.isComposing) return;
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  submitAddOption(def.id);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelAddOption();
                                }
                              }}
                              disabled={disabled}
                              autoFocus
                              maxLength={MAX_TAG_LENGTH}
                              placeholder="選択肢の名前"
                              aria-label={`${def.label}に選択肢を追加`}
                              className={`min-w-0 flex-1 py-1.5 text-base md:text-sm ${inputClass}`}
                            />
                            <button
                              type="button"
                              onClick={() => submitAddOption(def.id)}
                              disabled={disabled || isBlankOptionLabel(optionDraft)}
                              className="shrink-0 rounded-full bg-indigo-500/20 px-3 py-1.5 text-xs font-medium text-indigo-200 transition hover:bg-indigo-500/30 disabled:opacity-40"
                            >
                              追加
                            </button>
                            <button
                              type="button"
                              onClick={cancelAddOption}
                              disabled={disabled}
                              className="shrink-0 rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-white/50 transition hover:bg-white/10 disabled:opacity-50"
                            >
                              キャンセル
                            </button>
                          </span>
                          {draftPending && (
                            <p className="w-full text-[11px] text-amber-200/70">
                              追加を押してください
                            </p>
                          )}
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setAddingFieldId(def.id);
                            setOptionDraft("");
                          }}
                          disabled={disabled}
                          className="rounded-full border border-dashed border-white/15 px-3 py-1.5 text-xs font-medium text-white/50 transition hover:border-white/25 hover:bg-white/5 disabled:opacity-50"
                        >
                          ＋ 追加
                        </button>
                      ))}
                  </div>
                );
              })()}

            {def.type === "number" &&
              (() => {
                const raw =
                  current?.$type === "net.shino3.trailcast.post#numberValue"
                    ? current.value
                    : "";
                const invalid = raw !== "" && !DECIMAL_PATTERN.test(raw);
                const tooLong = raw.length > MAX_NUMBER_VALUE_LENGTH;
                return (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={raw}
                        maxLength={MAX_NUMBER_VALUE_LENGTH}
                        disabled={disabled}
                        // scale は表示のヒントだけ。丸めない
                        placeholder={
                          def.scale ? `0.${"0".repeat(def.scale)}` : "0"
                        }
                        onChange={(e) => {
                          const value = e.target.value.trim();
                          setValue(
                            def.id,
                            value
                              ? {
                                  $type:
                                    "net.shino3.trailcast.post#numberValue",
                                  field: def.id,
                                  value,
                                }
                              : null,
                          );
                        }}
                        className={`w-32 ${inputClass}`}
                      />
                      {def.unit && (
                        <span className="text-sm text-white/50">
                          {def.unit}
                        </span>
                      )}
                    </div>
                    {invalid ? (
                      <p className="mt-1 text-[11px] text-red-400">
                        数字で入力してください
                      </p>
                    ) : (
                      tooLong && (
                        <p className="mt-1 text-[11px] text-red-400">
                          {MAX_NUMBER_VALUE_LENGTH} 文字以内で入力してください
                        </p>
                      )
                    )}
                  </>
                );
              })()}

            {def.type === "duration" &&
              (() => {
                const raw = durations[def.id] ?? "";
                const invalid = parseDurationInput(raw) === "invalid";
                return (
                  <>
                    <input
                      type="text"
                      inputMode="text"
                      value={raw}
                      disabled={disabled}
                      placeholder="1:23:45 / 83分"
                      aria-label={def.label}
                      onChange={(e) => changeDuration(def.id, e.target.value)}
                      className={`w-40 ${inputClass}`}
                    />
                    {invalid && (
                      <p className="mt-1 text-[11px] text-red-400">
                        時間の形式で入力してください（例: 1:23:45、83分）
                      </p>
                    )}
                  </>
                );
              })()}

            {def.type === "text" && (
              <input
                type="text"
                value={
                  current?.$type === "net.shino3.trailcast.post#textValue"
                    ? current.text
                    : ""
                }
                maxLength={MAX_TEXT_VALUE_LENGTH}
                disabled={disabled}
                onChange={(e) => {
                  const text = e.target.value;
                  setValue(
                    def.id,
                    text
                      ? {
                          $type: "net.shino3.trailcast.post#textValue",
                          field: def.id,
                          text,
                        }
                      : null,
                  );
                }}
                className={`w-full ${inputClass}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

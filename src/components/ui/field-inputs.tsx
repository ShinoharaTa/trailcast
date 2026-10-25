"use client";

import { useEffect, useState } from "react";
import {
  DECIMAL_PATTERN,
  MAX_NUMBER_VALUE_LENGTH,
  MAX_TEXT_VALUE_LENGTH,
  toggleSelectOption,
} from "@/lib/fields";
import {
  joinSeconds,
  splitSeconds,
  type DurationParts,
} from "@/lib/fields-format";
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
   * 不正な入力 (decimal に合わない・長すぎる数値、59 を超える分・秒) の有無が
   * 変わったときに呼ぶ。
   * 呼び出し側は false の間、送信ボタンを無効にする
   */
  onValidityChange?: (valid: boolean) => void;
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
}: FieldInputsProps) {
  // 時間は「時・分・秒」の文字列で持つ。初期値は values から作る
  const [durations, setDurations] = useState<Record<string, DurationParts>>(
    () => {
      const out: Record<string, DurationParts> = {};
      for (const v of values) {
        if (v.$type === "net.shino3.trailcast.post#durationValue") {
          out[v.field] = splitSeconds(v.seconds);
        }
      }
      return out;
    },
  );

  const valid = defs.every((def) => {
    if (def.type === "number") {
      const v = values.find((x) => x.field === def.id);
      return (
        v?.$type !== "net.shino3.trailcast.post#numberValue" ||
        (DECIMAL_PATTERN.test(v.value) &&
          v.value.length <= MAX_NUMBER_VALUE_LENGTH)
      );
    }
    if (def.type === "duration") {
      const parts = durations[def.id];
      return !parts || joinSeconds(parts) !== "invalid";
    }
    return true;
  });
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
    const selected =
      current?.$type === "net.shino3.trailcast.post#selectValue"
        ? current.options
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

  const changeDuration = (
    fieldId: string,
    key: keyof DurationParts,
    raw: string,
  ) => {
    const digits = raw.replace(/\D/g, "");
    const parts = { ...(durations[fieldId] ?? { h: "", m: "", s: "" }) };
    parts[key] = digits;
    setDurations((prev) => ({ ...prev, [fieldId]: parts }));
    const seconds = joinSeconds(parts);
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
                const parts = durations[def.id] ?? { h: "", m: "", s: "" };
                const invalid = joinSeconds(parts) === "invalid";
                const units: [keyof DurationParts, string][] = [
                  ["h", "時"],
                  ["m", "分"],
                  ["s", "秒"],
                ];
                return (
                  <>
                    <div className="flex items-center gap-2">
                      {units.map(([key, unit]) => (
                        <span key={key} className="flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={parts[key]}
                            disabled={disabled}
                            aria-label={`${def.label} (${unit})`}
                            onChange={(e) =>
                              changeDuration(def.id, key, e.target.value)
                            }
                            className={`w-14 text-right ${inputClass}`}
                          />
                          <span className="text-sm text-white/50">{unit}</span>
                        </span>
                      ))}
                    </div>
                    {invalid && (
                      <p className="mt-1 text-[11px] text-red-400">
                        分と秒は 0〜59 で入力してください
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

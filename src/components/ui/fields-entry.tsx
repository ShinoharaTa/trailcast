"use client";

/**
 * 記録項目の編集への導線の文言。絞り込みバーと空状態で揃える (#129)
 *
 * - 項目あり (非表示も含め) → 編集
 * - 項目なしで旧 tagGroups あり → 変換
 * - どちらも無い → 設定
 */
export function fieldsEditLabel(
  defsCount: number,
  hasLegacyTagGroups: boolean,
): string {
  if (defsCount > 0) return "記録項目を編集";
  return hasLegacyTagGroups ? "記録項目に変換" : "記録項目を設定";
}

/**
 * 投稿 0 件のときの空状態 (タイムライン・記録帳で共通)。
 * 所有者かつ未終了なら記録項目の編集への入口を出す (#129)。
 * 項目が無いときだけ説明を添える。終了したスレッドは項目を変えられないので出さない
 */
export function EmptyPostsState({
  defsCount,
  hasLegacyTagGroups = false,
  canEdit = false,
  ended = false,
  onEditFields,
}: {
  defsCount: number;
  hasLegacyTagGroups?: boolean;
  canEdit?: boolean;
  ended?: boolean;
  onEditFields?: () => void;
}) {
  const showEntry = canEdit && !ended && onEditFields;
  return (
    <div className="py-16 text-center">
      <p className="text-white/30">まだチェックポイントがありません</p>
      {showEntry && (
        <>
          {defsCount === 0 && (
            <p className="mt-2 text-sm text-white/40">
              記録項目を設定すると、投稿のたびに選択肢や数値を記録できます
            </p>
          )}
          <button
            type="button"
            onClick={onEditFields}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-indigo-500/15 px-5 text-sm font-medium text-indigo-200 transition hover:bg-indigo-500/25"
          >
            {fieldsEditLabel(defsCount, hasLegacyTagGroups)}
          </button>
        </>
      )}
    </div>
  );
}

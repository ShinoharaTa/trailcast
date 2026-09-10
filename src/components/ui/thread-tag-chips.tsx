/**
 * スレッドの分類タグ (ThreadRecord.tags) を小さなチップで並べる。
 * カードでは場所を取らないよう先頭 4 つだけ出して残りは "+n" にする。
 */
export function ThreadTagChips({
  tags,
  max = 4,
  className = "",
}: {
  tags?: string[];
  max?: number;
  className?: string;
}) {
  if (!tags || tags.length === 0) return null;
  const shown = tags.slice(0, max);
  const rest = tags.length - shown.length;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {shown.map((t) => (
        <span
          key={t}
          className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] font-medium text-indigo-200"
        >
          #{t}
        </span>
      ))}
      {rest > 0 && (
        <span className="text-[11px] text-white/40">+{rest}</span>
      )}
    </div>
  );
}

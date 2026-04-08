import { ChevronLeftIcon } from "./icons";

interface BackButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
}

export function BackButton({
  onClick,
  label = "戻る",
  className = "",
}: BackButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 text-sm font-medium text-indigo-400 transition hover:text-indigo-300 ${className}`}
    >
      <ChevronLeftIcon className="size-4" />
      {label}
    </button>
  );
}

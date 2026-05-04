"use client";

import { cn } from "@/shared/lib/cn";

export type LobbyBubbleProps = {
  count: number;
  onClick: () => void;
  hidden?: boolean;
};

function ChatGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className={cn("h-4 w-4", className)} fill="none">
      <path
        d="M3 4.5 H15 a1.5 1.5 0 0 1 1.5 1.5 V11 a1.5 1.5 0 0 1 -1.5 1.5 H7.5 L4 15.5 V12.5 H3 a1.5 1.5 0 0 1 -1.5 -1.5 V6 a1.5 1.5 0 0 1 1.5 -1.5 Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LobbyBubble({ count, onClick, hidden }: LobbyBubbleProps) {
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Чат лобі: ${count}`}
      data-testid="lobby-bubble-v2"
      data-lobby-bubble=""
      className={cn(
        "fixed z-30",
        "right-4 bottom-4 h-11 w-11 rounded-full",
        "sm:right-6 sm:bottom-6 sm:h-[52px] sm:w-[52px] sm:rounded-2xl",
        "bg-surface border border-accent-quiet text-accent",
        "flex items-center justify-center gap-1",
        "transition-colors hover:border-accent hover:bg-surface-raised",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-accent",
      )}
    >
      <ChatGlyph className="text-accent" />
      <span className="text-xs sm:text-sm tabular-nums text-accent">{count}</span>
    </button>
  );
}

export default LobbyBubble;

"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/shared/lib/cn";
import { isOwnChatMessage } from "@/features/presence/ownMessage";

export type MatchmakingChatMessage = {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  ts: number;
};

export type MatchmakingChat = {
  messages: MatchmakingChatMessage[];
  draft: string;
  sessionId: string;
  onDraftChange: (text: string) => void;
  onSend: () => void;
};

export type MatchmakingStatus =
  | "connecting"
  | "queued"
  | "preparing"
  | "matched"
  | "opponent_left"
  | "forfeit"
  | "error"
  | "closed";

export type MatchmakingScreenProps = {
  status: MatchmakingStatus;
  deckSize: number;
  elo: number;
  onlineCount: number | null;
  waitingSeconds: number;
  playerName: string;
  chat: MatchmakingChat;
  onCancel: () => void;
  /** Optional retry CTA — shown for terminal/error states. */
  onRetry?: () => void;
  /** Optional inline status message override. */
  statusMessage?: string;
};

/**
 * Matchmaking + lobby chat screen (B9). Fully controlled — chat state and
 * status both come from the caller so this works for both the global lobby
 * (AI mode pre-game) and per-match PvP queueing.
 */
export function MatchmakingScreen({
  status,
  deckSize,
  elo,
  onlineCount,
  waitingSeconds,
  playerName,
  chat,
  onCancel,
  onRetry,
  statusMessage,
}: MatchmakingScreenProps) {
  // The screen hides itself when matched — caller decides when to render.
  return (
    <div
      data-testid="matchmaking-screen"
      data-status={status}
      className={cn(
        "relative grid min-h-screen w-full text-ink",
        "grid-rows-[1fr_auto] lg:grid-rows-1 lg:grid-cols-[2fr_1fr]",
        "bg-[url('/nexus-assets/backgrounds/cathedral-mobile-390x844.png')] bg-cover bg-center bg-no-repeat",
        "lg:bg-[url('/nexus-assets/backgrounds/cathedral-desktop-1440x900.png')]",
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[rgba(8,10,14,0.62)]" aria-hidden />

      <StatusColumn
        status={status}
        deckSize={deckSize}
        elo={elo}
        onlineCount={onlineCount}
        waitingSeconds={waitingSeconds}
        playerName={playerName}
        statusMessage={statusMessage}
        onCancel={onCancel}
        onRetry={onRetry}
      />

      <ChatColumn chat={chat} playerName={playerName} />
    </div>
  );
}

type StatusColumnProps = {
  status: MatchmakingStatus;
  deckSize: number;
  elo: number;
  onlineCount: number | null;
  waitingSeconds: number;
  playerName: string;
  statusMessage?: string;
  onCancel: () => void;
  onRetry?: () => void;
};

function StatusColumn({
  status,
  deckSize,
  elo,
  onlineCount,
  waitingSeconds,
  playerName,
  statusMessage,
  onCancel,
  onRetry,
}: StatusColumnProps) {
  const title = statusTitle(status);
  const subtitle = statusMessage || statusSubtitle(status);
  const showRetry = Boolean(onRetry) && retryStatuses.includes(status);

  return (
    <section
      data-testid="matchmaking-status"
      data-status={status}
      className="relative z-10 flex flex-col items-center justify-between gap-6 px-6 py-8 lg:py-12"
    >
      <header className="flex w-full max-w-md items-center gap-3">
        <span className="h-px flex-1 bg-accent-quiet/40" aria-hidden />
        <h1
          data-testid="matchmaking-status-title"
          className="text-center text-[24px] font-normal tracking-[0.18em] text-ink/95 uppercase"
        >
          {title}
        </h1>
        <span className="h-px flex-1 bg-accent-quiet/40" aria-hidden />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <Emblem />

        <p
          data-testid="matchmaking-status-subtitle"
          className="max-w-[440px] text-center text-sm text-ink/85"
        >
          {subtitle}
        </p>

        <dl className="grid gap-1 text-center text-sm text-ink/85">
          <div>Гравець: {playerName || "Гравець"}</div>
          <div>Готова колода: {deckSize} карт</div>
          <div>ELO: {elo}</div>
          <div className="h-2" aria-hidden />
          <div className="flex items-center justify-center gap-2 text-sm" data-testid="matchmaking-online">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span data-testid="matchmaking-online-count">
              Знайдено: {onlineCount ?? "..."} онлайн
            </span>
          </div>
          <div
            className="font-mono tabular-nums text-sm text-ink/85"
            data-testid="matchmaking-waiting"
          >
            Час очікування: {formatWaiting(waitingSeconds)}
          </div>
        </dl>
      </div>

      <div className="flex flex-col items-center gap-3">
        {showRetry && onRetry ? (
          <button
            type="button"
            data-testid="matchmaking-retry"
            onClick={onRetry}
            className="min-h-[42px] rounded-md border border-accent bg-accent/10 px-5 text-xs font-bold uppercase tracking-[0.18em] text-accent transition hover:bg-accent/20"
          >
            Знову PvP
          </button>
        ) : null}
        <button
          type="button"
          data-testid="matchmaking-cancel"
          onClick={onCancel}
          className="text-xs font-medium uppercase tracking-[0.32em] text-ink-mute transition hover:text-ink"
        >
          Скасувати
        </button>
      </div>
    </section>
  );
}

const retryStatuses: MatchmakingStatus[] = ["opponent_left", "forfeit", "error", "closed"];

function statusTitle(status: MatchmakingStatus) {
  if (status === "connecting") return "Підключення";
  if (status === "queued") return "Пошук суперника";
  if (status === "preparing") return "Готуємо матч";
  if (status === "matched") return "Матч готовий";
  if (status === "opponent_left") return "Суперник вийшов";
  if (status === "forfeit") return "Матч завершено";
  if (status === "error") return "PvP помилка";
  if (status === "closed") return "З'єднання закрите";
  return "PvP";
}

function statusSubtitle(status: MatchmakingStatus) {
  if (status === "connecting") return "Підключаємося до живого матчу.";
  if (status === "queued") return "Чекаємо іншого гравця.";
  if (status === "preparing") return "Завантажуємо стан матчу...";
  if (status === "matched") return "Матч стартує.";
  if (status === "opponent_left") return "Матч зупинено, бо другий гравець залишив арену.";
  if (status === "forfeit") return "Час ходу вийшов, результат зафіксовано.";
  if (status === "error") return "Спробуй повернутися до колоди й запустити PvP ще раз.";
  if (status === "closed") return "Сервер закрив з'єднання.";
  return "";
}

function Emblem() {
  return (
    <div
      data-testid="matchmaking-emblem"
      className="relative h-20 w-20"
      style={{ animation: "spin 6s linear infinite" }}
      aria-hidden
    >
      <span className="absolute inset-0 rounded-full border border-accent-quiet/70" />
      <span className="absolute inset-2 rounded-full border border-accent-quiet/30" />
      <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-quiet" />
      <span className="absolute bottom-0 left-[18%] h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-accent-quiet" />
      <span className="absolute bottom-0 right-[18%] h-2 w-2 translate-x-1/2 translate-y-1/2 rounded-full bg-accent-quiet" />
    </div>
  );
}

function formatWaiting(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type ChatColumnProps = {
  chat: MatchmakingChat;
  playerName: string;
};

function ChatColumn({ chat, playerName }: ChatColumnProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const canSend = chat.draft.trim().length > 0;

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [chat.messages.length]);

  function submit() {
    if (!canSend) return;
    chat.onSend();
  }

  return (
    <aside
      data-testid="matchmaking-chat"
      className={cn(
        "relative z-10 flex h-[55vh] min-h-0 flex-col border-t border-accent-quiet/30",
        "bg-[rgba(10,12,18,0.82)] backdrop-blur-sm",
        "lg:h-screen lg:border-l lg:border-t-0",
      )}
    >
      <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-4">
        <header className="flex items-center justify-between gap-2 border-b border-accent-quiet/20 pb-2">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-ink-mute">
            Чат лобі
          </span>
          <span className="text-[10px] tabular-nums text-ink-mute">
            {chat.messages.length}/200
          </span>
        </header>

        <div
          ref={listRef}
          className="grid content-start gap-2 overflow-y-auto pr-1 [scrollbar-color:var(--color-accent-quiet)_transparent] [scrollbar-width:thin]"
          data-testid="matchmaking-chat-list"
        >
          {chat.messages.length === 0 ? (
            <span className="self-center text-center text-sm text-ink-mute">
              Повідомлень ще немає.
            </span>
          ) : (
            chat.messages.map((message) => (
              <ChatBubble
                key={message.id}
                message={message}
                own={isOwnChatMessage(
                  message.authorId,
                  message.authorName,
                  chat.sessionId,
                  playerName,
                )}
              />
            ))
          )}
        </div>

        <form
          className="grid grid-cols-[1fr_auto] gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            className="min-h-[40px] min-w-0 rounded border border-accent-quiet/60 bg-surface px-3 text-sm text-ink outline-none transition placeholder:text-ink-mute focus:border-accent"
            value={chat.draft}
            maxLength={240}
            onChange={(event) => chat.onDraftChange(event.target.value)}
            placeholder="Написати..."
            data-testid="matchmaking-chat-input"
          />
          <button
            type="submit"
            disabled={!canSend}
            data-testid="matchmaking-chat-send"
            className="min-h-[40px] rounded border border-accent-quiet bg-surface px-4 text-xs font-medium uppercase tracking-wider text-accent transition enabled:hover:border-accent enabled:hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
          >
            OK
          </button>
        </form>
      </section>
    </aside>
  );
}

function ChatBubble({ message, own }: { message: MatchmakingChatMessage; own: boolean }) {
  return (
    <article
      data-testid="matchmaking-chat-message"
      data-own={own ? "true" : "false"}
      className={cn(
        "max-w-[94%] rounded border px-2 py-1.5",
        own
          ? "justify-self-end border-accent-quiet/40 bg-accent/[0.06] text-right"
          : "justify-self-start border-accent-quiet/30 bg-surface",
      )}
    >
      <b
        className={cn(
          "block truncate text-[10px] uppercase tracking-wider",
          own ? "text-accent" : "text-cool",
        )}
      >
        {message.authorName}
      </b>
      <span className="block break-words text-sm leading-snug text-ink">{message.text}</span>
    </article>
  );
}

export default MatchmakingScreen;

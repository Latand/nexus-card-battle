"use client";

import { useEffect, useRef, useState } from "react";
import { useLobbyChat, type LobbyChatMessage } from "@/features/presence/client";
import { cn } from "@/shared/lib/cn";
import { Modal } from "./Modal";

export type LobbyChatDrawerProps = {
  open: boolean;
  onClose: () => void;
  userName?: string;
};

export function LobbyChatDrawer({ open, onClose, userName }: LobbyChatDrawerProps) {
  const { sessionId, chatMessages, sendMessage } = useLobbyChat(userName);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const canSend = draft.trim().length > 0;

  useEffect(() => {
    const list = listRef.current;
    if (!list || !open) return;
    list.scrollTop = list.scrollHeight;
  }, [chatMessages.length, open]);

  function submit() {
    if (!sendMessage(draft)) return;
    setDraft("");
  }

  return (
    <Modal open={open} onClose={onClose} size="drawer-right" ariaLabel="Чат лобі">
      <section
        className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-4"
        data-testid="lobby-chat"
      >
        <header className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-ink-mute">Чат лобі</span>
          <span className="text-[10px] tabular-nums text-ink-mute">{chatMessages.length}/200</span>
        </header>

        <div
          ref={listRef}
          className="grid content-start gap-2 overflow-y-auto pr-1 [scrollbar-color:var(--color-accent-quiet)_transparent] [scrollbar-width:thin]"
          data-testid="lobby-chat-list"
        >
          {chatMessages.length === 0 ? (
            <span className="self-center text-center text-sm text-ink-mute">Повідомлень ще немає.</span>
          ) : (
            chatMessages.map((message) => (
              <ChatBubble key={message.id} message={message} own={message.authorId === sessionId} />
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
            value={draft}
            maxLength={240}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Написати..."
            data-testid="lobby-chat-input"
          />
          <button
            type="submit"
            disabled={!canSend}
            data-testid="lobby-chat-send"
            className="min-h-[40px] rounded border border-accent-quiet bg-surface px-4 text-xs font-medium uppercase tracking-wider text-accent transition enabled:hover:border-accent enabled:hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
          >
            OK
          </button>
        </form>
      </section>
    </Modal>
  );
}

function ChatBubble({ message, own }: { message: LobbyChatMessage; own: boolean }) {
  return (
    <article
      className={cn(
        "max-w-[94%] rounded border px-2 py-1.5",
        own ? "justify-self-end border-accent-quiet/40 bg-accent/[0.06] text-right" : "justify-self-start border-accent-quiet/30 bg-surface",
      )}
    >
      <b className={cn("block truncate text-[10px] uppercase tracking-wider", own ? "text-accent" : "text-cool")}>
        {message.authorName}
      </b>
      <span className="block break-words text-sm leading-snug text-ink">{message.text}</span>
    </article>
  );
}

export default LobbyChatDrawer;

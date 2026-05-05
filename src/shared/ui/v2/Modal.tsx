"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/shared/lib/cn";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  size?: "sm" | "md" | "lg" | "wide" | "sheet-mobile" | "drawer-right";
  panelClassName?: string;
  children: React.ReactNode;
  ariaLabel?: string;
};

const PANEL_BASE = "bg-surface-raised text-ink flex flex-col overflow-hidden border border-accent-quiet";

let scrollLockCount = 0;
let previousHtmlOverflow = "";
let previousHtmlOverscrollBehavior = "";
let previousBodyOverflow = "";
let previousBodyOverscrollBehavior = "";

const PANEL_CLASS: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-[480px] w-[calc(100%-32px)] max-h-[calc(100dvh-32px)] rounded-2xl",
  md: "max-w-[640px] w-[calc(100%-32px)] max-h-[calc(100dvh-32px)] rounded-2xl",
  lg: "max-w-[760px] w-[calc(100%-32px)] max-h-[calc(100dvh-32px)] rounded-2xl",
  wide: "max-w-[1080px] w-[calc(100%-32px)] max-h-[calc(100dvh-32px)] rounded-2xl",
  "sheet-mobile":
    "absolute inset-x-0 bottom-0 top-6 h-[calc(var(--app-height)-1.5rem)] w-full rounded-t-2xl rounded-b-none border-b-0",
  "drawer-right":
    "absolute top-0 right-0 bottom-0 h-[var(--app-height)] w-[520px] max-w-full rounded-none border-r-0",
};

export function Modal({ open, onClose, size = "md", panelClassName, children, ariaLabel }: ModalProps) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    return lockPageScroll();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target === ref.current) onClose();
  };

  const fillScreen = size === "sheet-mobile" || size === "drawer-right";

  return (
    <dialog
      ref={ref}
      aria-label={ariaLabel}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={handleBackdropClick}
      className={cn(
        "fixed inset-0 p-0 m-0 bg-transparent text-ink backdrop:bg-black/70 overscroll-contain",
        fillScreen
          ? "open:block w-screen h-[var(--app-height)] max-w-none max-h-none overflow-hidden"
          : "open:flex items-center justify-center max-w-none max-h-none w-screen h-[var(--app-height)] overflow-hidden",
      )}
    >
      <div className={cn(PANEL_BASE, "overscroll-contain", PANEL_CLASS[size], panelClassName)}>{children}</div>
    </dialog>
  );
}

export default Modal;

function lockPageScroll() {
  if (scrollLockCount === 0) {
    previousHtmlOverflow = document.documentElement.style.overflow;
    previousHtmlOverscrollBehavior = document.documentElement.style.overscrollBehavior;
    previousBodyOverflow = document.body.style.overflow;
    previousBodyOverscrollBehavior = document.body.style.overscrollBehavior;

    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
  }

  scrollLockCount += 1;

  return () => {
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount > 0) return;

    document.documentElement.style.overflow = previousHtmlOverflow;
    document.documentElement.style.overscrollBehavior = previousHtmlOverscrollBehavior;
    document.body.style.overflow = previousBodyOverflow;
    document.body.style.overscrollBehavior = previousBodyOverscrollBehavior;
  };
}

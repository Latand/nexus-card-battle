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

const PANEL_CLASS: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-[480px] w-[calc(100%-32px)] max-h-[calc(100dvh-32px)] rounded-2xl",
  md: "max-w-[640px] w-[calc(100%-32px)] max-h-[calc(100dvh-32px)] rounded-2xl",
  lg: "max-w-[760px] w-[calc(100%-32px)] max-h-[calc(100dvh-32px)] rounded-2xl",
  wide: "max-w-[1080px] w-[calc(100%-32px)] max-h-[calc(100dvh-32px)] rounded-2xl",
  "sheet-mobile":
    "absolute inset-x-0 bottom-0 top-6 w-full rounded-t-2xl rounded-b-none border-b-0 animate-[modal-sheet-up_280ms_cubic-bezier(0.22,1,0.36,1)]",
  "drawer-right":
    "absolute top-0 right-0 bottom-0 h-full w-[520px] max-w-full rounded-none border-r-0 animate-[modal-drawer-in_280ms_cubic-bezier(0.22,1,0.36,1)]",
};

export function Modal({ open, onClose, size = "md", panelClassName, children, ariaLabel }: ModalProps) {
  const ref = useRef<HTMLDialogElement | null>(null);

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
        "p-0 m-0 bg-transparent text-ink backdrop:bg-black/70",
        fillScreen
          ? "open:block w-screen h-dvh max-w-none max-h-none"
          : "open:flex items-center justify-center max-w-none max-h-none w-screen h-dvh",
      )}
    >
      <div className={cn(PANEL_BASE, PANEL_CLASS[size], panelClassName)}>{children}</div>
    </dialog>
  );
}

export default Modal;

"use client";

import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/shared/lib/cn";

type TooltipPosition = {
  left: number;
  top: number;
  placement: "top" | "bottom";
};

export function CardTooltip({
  children,
  eyebrow,
  title,
  description,
  className,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  className?: string;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;

    const rect = trigger.getBoundingClientRect();
    const tooltipHalfWidth = Math.min(150, Math.max(112, window.innerWidth / 2 - 12));
    const left = clamp(rect.left + rect.width / 2, tooltipHalfWidth + 8, window.innerWidth - tooltipHalfWidth - 8);
    const hasRoomAbove = rect.top > 168;

    setPosition({
      left,
      top: hasRoomAbove ? rect.top - 10 : rect.bottom + 10,
      placement: hasRoomAbove ? "top" : "bottom",
    });
  }, []);

  function show() {
    updatePosition();
    setOpen(true);
  }

  function hide() {
    if (pinned) return;
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!pinned) return;

    function closePinnedTooltip(event: PointerEvent) {
      if (triggerRef.current?.contains(event.target as Node)) return;
      setPinned(false);
      setOpen(false);
    }

    document.addEventListener("pointerdown", closePinnedTooltip);
    return () => document.removeEventListener("pointerdown", closePinnedTooltip);
  }, [pinned]);

  return (
    <span className={cn("relative inline-flex min-w-0", className)} onPointerEnter={show} onPointerLeave={hide}>
      <span
        ref={triggerRef}
        aria-describedby={open ? id : undefined}
        className="inline-flex min-w-0 cursor-help rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-[#ffe08a]/80"
        role="button"
        tabIndex={0}
        onBlur={hide}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          updatePosition();
          setOpen(true);
          setPinned((value) => !value);
        }}
        onFocus={show}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          updatePosition();
          setOpen(true);
          setPinned((value) => !value);
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {children}
      </span>

      {open && position
        ? createPortal(
            <div
              id={id}
              role="tooltip"
              className={cn(
                "pointer-events-none fixed z-[80] w-[min(300px,calc(100vw-20px))] rounded-md border border-[#ffe08a]/55 bg-[linear-gradient(180deg,rgba(25,30,32,0.98),rgba(7,8,10,0.98))] px-3 py-2 text-left text-[#fff7df] shadow-[0_18px_44px_rgba(0,0,0,0.68),inset_0_0_0_1px_rgba(255,255,255,0.08)]",
                position.placement === "top" ? "-translate-x-1/2 -translate-y-full" : "-translate-x-1/2",
              )}
              style={{ left: position.left, top: position.top }}
            >
              <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-[#65d7e9]">{eyebrow}</span>
              <strong className="mt-0.5 block text-sm font-black uppercase leading-tight text-[#ffe08a]">{title}</strong>
              <span className="mt-1 block text-xs font-bold leading-snug text-[#d9ceb2]">{description}</span>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

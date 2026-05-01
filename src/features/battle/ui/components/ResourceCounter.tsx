import { cn } from "@/shared/lib/cn";

export function ResourceCounter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "health" | "energy";
}) {
  return (
    <div className="grid min-h-[58px] place-items-center gap-0.5 border-x border-white/10 max-[960px]:min-h-[52px] max-[760px]:min-h-[46px]">
      <span className="text-[9px] font-black uppercase tracking-[0.08em] text-[#c6d5d8] max-[760px]:hidden">{label}</span>
      <strong
        className={cn(
          "grid min-h-[26px] min-w-[46px] place-items-center rounded-full text-xl leading-none text-[#111] shadow-[inset_0_-4px_0_rgba(0,0,0,0.18),0_0_14px_rgba(255,255,255,0.18)]",
          "max-[760px]:min-h-6 max-[760px]:min-w-9 max-[760px]:text-[17px] max-[620px]:min-h-[22px] max-[620px]:min-w-[31px] max-[620px]:text-[15px]",
          tone === "energy" ? "bg-[linear-gradient(180deg,#ffe889,#d99a22)]" : "bg-[linear-gradient(180deg,#b9f56c,#3fad48)]",
        )}
      >
        {value}
      </strong>
    </div>
  );
}

export function NamePlate({ name, player = false }: { name: string; player?: boolean }) {
  return (
    <div
      className={cn(
        "relative grid min-h-[58px] place-items-center overflow-hidden max-[960px]:min-h-[52px] max-[760px]:min-h-[46px]",
        player
          ? "bg-[linear-gradient(90deg,rgba(244,190,77,0.20),rgba(0,0,0,0.42),rgba(244,190,77,0.20))]"
          : "bg-[linear-gradient(90deg,rgba(73,210,231,0.16),rgba(0,0,0,0.42),rgba(73,210,231,0.16))]",
        "before:absolute before:left-[-10px] before:top-0 before:h-full before:w-[34px] before:bg-[linear-gradient(135deg,transparent_0_48%,rgba(73,210,231,0.72)_49%_55%,transparent_56%)] before:content-['']",
        "after:absolute after:right-[-10px] after:top-0 after:h-full after:w-[34px] after:scale-x-[-1] after:bg-[linear-gradient(135deg,transparent_0_48%,rgba(73,210,231,0.72)_49%_55%,transparent_56%)] after:content-['']",
      )}
    >
      <strong className="relative z-[1] text-2xl font-black uppercase tracking-[0.02em] text-[#f4fbff] max-[960px]:text-xl max-[760px]:text-base max-[620px]:text-[13px]">
        {name}
      </strong>
    </div>
  );
}

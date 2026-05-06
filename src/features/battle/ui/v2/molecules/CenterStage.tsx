import { cn } from "@/shared/lib/cn";

export type CenterStageVariant =
  | { kind: "your_turn"; subtitle?: string }
  | { kind: "opponent_thinking" }
  | { kind: "round_intro"; round: number }
  | { kind: "match_intro"; opponentName: string; mode: "ai" | "pvp"; aiModelLabel?: string }
  | {
      kind: "round_result";
      winner: "player" | "opponent" | "draw";
      damage: number;
    };

export type CenterStageProps = {
  variant: CenterStageVariant;
  className?: string;
};

const TITLE_CLASS = "text-[22px] sm:text-[34px] leading-none uppercase tracking-[0.06em] text-ink";
const SUBTITLE_CLASS = "text-[12px] sm:text-[14px] text-ink-mute leading-tight max-w-[42ch]";

export function CenterStage({ variant, className }: CenterStageProps) {
  return (
    <section
      data-testid="center-stage"
      data-variant={variant.kind}
      className={cn(
        "w-full flex flex-col items-center justify-center text-center px-4 py-5 sm:py-6 gap-2",
        className,
      )}
    >
      {renderInner(variant)}
    </section>
  );
}

function renderInner(variant: CenterStageVariant) {
  switch (variant.kind) {
    case "your_turn":
      return (
        <>
          <h2 className={TITLE_CLASS} data-testid="round-status">
            ТВІЙ ХІД
          </h2>
          <p className={SUBTITLE_CLASS}>
            {variant.subtitle ?? "Обери бійця, вклади енергію й випусти його на арену."}
          </p>
        </>
      );
    case "opponent_thinking":
      return (
        <>
          <h2 className={TITLE_CLASS} data-testid="round-status">
            ХІД СУПЕРНИКА
          </h2>
          <p
            className={cn(SUBTITLE_CLASS, "inline-flex items-center gap-1")}
            data-testid="center-stage-thinking"
          >
            <span>Суперник обирає відповідь</span>
            <ThinkingDots />
          </p>
        </>
      );
    case "round_intro":
      return (
        <>
          <h2 className={TITLE_CLASS} data-testid="round-status">
            РАУНД {variant.round}
          </h2>
          <p className={SUBTITLE_CLASS}>Карти оновлено.</p>
        </>
      );
    case "match_intro":
      return (
        <>
          <h2 className={TITLE_CLASS} data-testid="round-status">
            БІЙ ПОЧИНАЄТЬСЯ
          </h2>
          <p className={SUBTITLE_CLASS}>
            Суперник: <span className="text-ink/90">{variant.opponentName}</span>
            <span className="ml-2 inline-flex items-center px-1.5 h-4 text-[9px] uppercase tracking-wider rounded border border-accent-quiet text-accent/80 align-middle">
              {variant.mode === "pvp" ? "LIVE" : "BOT"}
            </span>
            {variant.mode === "ai" && variant.aiModelLabel ? (
              <span className="ml-2 inline-flex items-center px-1.5 h-4 text-[9px] uppercase tracking-wider rounded border border-cool/60 text-cool align-middle">
                {variant.aiModelLabel}
              </span>
            ) : null}
          </p>
        </>
      );
    case "round_result": {
      const headline =
        variant.winner === "draw"
          ? "НІЧИЯ"
          : variant.winner === "player"
            ? "РАУНД ЗА ТОБОЮ"
            : "РАУНД ЗА СУПЕРНИКОМ";
      return (
        <>
          <h2 className={TITLE_CLASS} data-testid="round-status">
            {headline}
          </h2>
          <p className={SUBTITLE_CLASS}>
            {variant.winner === "draw" ? "Без урону." : `Завдано ${variant.damage} урону.`}
          </p>
        </>
      );
    }
  }
}

function ThinkingDots() {
  return (
    <span aria-hidden className="inline-flex items-center gap-0.5">
      <Dot delay="0ms" />
      <Dot delay="150ms" />
      <Dot delay="300ms" />
    </span>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block w-1 h-1 rounded-full bg-accent animate-pulse"
      style={{ animationDelay: delay }}
    />
  );
}

export default CenterStage;

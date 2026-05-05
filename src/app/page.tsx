import { Suspense } from "react";
import { GameRoot } from "@/features/game/ui/GameRoot";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <GameRoot />
    </Suspense>
  );
}

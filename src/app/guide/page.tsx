import type { Metadata } from "next";
import { GuidePage } from "@/features/guide/ui/GuidePage";

export const metadata: Metadata = {
  title: "Як грати — Нексус",
  description:
    "Правила бою, формула атаки, статуси, бустери, рівні та PvP-рейтинг у грі Нексус.",
};

export default function GuideRoute() {
  return <GuidePage />;
}

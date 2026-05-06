import type { Metadata } from "next";
import { GuidePage } from "@/features/guide/ui/v2/GuidePage";

export const metadata: Metadata = {
  title: "Як грати — Нексус",
  description:
    "Правила бою, формула атаки, статуси, бустери, рівні та рейтинг арени у грі Нексус.",
};

export default function GuideRoute() {
  return <GuidePage />;
}

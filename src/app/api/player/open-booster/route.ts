import { handleStarterBoosterOpenPost } from "@/features/boosters/api";
import { getMongoPlayerProfileStore } from "@/features/player/profile/mongo";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleStarterBoosterOpenPost(request, getMongoPlayerProfileStore());
}

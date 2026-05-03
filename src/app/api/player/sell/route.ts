import { handlePlayerSellPost } from "@/features/player/profile/api";
import { getMongoPlayerProfileStore } from "@/features/player/profile/mongo";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handlePlayerSellPost(request, getMongoPlayerProfileStore());
}

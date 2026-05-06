import { handleBoosterCatalogGet, handleBoosterCatalogPost } from "@/features/boosters/api";
import { getMongoPlayerProfileStore } from "@/features/player/profile/mongo";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleBoosterCatalogGet(request, getMongoPlayerProfileStore());
}

export async function POST(request: Request) {
  return handleBoosterCatalogPost(request, getMongoPlayerProfileStore());
}

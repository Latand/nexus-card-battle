import { handleBoosterCatalogGet, handleBoosterCatalogPost } from "@/features/boosters/api";
import { getMongoPlayerProfileStore } from "@/features/player/profile/mongo";

export const runtime = "nodejs";

export async function GET() {
  return handleBoosterCatalogGet();
}

export async function POST(request: Request) {
  return handleBoosterCatalogPost(request, getMongoPlayerProfileStore());
}

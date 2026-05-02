import { handlePlayerProfileGet, handlePlayerProfilePost } from "@/features/player/profile/api";
import { getMongoPlayerProfileStore } from "@/features/player/profile/mongo";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handlePlayerProfileGet(request, getMongoPlayerProfileStore());
}

export async function POST(request: Request) {
  return handlePlayerProfilePost(request, getMongoPlayerProfileStore());
}

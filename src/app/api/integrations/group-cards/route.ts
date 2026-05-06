import { handleGroupCardPost } from "@/features/integrations/api";
import { getMongoPlayerProfileStore } from "@/features/player/profile/mongo";

export async function POST(request: Request) {
  return handleGroupCardPost(request, getMongoPlayerProfileStore());
}

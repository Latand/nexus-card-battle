import { handleGroupUpsertPut } from "@/features/integrations/api";
import { getMongoPlayerProfileStore } from "@/features/player/profile/mongo";

export async function PUT(request: Request, context: { params: Promise<{ chatId: string }> }) {
  return handleGroupUpsertPut(request, context, getMongoPlayerProfileStore());
}

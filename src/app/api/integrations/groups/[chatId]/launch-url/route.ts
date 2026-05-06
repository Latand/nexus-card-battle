import { handleGroupLaunchUrlPost } from "@/features/integrations/api";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ chatId: string }> }) {
  return handleGroupLaunchUrlPost(request, context);
}

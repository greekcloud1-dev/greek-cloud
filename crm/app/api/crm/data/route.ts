import { CrmStoreError, loadCrmData } from "@/lib/crm/store";

export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  try {
    return Response.json(await loadCrmData(), { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof CrmStoreError
            ? error.message
            : "טעינת הנתונים נכשלה. יש לנסות שוב.",
      },
      { status: error instanceof CrmStoreError ? error.status : 500, headers },
    );
  }
}

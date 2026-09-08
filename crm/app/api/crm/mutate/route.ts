import { CrmStoreError, mutateCrm } from "@/lib/crm/store";
import { isSameOrigin } from "@/lib/request/protection";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request) {
  try {
    // JSON plus a same-origin check protects cookie-authenticated writes from CSRF.
    if (!isSameOrigin(request))
      throw new CrmStoreError(403, "מקור הבקשה אינו מורשה.");
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    )
      throw new CrmStoreError(415, "נדרש תוכן בפורמט תקין.");
    if (Number(request.headers.get("content-length")) > 16000)
      throw new CrmStoreError(413, "הבקשה גדולה מדי.");
    const reader = request.body?.getReader();
    const decoder = new TextDecoder();
    let body = "";
    let bytesRead = 0;
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytesRead += chunk.value.byteLength;
        if (bytesRead > 16000) {
          await reader.cancel();
          throw new CrmStoreError(413, "הבקשה גדולה מדי.");
        }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
    }
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new CrmStoreError(400, "הבקשה אינה תקינה.");
    }
    return Response.json(await mutateCrm(payload), { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof CrmStoreError
            ? error.message
            : "שמירת השינוי נכשלה. יש לנסות שוב.",
      },
      { status: error instanceof CrmStoreError ? error.status : 500, headers },
    );
  }
}

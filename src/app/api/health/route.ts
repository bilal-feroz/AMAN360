import { handler } from "@/server/http";
import { providerStatus } from "@/server/comms/providers";
import { currentVersion } from "@/server/bus";

export const dynamic = "force-dynamic";

export const GET = handler(async () => ({
  ok: true,
  version: currentVersion(),
  communication: providerStatus(),
  time: new Date().toISOString(),
}));

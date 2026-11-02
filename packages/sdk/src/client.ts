import createClient from "openapi-fetch";
import type { paths } from "./public-api.d.ts";

/** No provider calls are made at construction; callers supply their own API key. */
export function createNeuroGatewayClient(baseUrl: string, apiKey: string) {
  return createClient<paths>({
    baseUrl,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

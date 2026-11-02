import createClient from "openapi-fetch";
import type { paths } from "./internal-api.js";

// Supply the session-bound token from the authentication flow, never from a public env var.
export function createInternalClient(baseUrl: string, csrfToken: string) {
  return createClient<paths>({
    baseUrl,
    credentials: "include",
    headers: { "X-CSRF-Token": csrfToken },
  });
}

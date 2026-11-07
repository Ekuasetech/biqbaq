import { createHash } from "node:crypto";

/**
 * Cloudinary's upload signature: the parameters sorted by name, joined as a query
 * string, followed by the secret, and hashed with SHA-1.
 */
export function signParams(params: Record<string, string | number>, secret: string): string {
  const joined = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(joined + secret).digest("hex");
}

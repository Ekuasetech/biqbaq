import "server-only";
import { randomUUID } from "node:crypto";
import { adFolder, blogFolder, productFolder, vehicleFolder, type AssetFacts, type MediaLimits } from "./rules";
import { signParams } from "./signature";

// The only code that uses the Cloudinary secret. It never leaves the server.

function config() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret, root: process.env.CLOUDINARY_FOLDER || "biqbaq" };
}

export const isConfigured = () => config() !== null;
export const mediaRoot = () => config()?.root ?? "biqbaq";

const now = () => Math.floor(Date.now() / 1000);

/** Permission for one upload, to one new file name in one folder, in the allowed formats. */
function signUpload(folder: (root: string) => string, limits: MediaLimits) {
  const c = config();
  if (!c) throw new Error("Cloudinary is not configured");
  const params = {
    allowed_formats: limits.formats.join(","),
    overwrite: "false",
    public_id: `${folder(c.root)}/${randomUUID()}`,
    timestamp: now(),
  };
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${c.cloudName}/image/upload`,
    fields: { ...params, api_key: c.apiKey, signature: signParams(params, c.apiSecret) },
  };
}

export const signProductUpload = (productId: string, limits: MediaLimits) => signUpload((root) => productFolder(root, productId), limits);
export const signVehicleImageUpload = (listingId: string, limits: MediaLimits) => signUpload((root) => vehicleFolder(root, listingId), limits);
export const signAdImageUpload = (adId: string, limits: MediaLimits) => signUpload((root) => adFolder(root, adId), limits);
export const signBlogCoverUpload = (postId: string, limits: MediaLimits) => signUpload((root) => blogFolder(root, postId), limits);

export interface CloudinaryAsset extends AssetFacts {
  secure_url: string;
}

/** The real file's details, from Cloudinary rather than from the browser. Null if absent. */
export async function fetchAsset(publicId: string): Promise<CloudinaryAsset | null> {
  const c = config();
  if (!c) throw new Error("Cloudinary is not configured");
  const path = publicId.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`https://api.cloudinary.com/v1_1/${c.cloudName}/resources/image/upload/${path}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${c.apiKey}:${c.apiSecret}`).toString("base64")}` },
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Cloudinary asset check failed: ${response.status}`);
  return response.json();
}

export function isCloudinaryUrl(url: string): boolean {
  const c = config();
  return Boolean(c && url.startsWith(`https://res.cloudinary.com/${c.cloudName}/image/upload/`));
}

export async function destroyAsset(publicId: string): Promise<void> {
  const c = config();
  if (!c) throw new Error("Cloudinary is not configured");
  const params = { invalidate: "true", public_id: publicId, timestamp: now() };
  const body = new URLSearchParams({
    ...params,
    timestamp: String(params.timestamp),
    api_key: c.apiKey,
    signature: signParams(params, c.apiSecret),
  });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${c.cloudName}/image/destroy`, { method: "POST", body, cache: "no-store" });
  if (!response.ok) throw new Error(`Cloudinary delete failed: ${response.status}`);
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { shrinkSteps, type MediaLimits } from "./rules";

// Browser side of uploading. These checks only help people: the server has the final say.

export interface ShopPhoto {
  id: string;
  entity_id: string;
  secure_url: string;
  is_primary: boolean;
  display_order: number;
}

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Carries a stable code, which the screen turns into a message. */
export class MediaError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function api<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new MediaError(body?.error?.code ?? "GENERIC");
  return body.data as T;
}

const postJson = <T>(path: string, data: unknown) =>
  api<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

/**
 * Redraws the photo at a size that fits. Drawing it again also removes hidden details
 * such as GPS location, so this always runs, even for photos that are small enough.
 */
async function prepareImage(file: File, limits: MediaLimits): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new MediaError("UNREADABLE");
  }
  try {
    for (const step of shrinkSteps(bitmap.width, bitmap.height, limits.max_dimension)) {
      const canvas = document.createElement("canvas");
      canvas.width = step.width;
      canvas.height = step.height;
      const context = canvas.getContext("2d");
      if (!context) throw new MediaError("UNREADABLE");
      // JPEG has no transparency, so transparent areas become white rather than black.
      context.fillStyle = "#fff";
      context.fillRect(0, 0, step.width, step.height);
      context.drawImage(bitmap, 0, 0, step.width, step.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", step.quality));
      if (blob && blob.size <= limits.max_bytes) return blob;
    }
  } finally {
    bitmap.close();
  }
  throw new MediaError("TOO_LARGE");
}

export async function uploadProductPhoto(productId: string, file: File): Promise<void> {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new MediaError("FORMAT");

  const { uploadUrl, fields, limits } = await postJson<{
    uploadUrl: string;
    fields: Record<string, string | number>;
    limits: MediaLimits;
  }>("/api/v1/media/sign", { productId });

  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
  form.append("file", await prepareImage(file, limits), "photo.jpg");

  const upload = await fetch(uploadUrl, { method: "POST", body: form });
  if (!upload.ok) throw new MediaError("UPLOAD_FAILED");

  await postJson("/api/v1/media/complete", { productId, publicId: fields.public_id });
}

export async function uploadBlogCover(postId: string, file: File): Promise<void> {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new MediaError("FORMAT");
  const { uploadUrl, fields, limits } = await postJson<{
    uploadUrl: string;
    fields: Record<string, string | number>;
    limits: MediaLimits;
  }>("/api/v1/media/blog-cover/sign", { postId });
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
  form.append("file", await prepareImage(file, limits), "cover.jpg");
  const upload = await fetch(uploadUrl, { method: "POST", body: form });
  if (!upload.ok) throw new MediaError("UPLOAD_FAILED");
  await postJson("/api/v1/media/blog-cover/complete", { postId, publicId: fields.public_id });
}

/** Uploads one photo for inside an article, and gives back its address to put in the text. */
export async function uploadBlogImage(postId: string, file: File): Promise<string> {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new MediaError("FORMAT");
  const { uploadUrl, fields, limits } = await postJson<{
    uploadUrl: string;
    fields: Record<string, string | number>;
    limits: MediaLimits;
  }>("/api/v1/media/blog-image/sign", { postId });
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
  form.append("file", await prepareImage(file, limits), "photo.jpg");
  const upload = await fetch(uploadUrl, { method: "POST", body: form });
  if (!upload.ok) throw new MediaError("UPLOAD_FAILED");
  const { url } = await postJson<{ url: string }>("/api/v1/media/blog-image/complete", { postId, publicId: fields.public_id });
  return url;
}

export const removeBlogCover = (postId: string) => postJson<void>("/api/v1/media/blog-cover/remove", { postId });

export const removeProductPhoto = (id: string) => api<void>(`/api/v1/media/${id}`, { method: "DELETE" });

export async function makeMainPhoto(supabase: SupabaseClient, id: string) {
  return supabase.rpc("make_product_image_primary", { p_asset_id: id });
}

export async function getPhotoLimit(supabase: SupabaseClient) {
  return supabase.rpc("product_image_limit");
}

export async function listShopPhotos(supabase: SupabaseClient, productIds: string[]) {
  return supabase
    .from("media_assets")
    .select("id, entity_id, secure_url, is_primary, display_order")
    .eq("entity_type", "product")
    .in("entity_id", productIds)
    .order("display_order");
}

const MESSAGE_KEYS: Record<string, string> = {
  FORMAT: "format",
  UNREADABLE: "unreadable",
  TOO_LARGE: "tooLarge",
  IMAGE_LIMIT_REACHED: "limit",
  IMAGE_REJECTED: "rejected",
  PRODUCT_NOT_EDITABLE: "notEditable",
  NOT_AUTHORIZED: "notAllowed",
  NOT_SIGNED_IN: "notAllowed",
  MEDIA_NOT_CONFIGURED: "unavailable",
};

export const photoErrorKey = (error: unknown) =>
  (error instanceof Error && MESSAGE_KEYS[error.message]) || "generic";

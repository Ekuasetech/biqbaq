// Shared by the browser and the server, with no secrets.

export interface MediaLimits {
  max_images: number;
  max_bytes: number;
  max_dimension: number;
  formats: string[];
}

export interface AssetFacts {
  bytes: number;
  format: string;
  width: number;
  height: number;
}

/** The server's check of the real file. Null means it is acceptable. */
export function assetProblem(asset: AssetFacts, limits: MediaLimits): "size" | "format" | "dimensions" | null {
  if (!limits.formats.includes(asset.format.toLowerCase())) return "format";
  if (asset.bytes > limits.max_bytes) return "size";
  if (asset.width > limits.max_dimension || asset.height > limits.max_dimension) return "dimensions";
  return null;
}

export const productFolder = (root: string, productId: string) => `${root}/products/${productId}`;
export const blogFolder = (root: string, postId: string) => `${root}/blog/${postId}`;
export const adFolder = (root: string, adId: string) => `${root}/ads/${adId}`;
export const vehicleFolder = (root: string, listingId: string) => `${root}/vehicles/${listingId}`;
export const siteImageFolder = (root: string, slot: string) => `${root}/site/${slot}`;

/** True only for a file this server would have named for this front-page photo slot. */
export function isOwnSiteImage(publicId: string, root: string, slot: string): boolean {
  const prefix = `${siteImageFolder(root, slot)}/`;
  return publicId.startsWith(prefix) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(publicId.slice(prefix.length));
}

/** True only for a file this server would have named for this vehicle listing. */
export function isOwnVehicleImage(publicId: string, root: string, listingId: string): boolean {
  const prefix = `${vehicleFolder(root, listingId)}/`;
  return publicId.startsWith(prefix) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(publicId.slice(prefix.length));
}

/** True only for a file this server would have named for this ad. */
export function isOwnAdImage(publicId: string, root: string, adId: string): boolean {
  const prefix = `${adFolder(root, adId)}/`;
  return publicId.startsWith(prefix) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(publicId.slice(prefix.length));
}

/** True only for a file this server would have named for this blog post's cover. */
export function isOwnBlogCover(publicId: string, root: string, postId: string): boolean {
  const prefix = `${blogFolder(root, postId)}/`;
  return publicId.startsWith(prefix) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(publicId.slice(prefix.length));
}

/** True only for a file this server would have named for this product. */
export function isOwnPublicId(publicId: string, root: string, productId: string): boolean {
  const prefix = `${productFolder(root, productId)}/`;
  return (
    publicId.startsWith(prefix) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(publicId.slice(prefix.length))
  );
}

export interface ShrinkStep {
  width: number;
  height: number;
  quality: number;
}

const START_DIMENSION = 2000;
const MIN_DIMENSION = 400;
const QUALITIES = [0.85, 0.7, 0.55];

/** Sizes to try in turn, best first, until one fits under the byte limit. */
export function shrinkSteps(width: number, height: number, maxDimension: number): ShrinkStep[] {
  const steps: ShrinkStep[] = [];
  let longest = Math.min(Math.max(width, height), maxDimension, START_DIMENSION);
  const scale = (side: number, target: number) => Math.max(1, Math.round((side * target) / Math.max(width, height)));
  while (true) {
    for (const quality of QUALITIES) steps.push({ width: scale(width, longest), height: scale(height, longest), quality });
    if (longest <= MIN_DIMENSION) return steps;
    longest = Math.max(MIN_DIMENSION, Math.round(longest * 0.75));
  }
}

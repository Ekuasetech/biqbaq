import { cacheLife, cacheTag } from "next/cache";
import { getSupabasePublicClient } from "@/lib/supabase/public";
import { CATALOG_CACHE_TAG } from "@/modules/product-catalog/types";

/** Public fields of a vehicle going to Nigeria with room for cargo (PRD §8). */
export interface CargoVehicle {
  id: string;
  slug: string;
  year: number;
  make: string;
  model: string;
  images: { url: string; alt: string }[];
  origin: string;
  destination: string;
  /** ISO date. An estimate supplied by the dealer. */
  estimatedDeparture: string;
  /** The weight of goods it can still take (owner's decision, 2026-11-07). */
  availableKg: number;
  restrictions: string[];
  status: "accepting_cargo" | "full";
  views: number;
  dealer: { name: string; slug: string; verified: boolean };
}

interface VehicleRow {
  id: string;
  slug: string;
  make: string;
  model: string;
  year: number;
  origin_city: string;
  destination_city: string;
  departure_date: string;
  available_kg: number;
  restrictions: string[];
  cargo_status: CargoVehicle["status"];
  view_count: number;
  images: { url: string; alt: string }[] | null;
  seller_slug: string;
  seller_name: string;
  seller_verified: boolean;
}

export const toCargoVehicle = (row: VehicleRow): CargoVehicle => ({
  id: row.id,
  slug: row.slug,
  year: row.year,
  make: row.make,
  model: row.model,
  images: row.images ?? [],
  origin: row.origin_city,
  destination: row.destination_city,
  estimatedDeparture: row.departure_date,
  availableKg: row.available_kg,
  restrictions: row.restrictions ?? [],
  status: row.cargo_status,
  views: Number(row.view_count),
  dealer: { name: row.seller_name, slug: row.seller_slug, verified: row.seller_verified },
});

const bySoonestDeparture = (a: CargoVehicle, b: CargoVehicle) => a.estimatedDeparture.localeCompare(b.estimatedDeparture);

/**
 * Every trip the public may see. Cached with the catalogue, so a seller's change clears it, and
 * a trip whose date has passed drops out within minutes.
 */
async function allVehicles(): Promise<CargoVehicle[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);
  const { data, error } = await getSupabasePublicClient().from("public_vehicle_listings").select("*").order("departure_date").order("id").limit(500);
  if (error) throw new Error(`Cargo lookup failed: ${error.code}`);
  return ((data ?? []) as VehicleRow[]).map(toCargoVehicle);
}

// Pages read cargo listings only through these functions.

export async function listCargoVehicles(limit?: number): Promise<CargoVehicle[]> {
  return [...(await allVehicles())].sort(bySoonestDeparture).slice(0, limit);
}

export interface CargoFilters {
  from?: string;
  to?: string;
}

/** Reads filters from untrusted URL params. Anything not in the options is ignored. */
export function parseCargoFilters(params: Record<string, string | string[] | undefined>, vehicles: CargoVehicle[]): CargoFilters {
  const pick = (value: string | string[] | undefined, options: string[]) => {
    const single = Array.isArray(value) ? value[0] : value;
    return single && options.includes(single) ? single : undefined;
  };
  return {
    from: pick(params.from, vehicles.map((vehicle) => vehicle.origin)),
    to: pick(params.to, vehicles.map((vehicle) => vehicle.destination)),
  };
}

export function filterCargoVehicles(vehicles: CargoVehicle[], filters: CargoFilters): CargoVehicle[] {
  return vehicles.filter((vehicle) => (!filters.from || vehicle.origin === filters.from) && (!filters.to || vehicle.destination === filters.to));
}

/**
 * Looked up on its own, like a product, so a newly published car's page is found at once
 * rather than when the cached list next refreshes.
 */
export async function getCargoVehicleBySlug(slug: string): Promise<CargoVehicle | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);
  const { data, error } = await getSupabasePublicClient().from("public_vehicle_listings").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`Cargo lookup failed: ${error.code}`);
  return data ? toCargoVehicle(data as VehicleRow) : null;
}

export async function listCargoVehicleSlugs(): Promise<string[]> {
  return (await allVehicles()).map((vehicle) => vehicle.slug);
}

/** Other cars, those going to the same destination first, then soonest departure. */
export function relatedCargoVehicles(vehicles: CargoVehicle[], vehicle: CargoVehicle, limit: number): CargoVehicle[] {
  const sameDestination = (other: CargoVehicle) => (other.destination === vehicle.destination ? 0 : 1);
  return vehicles
    .filter((other) => other.id !== vehicle.id)
    .sort((a, b) => sameDestination(a) - sameDestination(b) || bySoonestDeparture(a, b))
    .slice(0, limit);
}

export async function listRelatedCargoVehicles(vehicle: CargoVehicle, limit: number): Promise<CargoVehicle[]> {
  return relatedCargoVehicles(await allVehicles(), vehicle, limit);
}

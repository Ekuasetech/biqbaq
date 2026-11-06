import { SAMPLE_CARGO_VEHICLES } from "./sample-data";

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
  /** Share of the vehicle's cargo space still free. The real unit is undecided. */
  availableSpacePercent: number;
  restrictions: string[];
  status: "accepting_cargo" | "full";
  views: number;
  dealer: { name: string; verified: boolean };
}

const bySoonestDeparture = (a: CargoVehicle, b: CargoVehicle) =>
  a.estimatedDeparture.localeCompare(b.estimatedDeparture);

// Pages read cargo listings only through these functions, so swapping sample
// data for Supabase does not change any caller.

export async function listCargoVehicles(limit?: number): Promise<CargoVehicle[]> {
  return [...SAMPLE_CARGO_VEHICLES].sort(bySoonestDeparture).slice(0, limit);
}

export interface CargoFilters {
  from?: string;
  to?: string;
}

/** Reads filters from untrusted URL params. Anything not in the options is ignored. */
export function parseCargoFilters(
  params: Record<string, string | string[] | undefined>,
  vehicles: CargoVehicle[],
): CargoFilters {
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
  return vehicles.filter(
    (vehicle) =>
      (!filters.from || vehicle.origin === filters.from) &&
      (!filters.to || vehicle.destination === filters.to),
  );
}

export async function getCargoVehicleBySlug(slug: string): Promise<CargoVehicle | null> {
  return SAMPLE_CARGO_VEHICLES.find((vehicle) => vehicle.slug === slug) ?? null;
}

export async function listCargoVehicleSlugs(): Promise<string[]> {
  return SAMPLE_CARGO_VEHICLES.map((vehicle) => vehicle.slug);
}

/** Other cars, those going to the same destination first, then soonest departure. */
export async function listRelatedCargoVehicles(vehicle: CargoVehicle, limit: number): Promise<CargoVehicle[]> {
  const sameDestination = (other: CargoVehicle) => (other.destination === vehicle.destination ? 0 : 1);
  return SAMPLE_CARGO_VEHICLES.filter((other) => other.id !== vehicle.id)
    .sort((a, b) => sameDestination(a) - sameDestination(b) || bySoonestDeparture(a, b))
    .slice(0, limit);
}

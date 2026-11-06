import { listProducts, type Money, type Product } from "@/modules/product-catalog";
import { listCargoVehicles, type CargoVehicle } from "@/modules/vehicle-marketplace";

export const SUGGESTION_MIN_LENGTH = 2;
const MAX_PRODUCTS = 5;
const MAX_CARS = 3;

/** Public fields only: this is returned by an unauthenticated endpoint. */
export type SearchSuggestion =
  | { type: "product"; id: string; title: string; detail: string; imageUrl: string | null; href: string; price: Money }
  | { type: "car"; id: string; title: string; detail: string; imageUrl: string | null; href: string };

/** Lower is better: title starts with the term, then contains it, then anything else. */
function rank(title: string, needle: string): number {
  const lower = title.toLowerCase();
  if (lower.startsWith(needle)) return 0;
  return lower.includes(needle) ? 1 : 2;
}

const byRank = <T extends { title: string }>(needle: string) => (a: T, b: T) =>
  rank(a.title, needle) - rank(b.title, needle);

const productSuggestion = (product: Product): SearchSuggestion => ({
  type: "product",
  id: product.id,
  title: product.name,
  detail: `${product.seller.name} · ${product.seller.city}`,
  imageUrl: product.images[0]?.url ?? null,
  href: `/products/${product.slug}`,
  price: product.price,
});

const carTitle = (car: CargoVehicle) => `${car.year} ${car.make} ${car.model}`;

const carSuggestion = (car: CargoVehicle): SearchSuggestion => ({
  type: "car",
  id: car.id,
  title: carTitle(car),
  detail: `${car.origin} → ${car.destination}`,
  imageUrl: car.images[0]?.url ?? null,
  href: `/cargo-cars/${car.slug}`,
});

export async function suggest(rawQuery: string): Promise<SearchSuggestion[]> {
  const q = rawQuery.trim();
  if (q.length < SUGGESTION_MIN_LENGTH) return [];
  const needle = q.toLowerCase();

  const { data: products } = await listProducts({ q, sort: "newest", page: 1, pageSize: 100 });
  const cars = (await listCargoVehicles()).filter((car) =>
    [carTitle(car), car.origin, car.destination].some((text) => text.toLowerCase().includes(needle)),
  );

  return [
    ...products.map(productSuggestion).sort(byRank(needle)).slice(0, MAX_PRODUCTS),
    ...cars.map(carSuggestion).sort(byRank(needle)).slice(0, MAX_CARS),
  ];
}

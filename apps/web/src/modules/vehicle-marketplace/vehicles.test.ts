import { describe, expect, it } from "vitest";
import { filterCargoVehicles, parseCargoFilters, relatedCargoVehicles, toCargoVehicle, type CargoVehicle } from "./index";

const car = (id: string, origin: string, destination: string, date: string): CargoVehicle => ({
  id, slug: id, year: 2020, make: "Toyota", model: id, images: [], origin, destination, estimatedDeparture: date,
  availableKg: 100, restrictions: [], status: "accepting_cargo", views: 0, dealer: { name: "D", slug: "d", verified: true },
});
const cars = [car("a", "Toronto", "Lagos", "2027-01-02"), car("b", "Calgary", "Abuja", "2027-01-01"), car("c", "Toronto", "Abuja", "2027-01-03")];

describe("cargo vehicles", () => {
  it("builds a car from its database row", () => {
    const built = toCargoVehicle({
      id: "1", slug: "2021-toyota-sienna", make: "Toyota", model: "Sienna", year: 2021, origin_city: "Toronto", destination_city: "Lagos",
      departure_date: "2026-12-05", available_kg: 200, restrictions: ["No food"], cargo_status: "full", view_count: 12, images: null,
      seller_slug: "maple", seller_name: "Maple", seller_verified: true,
    });
    expect(built).toMatchObject({ availableKg: 200, status: "full", views: 12, images: [], dealer: { slug: "maple", verified: true } });
  });

  it("filters by departure city and destination", () => {
    expect(filterCargoVehicles(cars, { to: "Abuja" }).map((c) => c.id)).toEqual(["b", "c"]);
    expect(filterCargoVehicles(cars, { from: "Calgary", to: "Lagos" })).toEqual([]);
    expect(filterCargoVehicles(cars, {})).toHaveLength(3);
  });

  it("ignores filter values that are not real options", () => {
    expect(parseCargoFilters({ from: "Calgary", to: "Abuja" }, cars)).toEqual({ from: "Calgary", to: "Abuja" });
    expect(parseCargoFilters({ from: "<script>", to: ["Lagos", "Abuja"] }, cars)).toEqual({ from: undefined, to: "Lagos" });
  });

  it("relates other cars, with the same destination first", () => {
    const related = relatedCargoVehicles(cars, cars[1], 4);
    expect(related.map((c) => c.id)).toEqual(["c", "a"]);
  });
});

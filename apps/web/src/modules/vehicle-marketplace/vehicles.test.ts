import { describe, expect, it } from "vitest";
import {
  filterCargoVehicles,
  getCargoVehicleBySlug,
  parseCargoFilters,
  listCargoVehicles,
  listCargoVehicleSlugs,
  listRelatedCargoVehicles,
} from "./index";

describe("cargo vehicles", () => {
  it("gives every car a unique slug that finds it", async () => {
    const slugs = await listCargoVehicleSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((slug) => /^[a-z0-9-]+$/.test(slug))).toBe(true);
    expect((await getCargoVehicleBySlug("2021-toyota-sienna"))?.model).toBe("Sienna");
    expect(await getCargoVehicleBySlug("does-not-exist")).toBeNull();
  });

  it("lists the soonest departures first", async () => {
    const dates = (await listCargoVehicles()).map((vehicle) => vehicle.estimatedDeparture);
    expect(dates).toEqual([...dates].sort());
    expect(await listCargoVehicles(4)).toHaveLength(4);
  });

  it("filters by departure city and destination", async () => {
    const all = await listCargoVehicles();
    const toAbuja = filterCargoVehicles(all, { to: "Abuja" });
    expect(toAbuja.length).toBeGreaterThan(0);
    expect(toAbuja.every((vehicle) => vehicle.destination === "Abuja")).toBe(true);
    expect(filterCargoVehicles(all, { from: "Calgary" }).map((vehicle) => vehicle.model)).toEqual(["Pilot"]);
    expect(filterCargoVehicles(all, { from: "Calgary", to: "Abuja" })).toEqual([]);
    expect(filterCargoVehicles(all, {})).toHaveLength(all.length);
  });

  it("ignores filter values that are not real options", async () => {
    const all = await listCargoVehicles();
    expect(parseCargoFilters({ from: "Calgary", to: "Abuja" }, all)).toEqual({ from: "Calgary", to: "Abuja" });
    expect(parseCargoFilters({ from: "<script>", to: ["Lagos", "Abuja"] }, all)).toEqual({ from: undefined, to: "Lagos" });
  });

  it("relates other cars, with the same destination first", async () => {
    const vehicle = await getCargoVehicleBySlug("2020-lexus-rx-350");
    if (!vehicle) throw new Error("missing sample vehicle");
    const related = await listRelatedCargoVehicles(vehicle, 4);
    expect(related.map((other) => other.id)).not.toContain(vehicle.id);
    expect(related[0]?.destination).toBe("Abuja");
    expect(related).toHaveLength(4);
  });
});

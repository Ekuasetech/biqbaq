import type { CargoVehicle } from "./index";

// SAMPLE DATA for the frontend preview. The dealers, trips and restrictions are
// invented. Remove this file when vehicle listings are built (Phase 9).

const RESTRICTIONS = [
  "Sample: no hazardous or flammable items",
  "Sample: no perishable food",
  "Sample: boxes must be sealed and labelled",
];

function trip(
  index: number,
  year: number,
  make: string,
  model: string,
  origin: string,
  destination: string,
  estimatedDeparture: string,
  availableSpacePercent: number,
  views: number,
  dealer: string,
  verified = true,
  firstImage?: { url: string; alt: string },
): CargoVehicle {
  const name = `${year} ${make} ${model}`;
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  // Random placeholder photos: the seed fixes the image, not its subject.
  const placeholder = (n: number) => ({
    url: `https://picsum.photos/seed/biqbaq-cargo-${slug}-${n}/600/600`,
    alt: `${name}, placeholder image ${n}`,
  });

  return {
    id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    slug,
    year,
    make,
    model,
    images: [firstImage ?? placeholder(1), placeholder(2), placeholder(3)],
    origin,
    destination,
    estimatedDeparture,
    availableSpacePercent,
    restrictions: RESTRICTIONS,
    status: "accepting_cargo",
    views,
    dealer: { name: `${dealer} (sample)`, verified },
  };
}

export const SAMPLE_CARGO_VEHICLES: CargoVehicle[] = [
  trip(1, 2021, "Toyota", "Sienna", "Toronto", "Lagos", "2026-12-05", 40, 1876, "Maple Auto Export", true, {
    url: "/hero/sienna-cargo.jpg",
    alt: "A silver Toyota Sienna packed with luggage and boxes, being loaded into a shipping container",
  }),
  trip(2, 2019, "Honda", "Pilot", "Calgary", "Lagos", "2026-12-12", 65, 942, "Prairie Motors"),
  trip(3, 2018, "Toyota", "Highlander", "Montreal", "Port Harcourt", "2026-12-20", 25, 531, "Laurent Autos", false),
  trip(4, 2020, "Lexus", "RX 350", "Edmonton", "Abuja", "2027-01-08", 50, 1208, "Northgate Exports"),
  trip(5, 2017, "Toyota", "Camry", "Ottawa", "Lagos", "2027-01-12", 55, 640, "Capital Auto Traders"),
  trip(6, 2022, "Toyota", "RAV4", "Winnipeg", "Lagos", "2027-01-15", 30, 1543, "Red River Exports"),
  trip(7, 2016, "Honda", "Accord", "Vancouver", "Port Harcourt", "2027-01-20", 70, 487, "Pacific Gate Motors", false),
  trip(8, 2019, "Ford", "Explorer", "Mississauga", "Lagos", "2027-01-24", 45, 1102, "Maple Auto Export"),
  trip(9, 2018, "Hyundai", "Santa Fe", "Halifax", "Abuja", "2027-02-02", 60, 318, "Atlantic Auto Shippers"),
  trip(10, 2020, "Toyota", "Corolla", "Toronto", "Lagos", "2027-02-06", 20, 1689, "Lakeshore Exports"),
  trip(11, 2021, "Kia", "Sorento", "Brampton", "Port Harcourt", "2027-02-14", 35, 729, "Peel Motors", false),
  trip(12, 2017, "Mercedes-Benz", "GLE", "Saskatoon", "Abuja", "2027-02-20", 50, 256, "Prairie Motors"),
];

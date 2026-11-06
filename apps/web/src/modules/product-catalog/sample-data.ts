import type { CategorySlug, Currency, Product, PublicSeller, Review } from "./types";

// SAMPLE DATA for the frontend preview. The businesses, people and reviews are
// invented. Remove this file when the catalogue reads from Supabase.

const adireStudio: PublicSeller = {
  name: "Adire Studio (sample)",
  slug: "adire-studio",
  city: "Toronto",
  country: "CA",
  verified: true,
  description: "Sample seller: hand-dyed textiles and home pieces, shipped within Canada.",
};
const lagosPantry: PublicSeller = {
  name: "Lagos Pantry (sample)",
  slug: "lagos-pantry",
  city: "Calgary",
  country: "CA",
  verified: false,
  description: "Sample seller: Nigerian groceries and spices for customers in Canada.",
};
const kanoNaturals: PublicSeller = {
  name: "Kano Naturals (sample)",
  slug: "kano-naturals",
  city: "Ottawa",
  country: "CA",
  verified: true,
  description: "Sample seller: small-batch skincare for customers in Canada.",
};
const oyoWeavers: PublicSeller = {
  name: "Oyo Weavers (sample)",
  slug: "oyo-weavers",
  city: "Mississauga",
  country: "CA",
  verified: false,
  description: "Sample seller: traditional woven fabrics and homeware.",
};

const sampleReview = (id: string, author: string, rating: number, body: string, verifiedPurchase = false): Review => ({
  id,
  author,
  rating,
  body,
  verifiedPurchase,
  createdAt: "2026-10-12T12:00:00.000Z",
});

const SAMPLE_VIEWS = [1240, 865, 2310, 412, 978, 356, 1502, 689, 274, 1127, 93, 548];

function item(
  index: number,
  slug: string,
  name: string,
  description: string,
  amountMinor: number,
  currency: Currency,
  category: CategorySlug,
  seller: PublicSeller,
  extra: Partial<Pick<Product, "availability" | "condition" | "reviews">> = {},
): Product {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    slug,
    name,
    description,
    price: { amountMinor, currency },
    images: [1, 2, 3].map((n) => ({
      // Random placeholder photos: the seed fixes the image, not its subject.
      url: `https://picsum.photos/seed/${slug}-${n}/600/600`,
      alt: `${name}, placeholder image ${n}`,
    })),
    availability: extra.availability ?? "in_stock",
    condition: extra.condition === undefined ? "new" : extra.condition,
    category,
    seller,
    reviews: extra.reviews ?? [],
    views: SAMPLE_VIEWS[index - 1] ?? 0,
    createdAt: `2026-10-${String(30 - index).padStart(2, "0")}T12:00:00.000Z`,
  };
}

export const SAMPLE_PRODUCTS: Product[] = [
  item(1, "ankara-tote-bag", "Ankara Tote Bag", "A roomy everyday tote in bold Ankara print, with reinforced handles and an inner pocket.", 4500, "CAD", "fashion", adireStudio, {
    reviews: [
      sampleReview("r1", "Sample customer A", 5, "Sample review: strong stitching and bright colours.", true),
      sampleReview("r2", "Sample customer B", 4, "Sample review: bigger than I expected, in a good way."),
    ],
  }),
  item(2, "suya-spice-blend", "Suya Spice Blend", "A smoky, peppery blend for grilling. 200 g resealable pouch.", 1200, "CAD", "food", lagosPantry, {
    condition: null,
    reviews: [sampleReview("r3", "Sample customer C", 5, "Sample review: tastes like home.", true)],
  }),
  item(3, "whipped-shea-butter", "Whipped Shea Butter", "Unrefined shea butter whipped until light. 250 ml jar.", 1800, "CAD", "beauty", kanoNaturals, { condition: null }),
  item(4, "carved-wooden-stool", "Vintage Carved Wooden Stool", "A sturdy stool carved from a single block of wood, with the marks of earlier use.", 8500, "CAD", "home", oyoWeavers, {
    condition: "used",
    availability: "limited",
    reviews: [sampleReview("r4", "Sample customer D", 4, "Sample review: solid, and full of character.")],
  }),
  item(5, "aso-oke-set", "Handwoven Aso Oke Set", "A traditional handwoven set for special occasions, in three matching pieces.", 18500, "CAD", "fashion", oyoWeavers),
  item(6, "raffia-wall-basket", "Raffia Wall Basket", "A decorative raffia basket for wall hanging or table use. 40 cm wide.", 6500, "CAD", "home", adireStudio, { availability: "limited" }),
  item(7, "egusi-seeds", "Ground Egusi, 1 kg", "Finely ground melon seeds for soups and stews.", 1850, "CAD", "food", lagosPantry, { condition: null }),
  item(8, "african-black-soap", "African Black Soap", "A gentle plant-based soap bar. 150 g.", 900, "CAD", "beauty", kanoNaturals, { condition: null }),
  item(9, "hibiscus-body-oil", "Hibiscus Body Oil", "A light body oil infused with dried hibiscus. 100 ml bottle.", 1400, "CAD", "beauty", kanoNaturals, { condition: null }),
  item(10, "adire-silk-scarf", "Adire Silk Scarf", "A lightweight silk scarf, hand-dyed using adire techniques.", 3800, "CAD", "fashion", adireStudio),
  item(11, "clay-cooking-pot", "Clay Cooking Pot", "A handmade clay pot with a fitted lid, suitable for slow cooking.", 4200, "CAD", "home", oyoWeavers, { availability: "out_of_stock" }),
  item(12, "plantain-chips-box", "Plantain Chips, Box of 12", "Crisp, lightly salted plantain chips in single-serve bags.", 2400, "CAD", "food", lagosPantry, { condition: null }),
];

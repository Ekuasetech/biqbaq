import { execFileSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";

// Dev-only, from next-themes when a language switch re-renders the root layout.
// Its script already ran on first load, so the theme is unaffected.
const KNOWN_DEV_WARNING = "Encountered a script tag while rendering React component";

/** True while the hero shows the site's own photos, not ones Super Admin uploaded. */
function heroPhotosAreOriginal() {
  const count = execFileSync("docker", ["exec", "-i", "supabase_db_biqbaq", "psql", "-U", "supabase_admin", "-d", "postgres", "-q", "-tA", "-c", "select count(*) from public.site_images where slot like 'hero_%'"], {
    env: { ...process.env, PATH: `${process.env.PATH}:/Applications/Docker.app/Contents/Resources/bin` },
  }).toString().trim();
  return count === "0";
}

/** Opens a group in the dashboard sidebar, if it is closed (Q-56). */
async function openNavGroup(page: import("@playwright/test").Page, name: string) {
  const button = page.getByRole("navigation", { name: "Dashboard" }).getByRole("button", { name });
  await expect(button).toBeVisible({ timeout: 15000 });
  if ((await button.getAttribute("aria-expanded")) === "false") await button.click();
}

test.describe("public marketplace", () => {
  test.beforeEach(({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes(KNOWN_DEV_WARNING)) {
        problems.push(message.text());
      }
    });
    (page as unknown as { problems: string[] }).problems = problems;
  });

  test.afterEach(({ page }) => {
    expect((page as unknown as { problems: string[] }).problems).toEqual([]);
  });

  test("home leads to a category, then a product", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(/Find groceries/);
    await page.getByRole("main").getByRole("link", { name: "Food & groceries" }).first().click();
    await expect(page).toHaveURL(/category=food/);
    await page.getByRole("link", { name: "Suya Spice Blend" }).click();
    await expect(page).toHaveURL(/\/products\/suya-spice-blend$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Suya Spice Blend");
  });

  test("search treats unusual characters as ordinary text", async ({ page }) => {
    for (const text of ['a",status.eq.draft', "100%", "a,b)", "under_score", "back\\slash"]) {
      await page.goto(`/products?q=${encodeURIComponent(text)}`);
      await expect(page.getByRole("main")).toContainText("No products");
    }
  });

  test("a page number past the end shows the last page", async ({ page }) => {
    await page.goto("/products?page=999");
    await expect(page.getByRole("article").first()).toBeVisible();
  });

  test("hero offers browsing and account creation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Browse all products" }).first()).toBeVisible();
    await page.getByRole("link", { name: "Create A Free Account" }).first().click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create a free account");
  });

  test("category section links to Cargo Cars instead of Electronics", async ({ page }) => {
    await page.goto("/");
    const section = page.getByRole("region", { name: "Shop by category" });
    await expect(section.getByRole("link", { name: "Electronics" })).toHaveCount(0);
    await section.getByRole("link", { name: "Cargo Cars" }).click();
    await expect(page).toHaveURL(/\/cargo-cars$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cargo Cars");
  });

  test("hero photos change on their own, and can be paused", async ({ page }) => {
    // The photos' own descriptions are checked only while the site's photos show: Super Admin
    // may have uploaded others (Site images). The headlines are the same either way.
    const original = heroPhotosAreOriginal();
    await page.goto("/");
    const active = page.locator("img[data-active]");
    const headline = page.getByRole("heading", { level: 1 });
    if (original) await expect(active).toHaveAttribute("alt", /grocery store/);
    await expect(headline).toHaveAccessibleName("Find groceries and other products in your city");
    if (original) await expect(active).toHaveAttribute("alt", /shipping container/, { timeout: 8000 });
    await expect(headline).toHaveAccessibleName("Find cargo vehicles heading to Nigeria and send your goods", { timeout: 8000 });
    if (original) await expect(active).toHaveAttribute("alt", /Toronto/, { timeout: 7000 });
    await expect(headline).toHaveAccessibleName("The Platform made for Entrepreneurs to do business", { timeout: 7000 });
    await page.getByRole("button", { name: "Pause the photo slideshow" }).click();
    await page.waitForTimeout(6000);
    if (original) await expect(active).toHaveAttribute("alt", /Toronto/);
    await expect(headline).toHaveAccessibleName("The Platform made for Entrepreneurs to do business");
  });

  test("hero photos stay still with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForTimeout(6000);
    if (heroPhotosAreOriginal()) await expect(page.locator("img[data-active]")).toHaveAttribute("alt", /grocery store/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Find groceries and other products in your city");
    await expect(page.getByRole("button", { name: "Play the photo slideshow" })).toBeVisible();
  });

  test("home lists cargo cars going to Nigeria, below the new products", async ({ page }) => {
    await page.goto("/");
    const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
    const newProducts = headings.findIndex((h) => h.includes("New on Biqbaq"));
    expect(headings[newProducts + 1]).toContain("Cargo cars going to Nigeria");
    const section = page.getByRole("region", { name: "Cargo cars going to Nigeria" });
    await expect(section.getByRole("article")).toHaveCount(4);
    // Only verified dealers' cars are public (Q-05).
    await expect(section.getByText("Verified Seller").first()).toBeVisible();
    await expect(section.getByText("Unverified Seller")).toHaveCount(0);
    await section.getByRole("link", { name: "2021 Toyota Sienna" }).click();
    await expect(page).toHaveURL(/\/cargo-cars\/2021-toyota-sienna$/);
  });

  // Views are real counts (see "views count once per visitor"), so they vary.
  test("view counts appear on products and cargo cars", async ({ page }) => {
    await page.goto("/");
    const products = page.getByRole("region", { name: "New on Biqbaq" });
    await expect(products.getByRole("article").filter({ hasText: "Ankara Tote Bag" })).toContainText(/\d+ views?/);
    const cargo = page.getByRole("region", { name: "Cargo cars going to Nigeria" });
    await expect(cargo.getByRole("article").first()).toContainText(/[\d,]+ views?/);
    await page.goto("/products");
    await expect(page.getByRole("article").first()).toContainText(/\d+ views?/);
    await page.goto("/products/ankara-tote-bag");
    await expect(page.getByRole("main").getByText(/^[\d,]+ views?$/).first()).toBeVisible();
  });

  test("home shows blog topics below the cargo cars", async ({ page }) => {
    await page.goto("/");
    const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
    const cargo = headings.findIndex((h) => h.includes("Cargo cars going to Nigeria"));
    expect(headings[cargo + 1]).toContain("Biqbaq Blog");
    const section = page.getByRole("region", { name: "Biqbaq Blog" });
    await expect(section.getByRole("article")).toHaveCount(5);
    const lead = section.getByRole("article").first();
    await expect(lead).toContainText("Most read");
    // The sample posts can be edited on the Blog screen, so their wording is not checked here.
    await expect(lead).toContainText(/[\d,]+ readers?/);
    await expect(section.locator("article img")).toHaveCount(5);
    await section.getByRole("link", { name: /sending cargo home/ }).click();
    await expect(page).toHaveURL(/\/blog\/what-to-know-before-sending-cargo-home-to-nigeria$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("What to know before sending cargo home to Nigeria");
  });

  test("all prices are in Canadian dollars, with no Nigeria market options", async ({ page }) => {
    await page.goto("/products?page=1");
    await expect(page.getByLabel("Seller location")).toHaveCount(0);
    await page.goto("/");
    await expect(page.locator("body")).not.toContainText("₦");
    await page.goto("/products/whipped-shea-butter");
    await expect(page.getByRole("main")).toContainText("$18.00");
    await expect(page.getByRole("main")).toContainText("Based in Ottawa, Canada");
    await page.goto("/products?q=suya");
    await expect(page.getByText("Calgary, Canada").first()).toBeVisible();
    await page.goto("/products?page=2");
    await expect(page.locator("body")).not.toContainText("₦");
  });

  test("home shows live ads below the blog, highest priority first", async ({ page }) => {
    await page.goto("/");
    const section = page.getByRole("region", { name: "Sponsored" });
    await expect(section.getByRole("article")).toHaveCount(3);
    const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
    const blog = headings.findIndex((h) => h.includes("Biqbaq Blog"));
    expect(headings[blog + 1]).toContain("Sponsored");
    await expect(section.getByRole("article").first()).toContainText("Send your goods home");
    await expect(section.getByText("Ad", { exact: true })).toHaveCount(3);
    await expect(section).not.toContainText(/never shown|not shown/);
    await section.getByRole("link", { name: /favourite Nigerian staples/ }).click();
    await expect(page).toHaveURL(/\/ads\/stock-up-on-your-favourite-nigerian-staples$/);
  });

  test("get-started tiles sit below the ads and lead to the right pages", async ({ page }) => {
    await page.goto("/");
    const section = page.getByRole("region", { name: "Get started on Biqbaq" });
    // No website is offered, so the tile promising one is gone (Q-17).
    await expect(section).not.toContainText("free website");
    for (const [name, url] of [
      ["Create a Free Account", /\/register$/],
      ["Search for Sellers", /\/products$/],
      ["Send goods home with cargo cars", /\/cargo-cars$/],
    ] as const) {
      await page.goto("/");
      await section.getByRole("link", { name }).click();
      await expect(page).toHaveURL(url);
    }
    await page.goto("/");
    // The ads stream in after the page shell, so wait for them to be in place.
    await expect(page.locator("#ads-title")).toBeVisible();
    const order = await page.evaluate(() => {
      const ads = document.querySelector("#ads-title")!;
      const tiles = document.querySelector("#get-started-title")!;
      return ads.compareDocumentPosition(tiles) & Node.DOCUMENT_POSITION_FOLLOWING;
    });
    expect(order).toBeTruthy();
    // Laid out like the blog section: three even cards stacked on the left, a photo on the right.
    const boxes = await section.getByRole("listitem").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().toJSON() as DOMRect));
    expect(boxes).toHaveLength(3);
    expect(new Set(boxes.map((box) => Math.round(box.left))).size).toBe(1);
    expect(new Set(boxes.map((box) => Math.round(box.width))).size).toBe(1);
    expect(new Set(boxes.map((box) => Math.round(box.height))).size).toBe(1);
    expect(boxes[0].top).toBeLessThan(boxes[1].top);
    expect(boxes[1].top).toBeLessThan(boxes[2].top);
    const photo = await section.locator("img").last().boundingBox();
    expect(photo!.x).toBeGreaterThan(boxes[0].left + boxes[0].width);
    await page.goto("/products?q=calgary");
    await expect(page.getByText("Calgary, Canada").first()).toBeVisible();
  });

  test("clicking a car's photo opens its own page, with full details", async ({ page }) => {
    await page.goto("/cargo-cars");
    const list = page.getByRole("list", { name: "Cars going to Nigeria" });
    // Clicks straight away, so this also covers a photo that is still animating in.
    // Found by name, as real cars listed on the local copy change the order.
    await list.getByRole("article").filter({ hasText: "2019 Honda Pilot" }).locator('[data-rv="fade"]').click();
    await expect(page).toHaveURL(/\/cargo-cars\/2019-honda-pilot$/);
    const main = page.getByRole("main");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("2019 Honda Pilot");
    await expect(main).toContainText("Calgary");
    await expect(main).toContainText("Lagos, Nigeria");
    await expect(main).toContainText("December 12, 2026");
    await expect(main).toContainText("325 kg of space available");
    await expect(main).toContainText("Accepting cargo");
    await expect(main).toContainText(/[\d,]+ views?/);
    await expect(main).toContainText("Prairie Motors (sample)");
    await expect(page.getByRole("heading", { name: "Cargo restrictions" })).toBeVisible();

    await page.getByRole("button", { name: "View image 2" }).click();
    await expect(page.getByRole("img", { name: /Pilot, placeholder image 2/ })).toBeVisible();

    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Enter your name.")).toBeVisible();

    const related = page.getByRole("region", { name: "More cars going to Nigeria" }).getByRole("article");
    await expect(related).toHaveCount(4);
    await expect(related.filter({ hasText: "2019 Honda Pilot" })).toHaveCount(0);
    await related.first().getByRole("link").click();
    await expect(page).toHaveURL(/\/cargo-cars\/[a-z0-9-]+$/);
    await expect(page).not.toHaveURL(/2019-honda-pilot$/);

    await page.goto("/fr/cargo-cars/2021-toyota-sienna");
    await expect(page.getByRole("main")).toContainText("Détails du trajet");
  });

  test("clicking a product's photo opens its page", async ({ page }) => {
    await page.goto("/products");
    await page.getByRole("article").first().locator('[data-rv="fade"]').click();
    await expect(page).toHaveURL(/\/products\/[a-z0-9-]+$/);
  });

  // Real cars listed on the local copy add to the sample ones, so counts are read from the page.
  const cars = (page: import("@playwright/test").Page) => page.getByRole("list", { name: "Cars going to Nigeria" }).getByRole("article");
  // Retries, as the list may still be changing just after a filter is applied.
  async function expectCountShown(page: import("@playwright/test").Page) {
    let count = 0;
    await expect(async () => {
      count = await cars(page).count();
      await expect(page.getByText(new RegExp(`^${count} cars?\\b`))).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 10000 });
    return count;
  }

  test("cargo cars can be filtered by departure city and destination", async ({ page }) => {
    await page.goto("/cargo-cars");
    await expect(cars(page).filter({ hasText: "2021 Toyota Sienna" })).toHaveCount(1);
    const all = await cars(page).count();
    expect(all).toBeGreaterThanOrEqual(9);
    await page.getByLabel("Leaving from").selectOption("Calgary");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/from=Calgary/);
    await expect(cars(page).filter({ hasText: "2019 Honda Pilot" })).toHaveCount(1);
    await expectCountShown(page);
    for (const car of await cars(page).all()) await expect(car).toContainText("Calgary");

    await page.goto("/cargo-cars?to=Abuja");
    await expect(page.getByLabel("Going to", { exact: true })).toHaveValue("Abuja");
    expect(await expectCountShown(page)).toBeGreaterThanOrEqual(3);
    for (const car of await cars(page).all()) await expect(car).toContainText("Abuja");

    await page.goto("/cargo-cars?from=Calgary&to=Abuja");
    await expect(page.getByRole("heading", { name: "No cars found" })).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(cars(page)).toHaveCount(all);
    await expectCountShown(page);

    await page.goto("/cargo-cars?from=Nowhere");
    await expect(cars(page)).toHaveCount(all);
  });

  test("a product page always shows a full row of related products", async ({ page }) => {
    await page.goto("/products/ankara-tote-bag");
    const related = page.getByRole("region", { name: "You may also like" }).getByRole("article");
    await expect(related).toHaveCount(4);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Ankara Tote Bag");
  });

  test("registration validates what is typed", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter your full name.")).toBeVisible();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Use at least 8 characters.")).toBeVisible();

    await page.getByLabel("Full name").fill("Ada Sample");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Password", { exact: true }).fill("long-enough");
    await page.getByLabel("Confirm password", { exact: true }).fill("different");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("The passwords don't match.")).toBeVisible();

  });

  test("Google sign-in sends people to Google, and explains when it does not finish", async ({ page }) => {
    // Neither Supabase nor Google is visited in tests: the request to Supabase's Google
    // sign-in is the proof. (Supabase forwarding it to Google was checked directly.)
    const asked: string[] = [];
    await page.route("**/auth/v1/authorize**", async (route) => {
      asked.push(route.request().url());
      await route.fulfill({ status: 200, contentType: "text/html", body: "<title>Google</title>" });
    });
    for (const [path, name, next] of [["/register?ref=ADA2026", "Sign up with Google", "/"], ["/fr/sign-in?next=%2Fproducts", "Se connecter avec Google", "/fr/products"]] as const) {
      await page.goto(path);
      await page.getByRole("button", { name }).click();
      await expect.poll(() => asked.length, { timeout: 15000 }).toBeGreaterThan(0);
      const sent = new URL(asked.pop()!);
      expect(sent.searchParams.get("provider")).toBe("google");
      // Back to Biqbaq's return route, then on to the page they came from, in their language.
      const back = new URL(sent.searchParams.get("redirect_to")!);
      expect(back.pathname).toBe("/api/v1/auth/callback");
      expect(back.searchParams.get("via")).toBe("google");
      expect(back.searchParams.get("next")).toBe(next);
    }
    // Opening a referral link on the way remembers it for the Google sign-up.
    expect((await page.context().cookies()).some((cookie) => cookie.name === "biqbaq_ref" && cookie.value.startsWith("ADA2026."))).toBe(true);

    // Cancelling at Google, or anything failing, comes back with an explanation.
    // The person was last on the French site, so it explains in French.
    await page.goto("/api/v1/auth/callback?via=google&next=%2Ffr%2Fproducts");
    await expect(page).toHaveURL(/\/fr\/sign-in\?google=failed$/);
    await expect(page.getByRole("status").filter({ hasText: "La connexion avec Google n'a pas fonctionné" })).toBeVisible();
  });

  for (const path of ["/register", "/sign-in", "/forgot-password", "/reset-password", "/fr/register"]) {
    test(`${path} shows only the form, with no images, blog or ads`, async ({ page }) => {
      await page.goto(path);
      const main = page.getByRole("main");
      await expect(main.locator("form")).toBeVisible();
      // Wait past the point where streamed ads would have arrived.
      await page.waitForLoadState("networkidle");
      await expect(main.locator("img")).toHaveCount(0);
      await expect(main.locator("#blog-title, #ads-title")).toHaveCount(0);
      await expect(main.getByRole("article")).toHaveCount(0);
    });
  }

  test("sign-up and sign-in show the agreement notice, linked to the documents", async ({ page }) => {
    const notice = "By continuing, you agree to Biqbaq's Conditions of Use and Privacy Notice.";
    for (const path of ["/register", "/sign-in"]) {
      await page.goto(path);
      await expect(page.getByText(notice)).toBeVisible();
      const main = page.getByRole("main");
      await expect(main.getByRole("link", { name: "Conditions of Use" })).toHaveAttribute("href", "/conditions-of-use");
      await expect(main.getByRole("link", { name: "Privacy Notice" })).toHaveAttribute("href", "/privacy-notice");
    }
    await page.goto("/forgot-password");
    await expect(page.getByText(notice)).toHaveCount(0);
  });

  for (const [path, title, link] of [
    ["/conditions-of-use", "Conditions of Use", "Conditions of Use"],
    ["/privacy-notice", "Privacy Notice", "Privacy Notice"],
  ] as const) {
    test(`${path} is reachable from the footer, marked as a draft and hidden from search`, async ({ page }) => {
      await page.goto("/products");
      await page.getByRole("contentinfo").getByRole("link", { name: link }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      const main = page.getByRole("main");
      await expect(main).toContainText("Draft for legal review");
      await expect(main.locator("mark").first()).toBeVisible();
      await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
    });
  }

  test("the legal pages are available in French", async ({ page }) => {
    await page.goto("/fr/conditions-of-use");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Conditions d'utilisation");
    await page.goto("/fr/privacy-notice");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Avis de confidentialité");
    await page.goto("/fr/sign-in");
    await expect(page.getByRole("main").getByRole("link", { name: "Avis de confidentialité" })).toHaveAttribute("href", "/fr/privacy-notice");
  });

  test.describe("search suggestions", () => {
    const box = (page: import("@playwright/test").Page) => page.getByRole("combobox", { name: "Search products" });
    const list = (page: import("@playwright/test").Page) => page.getByRole("listbox", { name: "Search suggestions" });

    test("typing shows matching items, and clicking one opens it", async ({ page }) => {
      await page.goto("/");
      await box(page).pressSequentially("suy");
      await expect(list(page).getByRole("option", { name: /Suya Spice Blend/ })).toBeVisible();
      await expect(list(page)).toContainText("$12.00");
      await expect(box(page)).toHaveAttribute("aria-expanded", "true");
      await list(page).getByRole("option", { name: /Suya Spice Blend/ }).click();
      await expect(page).toHaveURL(/\/products\/suya-spice-blend$/);
    });

    test("cars appear too, and open their own page", async ({ page }) => {
      await page.goto("/products");
      await box(page).fill("sienna");
      await list(page).getByRole("option", { name: /2021 Toyota Sienna/ }).click();
      await expect(page).toHaveURL(/\/cargo-cars\/2021-toyota-sienna$/);
    });

    test("works with the keyboard, and Escape closes the list", async ({ page }) => {
      await page.goto("/");
      await box(page).fill("suya");
      await expect(list(page).getByRole("option", { name: /Suya/ })).toBeVisible();
      await box(page).press("ArrowDown");
      await expect(list(page).getByRole("option", { name: /Suya/ })).toHaveAttribute("aria-selected", "true");
      await box(page).press("Escape");
      await expect(list(page)).toBeHidden();
      await box(page).fill("suyaa");
      await box(page).fill("suya");
      await expect(list(page).getByRole("option", { name: /Suya/ })).toBeVisible();
      await box(page).press("ArrowDown");
      await box(page).press("Enter");
      await expect(page).toHaveURL(/\/products\/suya-spice-blend$/);
    });

    test("Enter without choosing an item still searches", async ({ page }) => {
      await page.goto("/");
      await box(page).fill("tote");
      await box(page).press("Enter");
      await expect(page).toHaveURL(/\/products\?q=tote/);
      await expect(page.getByText("1 product")).toBeVisible();
    });

    test("no matches says so, and short terms show nothing", async ({ page }) => {
      await page.goto("/");
      await box(page).fill("a");
      await expect(list(page)).toBeHidden();
      await box(page).fill("zzzz");
      await expect(page.getByText("No matches for “zzzz”")).toBeVisible();
      await list(page).getByRole("option", { name: /See all results/ }).click();
      await expect(page).toHaveURL(/\/products\?q=zzzz/);
    });

    test("search still works if suggestions fail to load", async ({ page }) => {
      await page.route("**/api/v1/search/suggestions**", (route) => route.abort());
      await page.goto("/");
      await box(page).fill("tote");
      await expect(list(page).getByRole("option", { name: /See all results/ })).toBeVisible();
      await expect(page.getByText(/No matches/)).toHaveCount(0);
      (page as unknown as { problems: string[] }).problems = [];
      await box(page).press("Enter");
      await expect(page).toHaveURL(/\/products\?q=tote/);
    });

    test("the endpoint returns public fields only", async ({ request }) => {
      const response = await request.get("/api/v1/search/suggestions?q=tote");
      expect(response.ok()).toBe(true);
      const { data } = await response.json();
      expect(Object.keys(data[0]).sort()).toEqual(["detail", "href", "id", "imageUrl", "price", "title", "type"]);
      expect(await (await request.get("/api/v1/search/suggestions")).json()).toEqual({ data: [] });
    });

    test("is translated on French pages", async ({ page }) => {
      await page.goto("/fr");
      await page.getByRole("combobox", { name: "Rechercher des produits" }).fill("tote");
      const option = page.getByRole("listbox", { name: "Suggestions de recherche" }).getByRole("option", { name: /Ankara Tote/ });
      await expect(option).toContainText("45,00");
      await option.click();
      await expect(page).toHaveURL(/\/fr\/products\/ankara-tote-bag$/);
    });
  });

  test.describe("page transitions", () => {
    // Records the view transition animations that run during a navigation.
    const record = (page: import("@playwright/test").Page) =>
      page.addInitScript(() => {
        const seen = new Set<string>();
        (window as unknown as { seen: Set<string> }).seen = seen;
        const start = document.startViewTransition.bind(document);
        document.startViewTransition = ((callback: never) => {
          const transition = start(callback);
          transition.ready.then(() => {
            for (const animation of document.getAnimations()) {
              const effect = animation.effect as KeyframeEffect;
              if (effect.pseudoElement?.startsWith("::view-transition")) {
                seen.add(`${effect.pseudoElement}`);
              }
            }
          }).catch(() => undefined);
          return transition;
        }) as typeof document.startViewTransition;
      });
    const seen = (page: import("@playwright/test").Page) =>
      page.evaluate(() => [...(window as unknown as { seen: Set<string> }).seen]);

    test("a car's photo morphs into its page, with the page and header handled", async ({ page }) => {
      await record(page);
      await page.goto("/cargo-cars");
      await page.waitForLoadState("networkidle");
      await page.getByRole("list", { name: "Cars going to Nigeria" }).getByRole("link", { name: "2019 Honda Pilot" }).click();
      await expect(page).toHaveURL(/\/cargo-cars\/2019-honda-pilot$/);
      await expect.poll(() => seen(page)).toContain("::view-transition-group(car-photo-2019-honda-pilot)");
      const animations = await seen(page);
      // The header stays anchored, so it must not animate.
      expect(animations).not.toContain("::view-transition-new(site-header)");
      // After the animation, the live page works normally.
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("2019 Honda Pilot");
      await page.getByRole("button", { name: "View image 2" }).click();
      await expect(page.getByRole("img", { name: /Pilot, placeholder image 2/ })).toBeVisible();
    });

    test("every page type animates in", async ({ page }) => {
      await record(page);
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.getByRole("banner").getByRole("link", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
      await expect.poll(async () => (await seen(page)).join()).toMatch(/view-transition-new/);
    });

    test("reduced motion gives instant page changes", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/cargo-cars");
      await page.waitForLoadState("networkidle");
      await page.getByRole("list", { name: "Cars going to Nigeria" }).getByRole("link", { name: "2019 Honda Pilot" }).click();
      await expect(page).toHaveURL(/2019-honda-pilot$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("2019 Honda Pilot");
    });

    test("browser back and forward still work", async ({ page }) => {
      await page.goto("/products");
      await page.waitForLoadState("networkidle");
      await page.getByRole("link", { name: "Suya Spice Blend" }).click().catch(() => undefined);
      await page.goto("/cargo-cars");
      await page.goBack();
      await expect(page).toHaveURL(/\/products$/);
      await page.goForward();
      await expect(page).toHaveURL(/\/cargo-cars$/);
    });

    test("a page never has two photos competing for the same morph", async ({ page }) => {
      for (const path of ["/", "/products", "/cargo-cars", "/products/ankara-tote-bag", "/cargo-cars/2021-toyota-sienna"]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        // Each photo is named after its listing, so a repeated photo means a repeated name.
        const photos = await page.locator("article img").evaluateAll((images) =>
          images.map((image) => image.getAttribute("src")),
        );
        expect(photos.length).toBeGreaterThan(0);
        expect(new Set(photos).size).toBe(photos.length);
      }
    });
  });

  test.describe("blog pages", () => {
    test("the list shows every article, and each one opens", async ({ page }) => {
      await page.goto("/blog");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Biqbaq blog");
      // At least the four sample articles after the lead one. Another test may be publishing a post meanwhile.
      expect(await page.getByRole("list", { name: "All articles" }).getByRole("article").count()).toBeGreaterThanOrEqual(4);
      await expect(page.getByRole("region", { name: "Sponsored" }).getByRole("article")).toHaveCount(3);
      // The large lead article opens its own page too.
      // Found by its address, which never changes, rather than its title, which an editor can change.
      await page.locator('a[href$="/blog/how-to-start-selling-your-products-online-from-canada"]').first().click();
      await expect(page).toHaveURL(/\/blog\/how-to-start-selling-your-products-online-from-canada$/);
      await page.goto("/blog");
      await page.getByRole("link", { name: "Styling Ankara for a Canadian winter" }).click();
      await expect(page).toHaveURL(/\/blog\/styling-ankara-for-a-canadian-winter$/);
      const main = page.getByRole("main");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Styling Ankara for a Canadian winter");
      await expect(main).toContainText("Ngozi E. (sample)");
      await expect(main).toContainText(/[\d,]+ readers?/);
      // Reading time is worked out from the post's real length now.
      await expect(main).toContainText(/\d+ min read/);
      await expect(main).toContainText("October 2, 2026");
      await expect(main).toContainText("This is sample text");
      await expect(page.getByRole("link", { name: "Share on WhatsApp" })).toBeVisible();
    });

    test("an article does not list itself below, and shows the ads", async ({ page }) => {
      await page.goto("/blog/styling-ankara-for-a-canadian-winter");
      const section = page.getByRole("region", { name: "Biqbaq Blog" });
      await expect(section.getByRole("article")).toHaveCount(4);
      await expect(section).not.toContainText("Styling Ankara");
      await expect(page.getByRole("region", { name: "Sponsored" }).getByRole("article")).toHaveCount(3);
    });

    test("an unknown article shows a not-found page", async ({ page }) => {
      await page.goto("/blog/does-not-exist");
      await expect(page.getByRole("heading", { name: "Article not found" })).toBeVisible();
      await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
      (page as unknown as { problems: string[] }).problems = [];
    });

    test("works in French", async ({ page }) => {
      await page.goto("/fr/blog");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Blogue de Biqbaq");
    });
  });

  test.describe("seller profiles", () => {
    test("a card's seller name opens the profile, not the product", async ({ page }) => {
      await page.goto("/products");
      await page.waitForLoadState("networkidle");
      await page.getByRole("link", { name: /\(sample\)/ }).first().click();
      await expect(page).toHaveURL(/\/sellers\/[a-z-]+$/);
    });

    test("the profile shows the seller and all their products", async ({ page }) => {
      await page.goto("/products/ankara-tote-bag");
      await page.getByRole("main").getByRole("link", { name: "Adire Studio (sample)" }).first().click();
      await expect(page).toHaveURL(/\/sellers\/adire-studio$/);
      const main = page.getByRole("main");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Adire Studio (sample)");
      await expect(main).toContainText("Toronto, Canada");
      await expect(main).toContainText("Verified Seller");
      await expect(main).toContainText("3 products");
      const products = page.getByRole("region", { name: "Products from this seller" }).getByRole("article");
      await expect(products).toHaveCount(3);
      await products.first().getByRole("heading").getByRole("link").click();
      await expect(page).toHaveURL(/\/products\//);
    });

    test("unverified sellers are labelled on their profile", async ({ page }) => {
      await page.goto("/sellers/lagos-pantry");
      await expect(page.locator("section").first()).toContainText("Unverified Seller");
    });

    test("sellers appear in the search dropdown", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("combobox", { name: "Search products" }).fill("kano");
      await page.getByRole("listbox", { name: "Search suggestions" }).getByRole("option", { name: /Kano Naturals \(sample\) Ottawa/ }).click();
      await expect(page).toHaveURL(/\/sellers\/kano-naturals$/);
    });

    test("an unknown seller shows a not-found page", async ({ page }) => {
      await page.goto("/sellers/does-not-exist");
      await expect(page.getByRole("heading", { name: "Seller not found" })).toBeVisible();
      (page as unknown as { problems: string[] }).problems = [];
    });
  });

  test("choosing a new password validates, and needs a valid reset link", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Choose a new password");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill("long-enough");
    await page.getByLabel("Confirm new password", { exact: true }).fill("different");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("The passwords don't match.")).toBeVisible();
    await page.getByLabel("Confirm new password", { exact: true }).fill("long-enough");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("This reset link has expired")).toBeVisible();
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
    (page as unknown as { problems: string[] }).problems = [];
  });

  test.describe("real accounts on the local copy", () => {
    const mailpit = "http://127.0.0.1:54324/api/v1";
    const newEmail = (label: string) => `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
    const password = "first-password-123";
    const ignoreExpectedFailures = (page: import("@playwright/test").Page) => {
      // The browser logs refused logins as console errors, which is expected here.
      (page as unknown as { problems: string[] }).problems = [];
    };

    // Waits for the local test inbox to receive an email, and returns its link.
    async function emailLink(request: import("@playwright/test").APIRequestContext, to: string, subject?: RegExp) {
      await expect.poll(async () => {
        const found = await (await request.get(`${mailpit}/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
        return found.messages.filter((m: { Subject: string }) => !subject || subject.test(m.Subject)).length;
      }, { timeout: 15000 }).toBeGreaterThan(0);
      const found = await (await request.get(`${mailpit}/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
      const latest = found.messages.find((m: { Subject: string }) => !subject || subject.test(m.Subject));
      const message = await (await request.get(`${mailpit}/message/${latest.ID}`)).json();
      const link = /https?:\/\/[^\s"<>)]+verify[^\s"<>)]+/.exec(message.HTML || message.Text)?.[0];
      if (!link) throw new Error("no link in email");
      return link.replaceAll("&amp;", "&");
    }

    async function register(page: import("@playwright/test").Page, email: string) {
      await page.goto("/register");
      await page.getByLabel("Full name").fill("Ada Sample");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByLabel("Confirm password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Create account" }).click();
      await expect(page.getByText("We've sent a confirmation link")).toBeInViewport();
      await expect(page.locator('input[type="password"]')).toHaveCount(0);
    }

    async function signIn(page: import("@playwright/test").Page, email: string, secret: string) {
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(secret);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
    }

    const signedIn = (page: import("@playwright/test").Page) => page.getByRole("banner").getByRole("button", { name: "Sign out" });

    // Waits for the sign-out to finish, as leaving the page straight away would cancel it.
    async function signOut(page: import("@playwright/test").Page) {
      await signedIn(page).click();
      await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
    }

    test("sign up, confirm by email, sign out and sign back in", async ({ page, request }) => {
      const email = newEmail("signup");
      await register(page, email);
      // This subject is Biqbaq's own, so it also proves the email came through EmailService.
      await page.goto(await emailLink(request, email, /^Confirm your Biqbaq account$/));
      await expect(signedIn(page)).toBeVisible();
      await expect(page.getByRole("banner")).toContainText("Ada Sample");
      await signOut(page);
      await signIn(page, email, password);
      await expect(signedIn(page)).toBeVisible();
      await expect(page).toHaveURL(/localhost:3100\/$/);
      await page.reload();
      await expect(signedIn(page)).toBeVisible();
    });

    test("an unconfirmed account cannot sign in", async ({ page }) => {
      const email = newEmail("unconfirmed");
      await register(page, email);
      await signIn(page, email, password);
      await expect(page.getByText("Please confirm your email first")).toBeVisible();
      await expect(signedIn(page)).toHaveCount(0);
      ignoreExpectedFailures(page);
    });

    test("a wrong password and an unknown email give the same answer", async ({ page, request }) => {
      const email = newEmail("wrongpass");
      await register(page, email);
      await page.goto(await emailLink(request, email));
      await signOut(page);
      await signIn(page, email, "not-the-password");
      await expect(page.getByText("That email or password isn't right.")).toBeVisible();
      await signIn(page, newEmail("nobody"), password);
      await expect(page.getByText("That email or password isn't right.")).toBeVisible();
      await expect(signedIn(page)).toHaveCount(0);
      ignoreExpectedFailures(page);
    });

    test("registering with an email already in use does not reveal that", async ({ page, request }) => {
      const email = newEmail("taken");
      await register(page, email);
      await page.goto(await emailLink(request, email));
      await signOut(page);
      await register(page, email);
      ignoreExpectedFailures(page);
    });

    test("forgot password: email, new password, and the old one stops working", async ({ page, request }) => {
      const email = newEmail("reset");
      await register(page, email);
      await page.goto(await emailLink(request, email));
      await signOut(page);
      await page.goto("/forgot-password");
      await page.getByLabel("Email").fill(email);
      await page.getByRole("button", { name: "Send reset link" }).click();
      await expect(page.getByText("If an account exists")).toBeVisible();
      await page.goto(await emailLink(request, email, /reset/i));
      await expect(page).toHaveURL(/\/reset-password$/);
      const newPassword = "second-password-456";
      await page.getByLabel("New password", { exact: true }).fill(newPassword);
      await page.getByLabel("Confirm new password", { exact: true }).fill(newPassword);
      await page.getByRole("button", { name: "Save new password" }).click();
      await expect(page.getByText("Your password has been updated.")).toBeVisible();
      await signOut(page);
      await signIn(page, email, password);
      await expect(page.getByText("That email or password isn't right.")).toBeVisible();
      await signIn(page, email, newPassword);
      await expect(signedIn(page)).toBeVisible();
      ignoreExpectedFailures(page);
    });

    test("forgot password does not reveal whether an email has an account", async ({ page }) => {
      await page.goto("/forgot-password");
      await page.getByLabel("Email").fill(newEmail("nobody"));
      await page.getByRole("button", { name: "Send reset link" }).click();
      await expect(page.getByText("If an account exists")).toBeVisible();
    });

    test("an invalid email link explains what happened", async ({ page }) => {
      await page.goto("/api/v1/auth/callback?code=not-a-real-code");
      await expect(page).toHaveURL(/\/sign-in\?link=expired$/);
      await expect(page.getByText("That link couldn't finish signing you in.")).toBeVisible();
      ignoreExpectedFailures(page);
    });

    test("the email link cannot redirect to another site", async ({ request }) => {
      const response = await request.get("/api/v1/auth/callback?next=//evil.example", { maxRedirects: 0 });
      expect(response.headers().location).not.toContain("evil.example");
    });

    test("passwords never appear in the page address", async ({ page }) => {
      const secret = "visible-secret-789";
      await signIn(page, newEmail("nobody"), secret);
      await expect(page.getByText("That email or password isn't right.")).toBeVisible();
      expect(page.url()).not.toContain(secret);
      ignoreExpectedFailures(page);
    });

    test.describe("account page", () => {
      async function confirmedAccount(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext) {
        const email = newEmail("account");
        await register(page, email);
        await page.goto(await emailLink(request, email));
        await expect(signedIn(page)).toBeVisible();
        return email;
      }
      const applications = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "Your applications" });
      const apply = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "Apply for a role" });

      async function fillSeller(page: import("@playwright/test").Page) {
        await page.getByLabel("Seller or business name").fill("Ada's Shop");
        await page.getByLabel("Contact information").fill("416-555-0100");
        await page.getByLabel("City").fill("Toronto");
        await page.getByLabel("What do you mainly sell?").selectOption("food");
        await page.getByLabel("Tell us about your business").fill("Nigerian groceries");
      }

      test("the dashboard has a sidebar, today's figures, and a phone menu", async ({ page, request }) => {
        await confirmedAccount(page, request);
        await page.goto("/account");
        // The public header and footer give way to the dashboard's own top bar and sidebar.
        await expect(page.getByRole("banner")).toContainText("Welcome back, Ada", { timeout: 15000 });
        await expect(page.getByRole("contentinfo")).toHaveCount(0);
        const nav = page.getByRole("navigation", { name: "Dashboard" });
        await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
        await expect(nav.getByRole("link", { name: /^Messages/ })).toBeVisible();
        await expect(nav.getByRole("link", { name: /^Notifications/ })).toBeVisible();
        // A buyer sees no shop or administration.
        await expect(nav).not.toContainText("Administration");
        await expect(nav.getByRole("link", { name: /^My shop/ })).toHaveCount(0);
        const figures = page.getByRole("region", { name: "Your figures" });
        await expect(figures).toContainText("Unread messages");
        await expect(figures).toContainText("Favourites");
        await expect(figures).not.toContainText("Live products");
        await expect(page.getByRole("region", { name: "Recent messages" })).toContainText("No messages yet.");
        await nav.getByRole("link", { name: /^Notifications/ }).click();
        await expect(page).toHaveURL(/\/account\/notifications$/);
        await expect(nav.getByRole("link", { name: /^Notifications/ })).toHaveAttribute("aria-current", "page");

        // On a phone, the sidebar is a menu that opens and closes.
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("/account");
        await expect(page.getByRole("navigation", { name: "Dashboard" })).toBeHidden();
        await page.getByRole("button", { name: "Open the menu" }).click();
        await expect(page.getByRole("navigation", { name: "Dashboard" })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("navigation", { name: "Dashboard" })).toBeHidden();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        // The public site keeps its own header and footer.
        await page.goto("/products");
        await expect(page.getByRole("contentinfo")).toBeVisible();
      });

      test("signed-out visitors are asked to sign in", async ({ page }) => {
        await page.goto("/account");
        await expect(page.getByRole("heading", { name: "Please sign in" })).toBeVisible();
        await expect(page.getByRole("main").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
      });

      test("the header opens the account, which shows Buyer and has no ads", async ({ page, request }) => {
        const email = await confirmedAccount(page, request);
        await page.getByRole("banner").getByRole("link", { name: "Your account" }).click();
        await expect(page).toHaveURL(/\/account$/);
        const main = page.getByRole("main");
        // Took up to about 3 seconds with six browsers running at once on one machine.
        await expect(main).toContainText(email, { timeout: 15000 });
        await expect(page.getByRole("region", { name: "Your roles" })).toContainText("Buyer");
        await expect(page.getByRole("region", { name: "Your roles" })).toContainText("Active");
        // The previous page may stay hidden in the page for quick back navigation, so this checks what is visible.
        await expect(main.locator("#ads-title:visible, #blog-title:visible")).toHaveCount(0);
        await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
      });

      test("Co-admin and Super Admin are never offered", async ({ page, request }) => {
        await confirmedAccount(page, request);
        await page.goto("/account");
        await expect(apply(page).getByRole("button", { name: "Apply as Seller", exact: false })).toHaveCount(1);
        await expect(apply(page).getByRole("button", { name: /Apply as/ })).toHaveCount(3);
        await expect(apply(page)).not.toContainText("Super Admin");
        await expect(apply(page)).not.toContainText("Co-admin");
      });

      test("apply as a Seller, wait for review, withdraw and apply again", async ({ page, request }) => {
        await confirmedAccount(page, request);
        await page.goto("/account");
        await apply(page).getByRole("button", { name: "Apply as Seller", exact: false }).first().click();
        await page.getByRole("button", { name: "Submit application" }).click();
        await expect(page.getByText("This is required.").first()).toBeVisible();
        await fillSeller(page);
        await page.getByRole("button", { name: "Submit application" }).click();
        await expect(page.getByText("waiting for review").first()).toBeInViewport();
        await expect(applications(page)).toContainText("Seller");
        await expect(applications(page)).toContainText("Waiting for review");

        // Applying grants nothing, and the role can't be applied for twice.
        await expect(page.getByRole("region", { name: "Your roles" })).not.toContainText("Seller");
        await expect(apply(page).getByRole("button", { name: /Apply as Seller\b/ })).toHaveCount(0);
        await expect(apply(page).getByRole("button", { name: /Apply as/ })).toHaveCount(2);

        await page.reload();
        await expect(applications(page)).toContainText("Waiting for review");
        await applications(page).getByRole("button", { name: "Withdraw Seller application" }).click();
        await expect(applications(page)).toContainText("Withdrawn");
        await expect(apply(page).getByRole("button", { name: /Apply as/ })).toHaveCount(3);

        await apply(page).getByRole("button", { name: "Apply as Seller", exact: false }).first().click();
        await fillSeller(page);
        await page.getByRole("button", { name: "Submit application" }).click();
        await expect(applications(page)).toContainText("Waiting for review");
      });

      test("Marketer and Admin applications work too, and nobody applies to be staff", async ({ page, request }) => {
        await confirmedAccount(page, request);
        await page.goto("/account");
        for (const role of ["Marketer", "Admin"]) {
          await apply(page).getByRole("button", { name: `Apply as ${role}` }).click();
          await page.getByLabel("Why are you applying?").fill("I would like to help");
          await page.getByRole("button", { name: "Submit application" }).click();
          await expect(applications(page)).toContainText(role);
        }
        await expect(apply(page).getByRole("button", { name: "Apply as Seller Staff" })).toHaveCount(0);
        await expect(apply(page).getByRole("button", { name: /Apply as/ })).toHaveCount(1);
      });

      test("the name can be changed, and the header follows", async ({ page, request }) => {
        await confirmedAccount(page, request);
        await page.goto("/account");
        await page.getByLabel("Name", { exact: true }).fill("Ada Renamed");
        await page.getByRole("button", { name: "Save name" }).click();
        await expect(page.getByText("Your name has been saved.")).toBeVisible();
        await expect(page.getByRole("banner")).toContainText("Ada Renamed");
        await page.reload();
        await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Ada Renamed");
        await page.getByLabel("Name", { exact: true }).fill("   ");
        await page.getByRole("button", { name: "Save name" }).click();
        await expect(page.getByText("Enter a name of up to 100 characters.")).toBeVisible();
      });

      test("signing out on the account page hides the data", async ({ page, request }) => {
        const email = await confirmedAccount(page, request);
        await page.goto("/account");
        await expect(page.getByRole("main")).toContainText(email);
        await signOut(page);
        await expect(page.getByRole("heading", { name: "Please sign in" })).toBeVisible();
        await expect(page.getByRole("main")).not.toContainText(email);
      });

      test.describe("Super Admin role applications", () => {
        // Local database only. Bypasses the guard, so each test can have its own Super Admin.
        function sql(statement: string) {
          return execFileSync("docker", ["exec", "-i", "supabase_db_biqbaq", "psql", "-U", "supabase_admin", "-d", "postgres", "-q", "-tA", "-c", statement], {
            env: { ...process.env, PATH: `${process.env.PATH}:/Applications/Docker.app/Contents/Resources/bin` },
          }).toString().trim();
        }
        function makeSuperAdmin(email: string) {
          sql(`set session_replication_role = replica; insert into public.user_roles (user_id, role_key) select id, 'super_admin' from auth.users where email = '${email}';`);
        }
        const screen = "/admin/role-applications";
        // By email, as applicants in tests running at the same time share a name.
        const cardFor = (page: import("@playwright/test").Page, email: string) =>
          page.getByRole("article").filter({ hasText: email });

        async function newApplicant(browser: import("@playwright/test").Browser, request: import("@playwright/test").APIRequestContext) {
          const context = await browser.newContext();
          const page = await context.newPage();
          const email = await confirmedAccount(page, request);
          await page.goto("/account");
          await expect(page.getByRole("main")).toContainText(email, { timeout: 15000 });
          return { page, email, context };
        }

        test.describe("seller shops and publishing", () => {
          const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

          /** Approves a new applicant as a Seller, and opens their shop. */
          async function approvedSeller(page: import("@playwright/test").Page, browser: import("@playwright/test").Browser, request: import("@playwright/test").APIRequestContext) {
            const owner = await confirmedAccount(page, request);
            makeSuperAdmin(owner);
            const seller = await newApplicant(browser, request);
            await apply(seller.page).getByRole("button", { name: "Apply as Seller", exact: false }).first().click();
            await fillSeller(seller.page);
            await seller.page.getByRole("button", { name: "Submit application" }).click();
            await expect(applications(seller.page)).toContainText("Waiting for review");
            await page.goto(screen);
            await page.getByLabel("Search", { exact: true }).fill(seller.email);
            await page.getByRole("button", { name: "Search", exact: true }).click();
            await cardFor(page, seller.email).getByRole("button", { name: "View details" }).click({ timeout: 15000 });
            await cardFor(page, seller.email).getByRole("button", { name: "Approve" }).click();
            await expect(page.getByText("The application was approved")).toBeVisible();
            await seller.page.goto("/account");
            await seller.page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: /^My shop/ }).click({ timeout: 15000 });
            await expect(seller.page).toHaveURL(/\/account\/shop$/, { timeout: 15000 });
            await expect(seller.page.getByRole("heading", { name: "Ada's Shop" })).toBeVisible({ timeout: 15000 });
            return seller;
          }

          async function addProduct(page: import("@playwright/test").Page, name: string, complete = true) {
            // Products have their own page in My shop (Q-56).
            const here = new URL(page.url());
            if (!here.pathname.endsWith("/account/shop/products")) await page.goto(`/account/shop/products${here.searchParams.has("seller") ? here.search : ""}`);
            await page.getByRole("button", { name: "Add a product" }).click({ timeout: 15000 });
            const form = page.getByRole("form", { name: "New product" });
            await form.getByLabel("Product name").fill(name);
            await form.getByLabel("Price (CAD)").fill("12.50");
            if (complete) {
              await form.getByLabel("Description").fill("Made for this test");
              await form.getByLabel("Category").selectOption({ label: "Food & groceries" });
            }
            await form.getByRole("button", { name: "Save" }).click();
            await expect(page.getByRole("article", { name })).toContainText("Draft", { timeout: 15000 });
          }
          const item = (page: import("@playwright/test").Page, name: string) => page.getByRole("article", { name });

          test("the bell shows what happened, live, and people choose which emails they get", async ({ page, browser, request }) => {
            test.setTimeout(120000);
            const seller = await approvedSeller(page, browser, request);
            const shop = seller.page;
            const userId = sql(`select id from auth.users where email = '${seller.email}'`);
            // Being approved is already there.
            const bell = shop.getByRole("banner").getByRole("link", { name: /^Notifications/ });
            await expect(bell).toHaveAccessibleName(/Notifications, \d+ unread/, { timeout: 15000 });
            const before = Number(/(\d+) unread/.exec((await bell.getAttribute("aria-label")) ?? "")?.[1]);

            // A moderation decision arrives without a reload.
            sql(`select private.enqueue_email('${userId}', 'product_suspended', '{"product": "Bell Tote", "reason": "Photos are not of the item"}', 'e2e-bell:' || gen_random_uuid())`);
            await expect(bell).toHaveAccessibleName(`Notifications, ${before + 1} unread`, { timeout: 15000 });

            await bell.click();
            await expect(shop).toHaveURL(/\/account\/notifications$/);
            const list = shop.getByRole("list", { name: "Recent" });
            await expect(list).toContainText("Biqbaq suspended your listing “Bell Tote”.");
            await expect(list).toContainText("Reason: Photos are not of the item");
            await expect(list).toContainText("Your application for the Seller role was approved.");
            await list.getByRole("button", { name: /Bell Tote/ }).click();
            await expect(shop).toHaveURL(/\/account\/shop$/);
            await expect(bell).toHaveAccessibleName(`Notifications, ${before} unread`);

            await shop.goto("/account/notifications");
            await shop.getByRole("button", { name: "Mark all as read" }).click();
            await expect(bell).toHaveAccessibleName("Notifications");
            await expect(shop.getByRole("button", { name: "Mark all as read" })).toHaveCount(0);

            // Message emails can be turned off; decisions about the account cannot.
            const preferences = shop.getByRole("region", { name: "Email preferences" });
            await preferences.getByRole("checkbox", { name: /Emails about new messages/ }).uncheck();
            await expect(preferences.getByRole("status")).toHaveText("Saved.");
            await shop.reload();
            await expect(shop.getByRole("region", { name: "Email preferences" }).getByRole("checkbox", { name: /Emails about new messages/ })).not.toBeChecked({ timeout: 15000 });
            // Messages, staff, and the Biqbaq news list (Q-46).
            await expect(shop.getByRole("region", { name: "Email preferences" }).getByRole("checkbox")).toHaveCount(3);
            expect(sql(`select email_enabled from public.notification_preferences where user_id = '${userId}' and category = 'messages'`)).toBe("f");
          });

          test("referral links credit the latest marketer or shop, once the email is confirmed", async ({ page, browser, request }) => {
            test.setTimeout(150000);
            const seller = await approvedSeller(page, browser, request);
            const shop = seller.page;
            const userId = sql(`select id from auth.users where email = '${seller.email}'`);
            // Every shop has a link of its own (§14.5).
            await shop.getByRole("link", { name: "See your referral link" }).click();
            await expect(shop).toHaveURL(/\/account\/referrals$/);
            await expect(shop.getByRole("region", { name: "Shop referrals: Ada's Shop" })).toBeVisible({ timeout: 15000 });
            await expect(shop.getByRole("region", { name: "Marketer referrals" })).toHaveCount(0);

            // Super Admin makes them a marketer too; that programme is reported separately.
            sql(`insert into public.user_roles (user_id, role_key, granted_by) values ('${userId}', 'marketer', null)`);
            const marketerCode = sql(`select code from public.referral_codes where owner_user_id = '${userId}' and owner_type = 'marketer'`);
            const shopCode = sql(`select code from public.referral_codes where owner_user_id = '${userId}' and owner_type = 'seller'`);
            expect(marketerCode).toMatch(/^ADA20\d\d(\d{4})?$/);
            await shop.reload();
            const marketer = shop.getByRole("region", { name: "Marketer referrals" });
            await expect(marketer).toContainText(marketerCode, { timeout: 15000 });
            await expect(marketer).toContainText(`/register?ref=${marketerCode}`);
            await expect(marketer).toContainText("No sign-ups yet.");

            // A visitor opens the shop's link, then the marketer's: the latest gets the credit.
            const visitor = await (await browser.newContext()).newPage();
            await visitor.goto(`/products?ref=${shopCode}`);
            await visitor.goto(`/?ref=${marketerCode.toLowerCase()}`);
            const email = newEmail("referred");
            await register(visitor, email);
            expect(sql(`select owner_type || ':' || (completed_at is null) from public.referral_attributions where referred_user_id = (select id from auth.users where email = '${email}')`)).toBe("marketer:true");
            await shop.reload();
            await expect(marketer).toContainText("1 more person signed up and hasn't confirmed their email yet.", { timeout: 15000 });
            await expect(marketer.getByRole("list", { name: "Sign-ups" })).toContainText("Waiting for email");

            // Confirming counts it.
            await visitor.goto(await emailLink(request, email));
            await shop.reload();
            const stats = marketer.getByRole("definition");
            await expect(marketer.getByRole("list", { name: "Sign-ups" })).toContainText("Confirmed", { timeout: 15000 });
            await expect(stats.first()).toBeVisible();
            await expect(marketer).toContainText("Nobody is waiting to confirm their email.");
            await expect(shop.getByRole("region", { name: "Shop referrals: Ada's Shop" })).toContainText("No sign-ups yet.");

            // Super Admin sees it, and can change the code; the old link stops earning.
            await page.goto("/admin/referrals");
            await page.getByLabel("Search", { exact: true }).fill(marketerCode);
            await page.getByRole("button", { name: "Search", exact: true }).click();
            const card = page.getByRole("article").filter({ hasText: marketerCode });
            await expect(card).toContainText("1 confirmed", { timeout: 15000 });
            const newCode = `ADA${Date.now().toString().slice(-8)}`;
            await card.getByRole("button", { name: "Change code" }).click();
            await card.getByLabel("New code").fill("no spaces");
            await card.getByRole("button", { name: "Save" }).click();
            await expect(card).toContainText("Use 3 to 20 letters and numbers");
            await card.getByLabel("New code").fill(newCode.toLowerCase());
            await card.getByRole("button", { name: "Save" }).click();
            await expect(card).toHaveCount(0, { timeout: 15000 });
            await page.getByLabel("Search", { exact: true }).fill(newCode);
            await page.getByRole("button", { name: "Search", exact: true }).click();
            await expect(page.getByRole("article").filter({ hasText: newCode })).toContainText("1 confirmed", { timeout: 15000 });
            expect(sql(`select metadata ->> 'to' from public.audit_logs where action = 'referral.code_change' and metadata ->> 'from' = '${marketerCode}'`)).toBe(newCode);
          });

          test("customer emails: off until Super Admin turns them on, then to one client or all who receive updates", async ({ page, browser, request }) => {
            test.setTimeout(150000);
            const seller = await approvedSeller(page, browser, request);
            const shop = seller.page;
            const slug = sql(`select s.slug from public.sellers s join auth.users u on u.id = s.owner_user_id where u.email = '${seller.email}'`);
            await shop.goto("/account/shop/clients");
            const list = shop.getByRole("region", { name: "Customer emails" });
            await expect(list).toContainText("Customer emails are off for this shop.", { timeout: 15000 });
            await expect(list.getByRole("form", { name: "Add clients" })).toHaveCount(0);

            // Super Admin turns them on for this shop only (Q-43).
            await page.goto("/admin/email-lists");
            await page.getByLabel("Search shops").fill(slug);
            await page.getByRole("button", { name: "Search", exact: true }).click();
            // Tests running together all have an "Ada's Shop", so this finds this test's by its address.
            const row = page.getByRole("article").filter({ has: page.getByText(`/sellers/${slug}`, { exact: true }) });
            await expect(row).toContainText("Off", { timeout: 15000 });
            await row.getByRole("button", { name: "Turn on" }).click();
            await expect(row).toContainText("On");

            await shop.reload();
            await expect(list).toContainText("one at a time or all together", { timeout: 15000 });
            // A mailing address comes first (CASL).
            // The send area shows straight away, asking for the address the law requires.
            await expect(list).toContainText("Before your first email, add your mailing address.");
            // And the shop overview has a way to it at the top.
            await shop.goto("/account/shop");
            await expect(shop.getByRole("link", { name: "New invoice or receipt" }).first()).toHaveAttribute("href", /\/account\/invoices\/new\?seller=/, { timeout: 15000 });
            await shop.getByRole("link", { name: "Email your clients" }).click();
            await expect(shop).toHaveURL(/\/account\/shop\/clients$/);
            await list.getByLabel("Mailing address shown in your emails").fill("12 King St W, Toronto ON M5H 1A1");
            await list.getByRole("button", { name: "Save address" }).click();
            await expect(list.getByRole("form", { name: "Email your clients" })).toBeVisible();

            // Adding needs the seller's word that these people agreed (Q-42).
            const customer = newEmail("listed");
            const form = list.getByRole("form", { name: "Add clients" });
            await form.getByLabel("Name, client 1").fill("Chidi Eze");
            await form.getByLabel("Email, client 1").fill("not-an-email");
            await form.getByLabel("Phone, client 1").fill("416-555-0199");
            await form.getByLabel("Send updates, client 1").check();
            await form.getByRole("button", { name: "Save clients" }).click();
            await expect(form).toContainText("Client 1: Enter a valid email address.");
            await form.getByLabel("Email, client 1").fill(customer);
            await form.getByRole("button", { name: "Save clients" }).click();
            await expect(form).toContainText("Tick the box to confirm");
            await form.getByRole("checkbox", { name: /The clients I ticked are my existing customers/ }).check();
            await form.getByRole("button", { name: "Save clients" }).click();
            await expect(form.getByRole("status")).toContainText("1 added, 0 updated. 1 now receive your updates.");
            await expect(list.getByRole("list", { name: "Your list" })).toContainText("Chidi Eze");
            await expect(list.getByRole("list", { name: "Your list" })).toContainText("416-555-0199");
            await expect(list.getByRole("list", { name: "Your list" })).toContainText("Receiving updates");
            // Nobody is emailed for being added (Q-53).
            expect(sql(`select count(*) from public.background_jobs where payload ->> 'to' = '${customer}'`)).toBe("0");
            const token = sql(`select token from public.list_subscribers where email = '${customer}'`);

            // Email just that client, from their row.
            const compose = list.getByRole("form", { name: "Email your clients" });
            await list.getByRole("button", { name: "Email Chidi Eze" }).click();
            await expect(compose.getByLabel("Send to")).toHaveValue(customer);
            await compose.getByLabel("Subject").fill("Your order");
            await compose.getByLabel("Message").fill("Your order is ready for pickup.");
            await compose.getByRole("button", { name: "Review and send" }).click();
            await expect(compose).toContainText("Send this to Chidi Eze?");
            await compose.getByRole("button", { name: "Yes, send it" }).click();
            await expect(compose.getByRole("status")).toContainText("Sent to 1 person.");
            await expect(list.getByRole("list", { name: "Sent emails" })).toContainText(`To ${customer}`);

            // And everyone receiving updates.
            await compose.getByLabel("Send to").selectOption("");
            await compose.getByLabel("Subject").fill("New prints");
            await compose.getByLabel("Message").fill("Our new Adire prints are in.");
            await compose.getByRole("button", { name: "Review and send" }).click();
            await expect(compose).toContainText("Send this to 1 confirmed person?");
            await compose.getByRole("button", { name: "Yes, send it" }).click();
            await expect(compose.getByRole("status")).toContainText("Sent to 1 person.");
            await expect(list.getByRole("list", { name: "Sent emails" })).toContainText("New prints");
            expect(sql(`select payload -> 'data' ->> 'address' from public.background_jobs where payload ->> 'template' = 'bulk_email' and payload -> 'data' ->> 'subject' = 'New prints' and payload ->> 'to' = '${customer}'`)).toBe("12 King St W, Toronto ON M5H 1A1");
            expect(sql(`select payload -> 'data' ->> 'source' from public.background_jobs where payload -> 'data' ->> 'subject' = 'New prints' and payload ->> 'to' = '${customer}'`)).toBe("customer");

            // One email to all a day (Q-44).
            await compose.getByLabel("Subject").fill("Again");
            await compose.getByLabel("Message").fill("Again");
            await compose.getByRole("button", { name: "Review and send" }).click();
            await compose.getByRole("button", { name: "Yes, send it" }).click();
            await expect(compose).toContainText("You've sent today's email.");

            // An older link still opens its page, without changing anything.
            const visitor = await (await browser.newContext()).newPage();
            await visitor.goto(`/email/confirm?t=${token}`);
            await expect(visitor.getByRole("status")).toContainText("Thank you.");

            // Unsubscribing works from the page, and from mail apps' one-click button.
            await visitor.goto(`/email/unsubscribe?t=${token}`);
            await visitor.getByRole("button", { name: "Unsubscribe" }).click();
            await expect(visitor.getByRole("status")).toContainText("You're unsubscribed.");
            expect((await request.post(`/api/v1/email/unsubscribe?t=${token}`, { form: { "List-Unsubscribe": "One-Click" } })).status()).toBe(200);
            expect((await request.post("/api/v1/email/unsubscribe?t=nonsense")).status()).toBe(404);
            // Spam and bounce reports are only taken with Resend's signature (or refused until it is set up).
            const forged = await request.post("/api/v1/email/events", { data: { type: "email.complained", data: { email_id: "x" } } });
            expect([401, 503]).toContain(forged.status());
            await shop.reload();
            await expect(list.getByRole("list", { name: "Your list" })).toContainText("Unsubscribed", { timeout: 15000 });

            // A signed-in buyer can join from the shop page themselves.
            const buyer = await newApplicant(browser, request);
            await buyer.page.goto(`/sellers/${slug}`);
            await buyer.page.getByRole("button", { name: "Get updates" }).click({ timeout: 15000 });
            await expect(buyer.page.getByRole("button", { name: "Stop updates" })).toHaveAttribute("aria-pressed", "true");
            expect(sql(`select status || ':' || source from public.list_subscribers where email = '${buyer.email}'`)).toBe("confirmed:self");

            // And choose Biqbaq news.
            await buyer.page.goto("/account/notifications");
            await buyer.page.getByRole("checkbox", { name: /Biqbaq news/ }).check({ timeout: 15000 });
            await expect(buyer.page.getByRole("checkbox", { name: /Biqbaq news/ })).toBeChecked();
            await buyer.context.close();
          });

          test("a seller sends a client an invoice as a PDF, and the tables work on a phone", async ({ page, browser, request }) => {
            test.setTimeout(150000);
            const seller = await approvedSeller(page, browser, request);
            const shop = seller.page;
            const sellerId = sql(`select s.id from public.sellers s join auth.users u on u.id = s.owner_user_id where u.email = '${seller.email}'`);
            // Switched on and given an address directly: the screens for those are tested above.
            sql(`insert into public.email_lists (owner_type, seller_id, enabled, mailing_address) values ('seller', '${sellerId}', true, '12 King St W, Toronto ON M5H 1A1')`);
            await shop.goto("/account/shop/clients");
            const list = shop.getByRole("region", { name: "Customer emails" });

            // Two clients at once, neither asked to join bulk email: they're kept for invoices only.
            const client = newEmail("client");
            const form = list.getByRole("form", { name: "Add clients" });
            await form.getByLabel("Name, client 1").fill("Chidi Eze", { timeout: 15000 });
            await form.getByLabel("Email, client 1").fill(client);
            await form.getByRole("button", { name: "Add another client" }).click();
            await form.getByLabel("Name, client 2").fill("Bisi Ade");
            await form.getByLabel("Email, client 2").fill(newEmail("client"));
            await form.getByLabel("Phone, client 2").fill("call me");
            await form.getByRole("button", { name: "Save clients" }).click();
            await expect(form).toContainText("Client 2: Enter a phone number with at least 7 digits");
            await form.getByLabel("Phone, client 2").fill("+1 613 555 0101");
            await form.getByRole("button", { name: "Save clients" }).click();
            await expect(form.getByRole("status")).toContainText("2 added, 0 updated. 0 now receive your updates.");
            const row = list.getByRole("list", { name: "Your list" }).getByRole("listitem").filter({ hasText: client });
            await expect(row).toContainText("Invoices only");
            expect(sql(`select count(*) from public.background_jobs where payload ->> 'to' = '${client}'`)).toBe("0");

            // On a phone, the client table becomes cards, with no sideways scrolling.
            await shop.setViewportSize({ width: 375, height: 800 });
            await expect(form.getByLabel("Name, client 1")).toBeVisible();
            expect(await shop.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
            await shop.setViewportSize({ width: 1280, height: 800 });

            // The invoice page opens with the client chosen.
            await row.getByRole("link", { name: "Invoice or receipt" }).click();
            await expect(shop).toHaveURL(/\/account\/invoices\/new\?client=/);
            const invoice = shop.getByRole("form", { name: "Invoice or receipt" });
            await expect(invoice.getByLabel("Client", { exact: true })).toHaveValue(client, { timeout: 15000 });
            await invoice.getByLabel("Description, line 1").fill("Ankara fabric (yards)");
            await invoice.getByLabel("Quantity, line 1").fill("2.5");
            await invoice.getByLabel("Unit price (CAD), line 1").fill("abc");
            await invoice.getByRole("button", { name: "Send invoice" }).click();
            await expect(invoice).toContainText("Line 1: enter a price, like 12.99.");
            await invoice.getByLabel("Unit price (CAD), line 1").fill("12.99");
            await invoice.getByRole("button", { name: "Add a line" }).click();
            await invoice.getByLabel("Description, line 2").fill("Delivery");
            await invoice.getByLabel("Unit price (CAD), line 2").fill("10");
            await invoice.getByRole("button", { name: "Add a tax" }).click();
            await invoice.getByLabel("Tax name, line 1").fill("HST");
            await invoice.getByLabel("Rate (%), line 1").fill("13");
            // The same total the database works out.
            await expect(invoice.getByRole("region", { name: "Total" })).toContainText("$48.00");

            // On a phone, the items table becomes cards too, and nothing is wider than the screen.
            await shop.setViewportSize({ width: 375, height: 800 });
            const tooWide = await shop.evaluate(() =>
              [...document.querySelectorAll("main *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).map((el) => el.tagName + (el.id ? `#${el.id}` : "")).slice(0, 5),
            );
            expect(tooWide).toEqual([]);
            expect(await shop.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
            await shop.setViewportSize({ width: 1280, height: 800 });

            const previewResponse = shop.waitForResponse((response) => response.url().endsWith("/api/v1/invoices/preview"));
            await invoice.getByRole("button", { name: "Preview PDF" }).click();
            const preview = await previewResponse;
            expect(preview.status()).toBe(200);
            expect(preview.headers()["content-type"]).toBe("application/pdf");
            await expect(invoice.getByRole("link", { name: "Open the preview (PDF)" })).toBeVisible();

            await invoice.getByRole("button", { name: "Send invoice" }).click();
            await expect(invoice.getByRole("status")).toContainText("INV-0001 for $48.00 was sent to Chidi Eze.", { timeout: 15000 });
            const id = sql(`select id from public.invoices where client_email = '${client}'`);
            expect(sql(`select total_minor from public.invoices where id = '${id}'`)).toBe("4800");
            expect(sql(`select count(*) from public.background_jobs where payload ->> 'template' = 'invoice' and payload ->> 'to' = '${client}'`)).toBe("1");

            // Listed on the shop's Invoices page, to download or send again.
            await shop.goto("/account/shop/invoices");
            const documents = shop.getByRole("list", { name: "Invoices and receipts" });
            await expect(documents).toContainText("INV-0001", { timeout: 15000 });
            const href = await documents.getByRole("link", { name: "Download PDF" }).getAttribute("href");
            const download = await shop.context().request.get(href!);
            expect(download.headers()["content-type"]).toBe("application/pdf");
            expect((await download.body()).subarray(0, 5).toString()).toBe("%PDF-");
            // Nobody else can download it.
            expect((await request.get(href!)).status()).toBe(404);
            await documents.getByRole("button", { name: "Send again" }).click();
            await expect(documents).toContainText("Sent again.");
          });

          test.describe("messaging", () => {
            test("a buyer messages a seller about a product, and both see replies arrive live", async ({ page, browser, request }) => {
              test.setTimeout(150000);
              const seller = await approvedSeller(page, browser, request);
              const shop = seller.page;
              const name = `Message ${unique()}`;
              await addProduct(shop, name);
              await item(shop, name).getByRole("button", { name: "Publish" }).click();
              await expect(item(shop, name)).toContainText("Published");
              const slug = sql(`select slug from public.products where name = '${name}'`);

              // A seller cannot message their own shop.
              await shop.goto(`/products/${slug}`);
              await shop.getByRole("button", { name: "Message the seller" }).click({ timeout: 15000 });
              await shop.getByLabel("Your message").fill("Hello me");
              await shop.getByRole("form", { name: "Message the seller" }).getByRole("button", { name: "Send" }).click();
              await expect(shop.getByText("This is your own shop.")).toBeVisible();

              await shop.goto("/account/messages");
              await expect(shop.getByText("No conversations yet.")).toBeVisible({ timeout: 15000 });

              const buyer = await newApplicant(browser, request);
              await buyer.page.goto(`/products/${slug}`);
              await buyer.page.getByRole("button", { name: "Message the seller" }).click({ timeout: 15000 });
              await buyer.page.getByRole("form", { name: "Message the seller" }).getByRole("button", { name: "Send" }).click();
              await expect(buyer.page.getByText("Write a message first.")).toBeVisible();
              await buyer.page.getByLabel("Your message").fill("Is this still available?");
              await buyer.page.getByRole("form", { name: "Message the seller" }).getByRole("button", { name: "Send" }).click();
              await expect(buyer.page).toHaveURL(/\/account\/messages\?c=/, { timeout: 15000 });
              const buyerThread = buyer.page.getByRole("region", { name: "Conversation with Ada's Shop" });
              await expect(buyerThread).toContainText(`About ${name}`);
              await expect(buyerThread.getByRole("list", { name: "Messages" })).toContainText("Is this still available?");

              // It reaches the seller without a reload, with the header's count.
              await expect(shop.getByRole("list", { name: "Conversations" })).toContainText(name, { timeout: 15000 });
              await expect(shop.getByRole("link", { name: /1 conversation with unread messages/ })).toBeVisible({ timeout: 15000 });
              await shop.getByRole("list", { name: "Conversations" }).getByRole("link").first().click();
              const sellerThread = shop.getByRole("region", { name: /^Conversation with / });
              await expect(sellerThread.getByRole("list", { name: "Messages" })).toContainText("Is this still available?");
              await expect(shop.getByRole("banner").getByRole("link", { name: "Messages", exact: true })).toBeVisible({ timeout: 15000 });
              // The buyer has read the question, as they sent it.
              await expect(buyerThread.getByRole("listitem").filter({ hasText: "Is this still available?" })).toContainText("Read", { timeout: 15000 });
              await sellerThread.getByLabel("Your reply").fill("Yes, it ships tomorrow.");
              await sellerThread.getByRole("button", { name: "Send" }).click();

              // The buyer sees the reply live, signed by the shop.
              await expect(buyerThread.getByRole("list", { name: "Messages" })).toContainText("Yes, it ships tomorrow.", { timeout: 15000 });
              // The buyer has it open, so the seller's Sent turns to Read without a reload.
              await expect(sellerThread.getByRole("listitem").filter({ hasText: "Yes, it ships tomorrow." })).toContainText("Read", { timeout: 15000 });
              await expect(buyerThread.getByRole("listitem").filter({ hasText: "Yes, it ships tomorrow." })).toContainText("Ada's Shop");

              // Closing stops both sides until one reopens it.
              await sellerThread.getByRole("button", { name: "Close conversation" }).click();
              await expect(buyerThread).toContainText("This conversation is closed", { timeout: 15000 });
              await buyerThread.getByRole("button", { name: "Reopen conversation" }).click();
              await buyerThread.getByLabel("Your reply").fill("Great, thanks!");
              await buyerThread.getByRole("button", { name: "Send" }).click();
              await expect(sellerThread.getByRole("list", { name: "Messages" })).toContainText("Great, thanks!", { timeout: 15000 });

              // Archiving is personal: the seller still has it.
              await buyerThread.getByRole("button", { name: "Archive" }).click();
              await expect(buyer.page).toHaveURL(/box=archived/);
              await buyer.page.getByRole("tab", { name: "Inbox" }).click();
              await expect(buyer.page.getByText("No conversations yet.")).toBeVisible();
              await shop.reload();
              await expect(shop.getByRole("list", { name: "Conversations" })).toContainText(name, { timeout: 15000 });

              // One email each way within the hour, and never the message.
              const sellerId = sql(`select id from auth.users where email = '${seller.email}'`);
              expect(sql(`select count(*) from public.background_jobs where user_id = '${sellerId}' and payload ->> 'template' = 'message_to_seller'`)).toBe("1");
              expect(sql(`select count(*) from public.background_jobs where payload::text like '%still available%'`)).toBe("0");

              // Super Admin reads it only with a reason, which is audited (Q-36).
              await page.goto("/admin/messages");
              await page.getByLabel("Search", { exact: true }).fill(buyer.email);
              await page.getByRole("button", { name: "Search", exact: true }).click();
              const card = page.getByRole("article").filter({ hasText: buyer.email });
              await expect(card).toContainText("3 messages", { timeout: 15000 });
              await expect(card).not.toContainText("still available");
              await card.getByRole("button", { name: "Read conversation" }).click();
              await card.getByRole("button", { name: "Read it" }).click();
              await expect(card).toContainText("Give a reason first.");
              await card.getByLabel("Why are you reading this conversation?").fill("Checking a fraud report");
              await card.getByRole("button", { name: "Read it" }).click();
              await expect(card.getByRole("list", { name: "Messages" })).toContainText("Is this still available?");
              const conversation = sql(`select id from public.conversations where buyer_id = (select id from auth.users where email = '${buyer.email}')`);
              expect(sql(`select reason from public.audit_logs where action = 'conversation.admin_read' and target_id = '${conversation}'`)).toBe("Checking a fraud report");
              await buyer.context.close();
            });

            test("signed-out visitors are offered sign-in, which brings them back to the product", async ({ page, request }) => {
              test.setTimeout(90000);
              const email = await confirmedAccount(page, request);
              await page.context().clearCookies();
              await page.goto("/products/ankara-tote-bag");
              await page.getByRole("link", { name: "Sign in to message the seller" }).click();
              await expect(page).toHaveURL(/\/sign-in\?next=%2Fproducts%2Fankara-tote-bag$/);
              await page.getByLabel("Email", { exact: true }).fill(email);
              await page.getByLabel("Password", { exact: true }).fill(password);
              await page.getByRole("button", { name: "Sign in", exact: true }).click();
              await expect(page).toHaveURL(/\/products\/ankara-tote-bag$/, { timeout: 15000 });
              await expect(page.getByRole("button", { name: "Message the seller" })).toBeVisible({ timeout: 15000 });
              // The email form is still there for people without an account.
              await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
            });
          });

          test("Super Admin changes a setting, sees why and who, and finds it in the audit log", async ({ page, browser, request }) => {
            test.setTimeout(120000);
            const owner = await confirmedAccount(page, request);
            makeSuperAdmin(owner);
            const id = unique();
            await page.goto("/admin/settings");

            const row = page.getByRole("listitem", { name: "Messages per seller" });
            await expect(row.getByTestId("value-contactPerSeller")).toHaveText("50");
            await row.getByRole("button", { name: "Change" }).click();
            const form = row.getByRole("form");

            // Refused in the browser first.
            await form.getByLabel("New value").fill("0");
            await form.getByLabel("Why are you changing this?").fill(`Test ${id}`);
            await form.getByRole("button", { name: "Save change" }).click();
            await expect(form.getByText("Enter a value between 1 and 100000.")).toBeVisible();
            await form.getByLabel("New value").fill("60");
            await form.getByLabel("Why are you changing this?").fill("");
            await form.getByRole("button", { name: "Save change" }).click();
            await expect(form.getByText("Enter a reason for this change.")).toBeVisible();

            try {
              await form.getByLabel("Why are you changing this?").fill(`Test ${id}`);
              await form.getByRole("button", { name: "Save change" }).click();
              await expect(row.getByTestId("value-contactPerSeller")).toHaveText("60");
              const history = page.getByRole("region", { name: "Recent changes" });
              await expect(history).toContainText("50 to 60");
              await expect(history).toContainText(`Reason: Test ${id}`);

              // The same change, in the audit log, found by searching its reason.
              await page.goto("/admin/audit-log");
              await page.getByLabel("Search people, targets and reasons").fill(id);
              await page.getByRole("button", { name: "Search", exact: true }).click();
              const results = page.getByRole("region", { name: "Audit log entries" });
              await expect(results).toContainText("1 entry");
              await expect(results).toContainText("Changed a setting");
              await expect(results).toContainText(owner);
              await expect(results).toContainText("contact.max_per_seller_hour");
              await results.getByRole("button", { name: "Show details" }).click();
              await expect(results.locator("pre")).toContainText('"new": 60');
              await page.getByLabel("Action").selectOption("product.publish");
              await expect(results).toContainText("Nothing matches this search.");
            } finally {
              // Other tests rely on this limit.
              sql(`update public.platform_settings set value = '50' where key = 'contact.max_per_seller_hour'`);
            }
          });

          test("only Super Admin can open the settings and audit log", async ({ page, request }) => {
            await confirmedAccount(page, request);
            for (const path of ["/admin/settings", "/admin/audit-log"]) {
              await page.goto(path);
              await expect(page.getByText("You don't have access")).toBeVisible();
              await expect(page.getByText("Seller publishing")).toHaveCount(0);
            }
          });

          test("Super Admin gives, changes, suspends and removes a role, and it takes effect", async ({ page, browser, request }) => {
            test.setTimeout(150000);
            const owner = await confirmedAccount(page, request);
            makeSuperAdmin(owner);
            const person = await newApplicant(browser, request);
            const moderation = person.page.getByRole("link", { name: "Moderation", exact: true });
            await person.page.goto("/account");
            await expect(person.page.getByRole("heading").first()).toBeVisible();
            await expect(moderation).toHaveCount(0);

            await page.goto("/account");
            await page.getByRole("link", { name: "People and roles" }).click();
            await expect(page).toHaveURL(/\/admin\/people$/);
            await page.getByLabel("Search by name or email").fill(person.email);
            await page.getByRole("button", { name: "Search", exact: true }).click();
            const card = page.getByRole("article", { name: person.email });
            await expect(page.getByRole("article")).toHaveCount(1);
            const buyer = card.getByRole("listitem", { name: "Buyer" });
            await expect(buyer.getByRole("button")).toHaveCount(0);

            // Give the Admin role, with one permission.
            await card.getByRole("button", { name: "Give a role" }).click();
            const give = card.getByRole("form", { name: "Give a role" });
            await give.getByRole("button", { name: "Give role" }).click();
            await expect(give.getByText("Choose a role.")).toBeVisible();
            await give.getByLabel("Role to give").selectOption("super_admin");
            await expect(give.getByText("A Super Admin has full control of Biqbaq")).toBeVisible();
            await give.getByLabel("Role to give").selectOption("admin");
            await give.getByLabel("Moderate product listings").check();
            await give.getByLabel("Reason").fill("Helping with listings");
            await give.getByRole("button", { name: "Give role" }).click();
            const admin = card.getByRole("listitem", { name: "Admin", exact: true });
            await expect(admin).toContainText("Moderate product listings");
            await person.page.reload();
            await expect(moderation).toBeVisible();

            // Suspending takes the access away, and restoring gives it back.
            await admin.getByRole("button", { name: "Suspend role" }).click();
            await admin.getByLabel("Reason").fill("Under review");
            await admin.getByRole("button", { name: "Confirm: Suspend role" }).click();
            await expect(admin).toContainText("Suspended");
            await expect(admin).toContainText("Reason: Under review");
            await person.page.reload();
            await expect(person.page.getByRole("heading").first()).toBeVisible();
            await expect(moderation).toHaveCount(0);
            await admin.getByRole("button", { name: "Restore role" }).click();
            await admin.getByLabel("Reason").fill("Cleared");
            await admin.getByRole("button", { name: "Confirm: Restore role" }).click();
            await expect(admin.getByRole("button", { name: "Suspend role" })).toBeVisible();
            await person.page.reload();
            await expect(moderation).toBeVisible();

            // Removing a permission takes effect too.
            await admin.getByRole("button", { name: "Change permissions" }).click();
            await admin.getByLabel("Moderate product listings").uncheck();
            await admin.getByRole("button", { name: "Save permissions" }).click();
            await expect(admin).toContainText("No permissions yet");
            await person.page.reload();
            await expect(person.page.getByRole("heading").first()).toBeVisible();
            await expect(moderation).toHaveCount(0);

            // Removing the role is final, and the account and its other roles stay.
            await admin.getByRole("button", { name: "Remove role" }).click();
            await admin.getByLabel("Reason").fill("Left the team");
            await admin.getByRole("button", { name: "Confirm: Remove role" }).click();
            await expect(admin).toContainText("Removed");
            await expect(admin.getByRole("button")).toHaveCount(0);
            await expect(buyer).toContainText("Active");

            // They were told at each step, and it is all in the audit log under their email.
            expect(sql(`select string_agg(distinct b.payload ->> 'template', ',' order by b.payload ->> 'template') from public.background_jobs b join auth.users u on u.id = b.user_id where u.email = '${person.email}' and b.payload ->> 'template' like 'role_%'`)).toBe("role_assigned,role_restored,role_revoked,role_suspended");
            await page.goto("/admin/audit-log");
            await page.getByLabel("Action").selectOption("role.revoked");
            await page.getByLabel("Search people, targets and reasons").fill(person.email);
            await page.getByRole("button", { name: "Search", exact: true }).click();
            const results = page.getByRole("region", { name: "Audit log entries" });
            await expect(results).toContainText("1 entry");
            await expect(results).toContainText(`On: ${person.email}`);
          });

          test("suspending a seller takes their shop off the site, and restoring brings it back", async ({ page, browser, request }) => {
            test.setTimeout(150000);
            const { page: shop, email } = await approvedSeller(page, browser, request);
            const shopLink = await shop.getByRole("link", { name: "View public page" }).getAttribute("href");
            const visitor = await (await browser.newContext()).newPage();
            await visitor.goto(shopLink!);
            await expect(visitor.getByRole("main")).toContainText("Ada's Shop");

            await page.goto("/admin/people");
            await page.getByLabel("Search by name or email").fill(email);
            await page.getByRole("button", { name: "Search", exact: true }).click();
            const seller = page.getByRole("article", { name: email }).getByRole("listitem", { name: "Seller", exact: true });
            await seller.getByRole("button", { name: "Suspend role" }).click();
            await expect(seller.getByText("Their shop and its products leave the site too.")).toBeVisible();
            await seller.getByLabel("Reason").fill("Fraud report");
            await seller.getByRole("button", { name: "Confirm: Suspend role" }).click();
            await expect(seller).toContainText("Reason: Fraud report");

            await expect(async () => {
              const response = await visitor.goto(shopLink!);
              expect(response?.status()).toBe(404);
            }).toPass({ timeout: 90000 });
            (visitor as unknown as { problems?: string[] }).problems = [];

            // Moderation shows it suspended, and explains why it can't simply be reopened.
            await page.goto("/admin/moderation");
            const shops = page.getByRole("region", { name: "Shops" });
            await shops.getByLabel("Search by name").fill(email);
            await shops.getByRole("button", { name: "Search" }).click();
            const card = shops.getByRole("article", { name: "Ada's Shop" }).filter({ hasText: email });
            await card.getByRole("button", { name: "Restore shop" }).click();
            await card.getByLabel("Reason").fill("Reopening");
            await card.getByRole("button", { name: "Confirm: Restore shop" }).click();
            await expect(card.getByText("Restore the role in People and roles")).toBeVisible();
            ignoreExpectedFailures(page); // The browser logs a refused action as an error.

            await page.goto("/admin/people");
            await page.getByLabel("Search by name or email").fill(email);
            await page.getByRole("button", { name: "Search", exact: true }).click();
            await seller.getByRole("button", { name: "Restore role" }).click();
            await seller.getByLabel("Reason").fill("Cleared");
            await seller.getByRole("button", { name: "Confirm: Restore role" }).click();
            await expect(seller.getByRole("button", { name: "Suspend role" })).toBeVisible();
            await expect(async () => {
              await visitor.goto(shopLink!);
              await expect(visitor.getByRole("main")).toContainText("Ada's Shop", { timeout: 2000 });
            }).toPass({ timeout: 90000 });
          });

          test("a seller invites staff, who can do only what they were given", async ({ page, browser, request }) => {
            test.setTimeout(180000);
            const { page: shop } = await approvedSeller(page, browser, request);
            const person = await newApplicant(browser, request);
            const id = unique();
            const name = `Staff made ${id}`;

            // The seller invites them and chooses what they can do, on the shop's Staff page.
            await shop.goto("/account/shop/staff");
            const staff = shop.getByRole("region", { name: "Staff", exact: true });
            await expect(staff).toContainText("You haven't added any staff yet.");
            await staff.getByRole("button", { name: "Invite staff" }).click();
            const form = staff.getByRole("form", { name: "Invite staff" });
            await form.getByLabel("Their email address").fill("not an address");
            await form.getByRole("button", { name: "Send invitation" }).click();
            await expect(form.getByText("Enter a valid email address.")).toBeVisible();
            await form.getByLabel("Their email address").fill(person.email);
            await form.getByLabel("Create products").check();
            await form.getByLabel("Edit products and photos").check();
            await form.getByRole("button", { name: "Send invitation" }).click();
            await expect(staff.getByText("Invitation sent.")).toBeVisible();
            await expect(staff.getByRole("listitem", { name: person.email })).toContainText("Create products, Edit products and photos");
            expect(sql(`select count(*) from public.background_jobs b join auth.users u on u.id = b.user_id where u.email = '${person.email}' and b.payload ->> 'template' = 'staff_invitation'`)).toBe("1");

            // They accept, but accepting alone gives no access.
            await person.page.goto("/account");
            const mine = person.page.getByRole("region", { name: "Shops you work for" });
            await expect(mine).toContainText("Ada's Shop has invited you to join their staff");
            await mine.getByRole("button", { name: "Accept" }).click();
            await expect(mine).toContainText("Waiting for the shop's approval", { timeout: 15000 });
            await expect(mine.getByRole("link", { name: "Open shop" })).toHaveCount(0);
            const waitingUrl = `/account/shop?seller=${sql(`select m.seller_id from public.seller_staff_memberships m join auth.users p on p.id = m.user_id where p.email = '${person.email}'`)}`;
            await person.page.goto(waitingUrl);
            await expect(person.page.getByText("You don't have a shop yet")).toBeVisible();

            // The seller sees they accepted, and approves them.
            await shop.reload();
            const accepted = shop.getByRole("region", { name: "Staff", exact: true }).getByRole("listitem", { name: person.email });
            await expect(accepted).toContainText("Waiting for your approval");
            await accepted.getByRole("button", { name: "Approve", exact: true }).click();
            await expect(accepted).toContainText("Active");
            await expect(accepted.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);

            // Now they can work in the shop, with no step for Super Admin.
            await person.page.goto("/account");
            await person.page.getByRole("region", { name: "Shops you work for" }).getByRole("link", { name: "Open shop" }).click();
            await expect(person.page).toHaveURL(/\/account\/shop\?seller=/);
            await expect(person.page.getByText("You are working here as staff.")).toBeVisible();
            await expect(person.page.getByRole("region", { name: "Shop details" })).toHaveCount(0);
            await expect(person.page.getByRole("region", { name: "Show your products and reviews on your own website" })).toHaveCount(0);
            await expect(person.page.getByRole("region", { name: "Staff", exact: true })).toHaveCount(0);
            // Their shop's pages show as tabs, only those they may use.
            const tabs = person.page.getByRole("navigation", { name: "Shop pages" });
            await expect(tabs.getByRole("link", { name: "Products" })).toBeVisible();
            await expect(tabs.getByRole("link", { name: "Shop settings" })).toHaveCount(0);
            await expect(tabs.getByRole("link", { name: "Staff" })).toHaveCount(0);

            // They can create, but were not given publish or delete.
            await addProduct(person.page, name);
            await expect(item(person.page, name).getByRole("button", { name: "Edit" })).toBeVisible();
            await expect(item(person.page, name).getByRole("button", { name: "Publish" })).toHaveCount(0);
            await expect(item(person.page, name).getByRole("button", { name: "Delete" })).toHaveCount(0);

            // The seller sees it, and gives publish too.
            await shop.goto("/account/shop/products");
            await expect(item(shop, name)).toBeVisible({ timeout: 15000 });
            await shop.goto("/account/shop/staff");
            const member = shop.getByRole("region", { name: "Staff", exact: true }).getByRole("listitem", { name: person.email });
            await member.getByRole("button", { name: "Change what they can do" }).click();
            await member.getByLabel("Publish and unpublish products").check();
            await member.getByRole("button", { name: "Save" }).click();
            await expect(member).toContainText("Publish and unpublish products");
            await person.page.reload();
            await item(person.page, name).getByRole("button", { name: "Publish" }).click();
            await expect(item(person.page, name)).toContainText("Published");

            // The record keeps owner and actor apart.
            expect(sql(`select u.email || ' for ' || s.slug from public.audit_logs a join auth.users u on u.id = a.actor_id join public.sellers s on s.id = a.on_behalf_of_seller_id join public.products p on p.id::text = a.target_id where a.action = 'product.publish' and p.name = '${name}'`)).toContain(person.email);

            // Suspending ends their access straight away.
            await member.getByRole("button", { name: "Suspend access" }).click();
            await expect(member).toContainText("Suspended");
            await person.page.reload();
            await expect(person.page.getByText("You don't have a shop yet")).toBeVisible();
            await member.getByRole("button", { name: "Restore access" }).click();
            await expect(member.getByRole("button", { name: "Suspend access" })).toBeVisible();

            // So does removing them, and their work stays with the shop.
            await member.getByRole("button", { name: "Remove" }).click();
            await member.getByRole("button", { name: "Yes, remove them" }).click();
            await expect(shop.getByRole("region", { name: "Staff", exact: true }).getByRole("listitem", { name: person.email })).toHaveCount(0);
            await person.page.reload();
            await expect(person.page.getByText("You don't have a shop yet")).toBeVisible();
            await shop.goto("/account/shop/products");
            await expect(item(shop, name)).toContainText("Published", { timeout: 15000 });
          });

          test("a seller cannot see or reach another seller's staff or shop", async ({ page, browser, request }) => {
            test.setTimeout(120000);
            const seller = await approvedSeller(page, browser, request);
            const shop = seller.page;
            // This test's own shop, not the newest one, which may be another test's.
            const sellerId = sql(`select s.id from public.sellers s join auth.users u on u.id = s.owner_user_id where u.email = '${seller.email}'`);
            expect(sellerId).not.toBe("");
            const outsider = await newApplicant(browser, request);
            await outsider.page.goto(`/account/shop?seller=${sellerId}`);
            await expect(outsider.page.getByText("You don't have a shop yet")).toBeVisible({ timeout: 15000 });
            await shop.goto("/account/shop/staff");
            await expect(shop.getByRole("region", { name: "Staff", exact: true })).toBeVisible({ timeout: 15000 });
          });

          test("a seller's own change shows in the public API", async ({ page, browser, request }) => {
            test.setTimeout(120000);
            const { page: shop } = await approvedSeller(page, browser, request);
            // This shop's own address, from its page. Other tests create shops at the same time.
            const slug = (await shop.getByRole("link", { name: "View public page" }).getAttribute("href"))!.split("/").pop()!;
            const name = `API ${unique()}`;

            // The seller finds their address in Shop settings, and it is the one that works.
            await shop.goto("/account/shop/settings");
            const card = shop.getByRole("region", { name: "Show your products and reviews on your own website" });
            const shown = await card.getByLabel("Your shop's product address").inputValue();
            expect(new URL(shown).pathname).toBe(`/api/v1/sellers/${slug}/products`);
            // And the address for its reviews.
            const reviews = await card.getByLabel("Your shop's reviews address").inputValue();
            expect(new URL(reviews).pathname).toBe(`/api/v1/sellers/${slug}/reviews`);
            expect((await (await request.get(new URL(reviews).pathname)).json()).summary).toEqual({ reviewCount: 0, averageRating: null });
            await card.getByText("Notes for your website developer").first().click();
            await expect(card).toContainText("send them to that Biqbaq page");
            const api = async () => (await (await request.get(`/api/v1/sellers/${slug}/products`)).json()).data.map((p: { name: string }) => p.name);
            expect(await api()).toEqual([]);
            await addProduct(shop, name);
            expect(await api()).toEqual([]);
            await item(shop, name).getByRole("button", { name: "Publish" }).click();
            await expect(item(shop, name)).toContainText("Published");
            await expect.poll(api, { timeout: 90000 }).toEqual([name]);
            await item(shop, name).getByRole("button", { name: "Unpublish" }).click();
            await expect.poll(api, { timeout: 90000 }).toEqual([]);
          });

          test("a buyer reviews and saves a product, the seller cannot, and a moderator hides it", async ({ page, browser, request }) => {
            test.setTimeout(150000);
            const { page: shop } = await approvedSeller(page, browser, request);
            const name = `Reviewed ${unique()}`;
            await addProduct(shop, name);
            await item(shop, name).getByRole("button", { name: "Publish" }).click();
            await expect(item(shop, name)).toContainText("Published");
            const slug = sql(`select slug from public.products where name = '${name}'`);

            // A visitor is asked to sign in.
            const visitor = await (await browser.newContext()).newPage();
            await visitor.goto(`/products/${slug}`);
            const reviews = visitor.getByRole("region", { name: "Customer reviews" });
            await expect(reviews).toContainText("No reviews yet.");
            await expect(reviews).toContainText("to write a review.");
            await expect(visitor.getByRole("link", { name: "Save to favourites" })).toBeVisible();

            // The seller cannot review their own product.
            await shop.goto(`/products/${slug}`);
            await expect(shop.getByText("You can't review products from your own shop")).toBeVisible();

            // A buyer reviews it.
            const buyer = await newApplicant(browser, request);
            await buyer.page.goto(`/products/${slug}`);
            const section = buyer.page.getByRole("region", { name: "Customer reviews" });
            await section.getByRole("button", { name: "Write a review" }).click();
            await section.getByRole("button", { name: "Post review" }).click();
            await expect(section.getByText("Choose a rating from 1 to 5 stars.")).toBeVisible();
            // Clicks the fourth star, as a person would.
            await section.getByRole("radio", { name: "4 stars" }).locator("xpath=..").click();
            await expect(section.getByRole("radio", { name: "4 stars" })).toBeChecked();
            await section.getByLabel("Your review (optional)").fill("Lovely quality <b>bold</b>");
            await section.getByRole("button", { name: "Post review" }).click();
            await expect(section.getByText("Lovely quality <b>bold</b>")).toBeVisible({ timeout: 15000 });
            await expect(buyer.page.getByText("4 out of 5 from 1 review")).toBeVisible();
            await expect(section.getByRole("button", { name: "Edit your review" })).toBeVisible();

            // Everyone sees it.
            await expect(async () => {
              await visitor.reload();
              await expect(visitor.getByRole("region", { name: "Customer reviews" })).toContainText("Lovely quality", { timeout: 2000 });
            }).toPass({ timeout: 90000 });

            // Saving it for later.
            const save = buyer.page.getByRole("button", { name: "Save to favourites" });
            await save.click();
            await expect(buyer.page.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");
            await buyer.page.goto("/account");
            const saved = buyer.page.getByRole("region", { name: "Saved products" });
            await expect(saved.getByRole("link", { name })).toBeVisible();
            await saved.getByRole("button", { name: "Remove" }).click();
            await expect(buyer.page.getByRole("region", { name: "Saved products" })).toHaveCount(0);

            // A moderator hides it, with a reason.
            await page.goto("/admin/moderation");
            const panel = page.getByRole("region", { name: "Reviews" });
            await panel.getByLabel("Search by name").fill(name);
            await panel.getByRole("button", { name: "Search" }).click();
            const card = panel.getByRole("article", { name: `Review of ${name}` });
            await card.getByRole("button", { name: "Hide review" }).click();
            await card.getByLabel("Reason").fill("Not about the product");
            await card.getByRole("button", { name: "Confirm: Hide review" }).click();
            await expect(panel.getByText("Nothing matches this search.")).toBeVisible();
            await expect(async () => {
              await visitor.reload();
              await expect(visitor.getByRole("region", { name: "Customer reviews" })).toContainText("No reviews yet.", { timeout: 2000 });
            }).toPass({ timeout: 90000 });
            await buyer.page.goto(`/products/${slug}`);
            await expect(buyer.page.getByText("Biqbaq has hidden your review of this product.")).toBeVisible();
          });

          test("views count once per visitor per day, and never the seller or bots", async ({ page, browser, request }) => {
            test.setTimeout(150000);
            const { page: shop } = await approvedSeller(page, browser, request);
            const name = `Viewed ${unique()}`;
            await addProduct(shop, name);
            await item(shop, name).getByRole("button", { name: "Publish" }).click();
            await expect(item(shop, name)).toContainText("Published");
            const slug = sql(`select slug from public.products where name = '${name}'`);
            const id = sql(`select id from public.products where name = '${name}'`);
            const views = () => Number(sql(`select coalesce((select views from public.product_view_totals where product_id = '${id}'), 0)`));
            const visit = async (headers: Record<string, string>) => {
              const context = await browser.newContext({ extraHTTPHeaders: headers });
              const visitor = await context.newPage();
              const counted = visitor.waitForResponse((response) => response.url().includes(`/api/v1/products/${id}/view`));
              await visitor.goto(`/products/${slug}`);
              expect((await counted).status()).toBe(204);
              return { visitor, context };
            };
            const ip = () => `10.4.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

            // The seller looking at their own product does not count.
            const own = shop.waitForResponse((response) => response.url().includes(`/api/v1/products/${id}/view`));
            await shop.goto(`/products/${slug}`);
            await own;
            expect(views()).toBe(0);

            // A visitor counts once, however often they come back that day.
            const first = ip();
            const { visitor, context } = await visit({ "x-forwarded-for": first });
            expect(views()).toBe(1);
            const again = visitor.waitForResponse((response) => response.url().includes(`/api/v1/products/${id}/view`));
            await visitor.reload();
            await again;
            expect(views()).toBe(1);
            await context.close();

            // A second visitor counts, and a bot does not.
            await (await visit({ "x-forwarded-for": ip() })).context.close();
            expect(views()).toBe(2);
            expect((await request.post(`/api/v1/products/${id}/view`, { headers: { "user-agent": "Googlebot/2.1", "x-forwarded-for": ip() } })).status()).toBe(204);
            expect((await request.post(`/api/v1/products/not-an-id/view`)).status()).toBe(204);
            expect(views()).toBe(2);

            // The page shows the count once its cache catches up.
            const reader = await (await browser.newContext()).newPage();
            await expect(async () => {
              await reader.goto(`/products/${slug}`);
              await expect(reader.getByRole("main")).toContainText(/[23] views/, { timeout: 2000 });
            }).toPass({ timeout: 90000 });
          });

          test("Super Admin writes, schedules, publishes and takes down a blog post, with a real cover", async ({ page, request, browser }) => {
            test.setTimeout(180000);
            const owner = await confirmedAccount(page, request);
            makeSuperAdmin(owner);
            const title = `Field notes ${unique()}`;
            const crc = (buffer: Buffer) => {
              let c = ~0;
              for (const byte of buffer) {
                c ^= byte;
                for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
              }
              return ~c >>> 0;
            };
            const chunk = (type: string, data: Buffer) => {
              const head = Buffer.alloc(8);
              head.writeUInt32BE(data.length);
              head.write(type, 4);
              const tail = Buffer.alloc(4);
              tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])));
              return Buffer.concat([head, data, tail]);
            };
            const png = (width: number, height: number) => {
              const header = Buffer.alloc(13);
              header.writeUInt32BE(width, 0);
              header.writeUInt32BE(height, 4);
              header.set([8, 2, 0, 0, 0], 8);
              const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 120)]);
              return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))), chunk("IEND", Buffer.alloc(0))]);
            };

            await page.goto("/account");
            await openNavGroup(page, "Content");
            await page.getByRole("link", { name: "Blog", exact: true }).click();
            await expect(page).toHaveURL(/\/admin\/blog$/);
            await page.getByRole("button", { name: "New post" }).click();
            const editor = page.getByRole("region", { name: "New post" });
            await editor.getByRole("button", { name: "Save draft" }).click();
            await expect(editor.getByText("Enter a title.")).toBeVisible();
            await editor.getByLabel("Title", { exact: true }).fill(title);
            await editor.getByLabel("Summary").fill("A short summary.");
            // Typed in the Tiptap editor, with a heading, bold text and a link from its toolbar.
            const article = editor.getByRole("textbox", { name: "Article" });
            await article.click();
            await editor.getByRole("button", { name: "Heading", exact: true }).click();
            await page.keyboard.type("A heading");
            await page.keyboard.press("Enter");
            await page.keyboard.type("First paragraph <b>with tags</b>. ");
            await editor.getByRole("button", { name: "Bold" }).click();
            await page.keyboard.type("Strong words");
            await editor.getByRole("button", { name: "Bold" }).click();
            await page.keyboard.press("Enter");
            await page.keyboard.type("Visit Biqbaq");
            await page.keyboard.press("Shift+Home");
            await editor.getByRole("button", { name: "Add a link" }).click();
            await editor.getByLabel("Link address").fill("javascript:alert(1)");
            await editor.getByRole("button", { name: "Add link" }).click();
            await expect(editor.getByText("Enter a web address starting with https://, or an email address.")).toBeVisible();
            await editor.getByLabel("Link address").fill("https://biqbaq.com/about");
            await editor.getByRole("button", { name: "Add link" }).click();
            await editor.getByLabel("Category").selectOption("cargo");
            await editor.getByLabel("Tags").fill("Cargo, Lagos, cargo");
            await editor.getByRole("button", { name: "Save draft" }).click();
            const post = page.getByRole("region", { name: "Edit post" });
            await expect(post.getByText("Saved.")).toBeVisible();

            // Publishing waits for a cover, which goes through the real Cloudinary checks.
            await post.getByRole("button", { name: "Publish now" }).click();
            await expect(post.getByText("To publish, add a summary, an article, a category and a cover photo.")).toBeVisible();
            ignoreExpectedFailures(page); // The browser logs the refused publish as an error.
            await post.getByLabel("Choose a cover photo").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: png(1200, 675) });
            await expect(post.getByText("Cover photo saved.")).toBeVisible({ timeout: 30000 });
            const slug = sql(`select slug from public.blog_posts where title = '${title}'`);

            // A photo inside the article, with its description, through the same checks.
            await post.getByRole("textbox", { name: "Article" }).click();
            await page.keyboard.press("Control+End");
            await post.getByRole("button", { name: "Add a photo" }).click();
            await post.getByLabel("Describe the photo").fill("A loaded truck");
            await post.getByLabel("Choose the photo").setInputFiles({ name: "inside.png", mimeType: "image/png", buffer: png(800, 600) });
            await expect(post.getByRole("textbox", { name: "Article" }).locator("img")).toHaveAttribute("alt", "A loaded truck", { timeout: 30000 });
            await post.getByRole("button", { name: "Save changes" }).click();
            await expect(post.getByText("Saved.")).toBeVisible();
            expect(Number(sql(`select count(*) from public.media_assets m join public.blog_posts b on b.id = m.entity_id where m.entity_type = 'blog_post' and b.slug = '${slug}'`))).toBe(1);
            expect(sql(`select cover_url from public.blog_posts where slug = '${slug}'`)).toMatch(/^https:\/\/res\.cloudinary\.com\/.+\/biqbaq-local\/blog\//);

            // Scheduled for tomorrow, it stays hidden.
            const tomorrow = new Date(Date.now() + 86400000);
            const local = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            await post.getByLabel("Or publish at").fill(local);
            await post.getByRole("button", { name: "Schedule" }).click();
            await expect(post.getByText("Scheduled. It goes live at that time.")).toBeVisible();
            const reader = await (await browser.newContext()).newPage();
            await reader.goto(`/blog/${slug}`);
            await expect(reader.getByRole("heading", { name: "Product not found" }).or(reader.getByText("could not be found", { exact: false })).or(reader.getByRole("heading", { level: 1 }).filter({ hasNotText: title }))).toBeVisible();
            await expect(reader.getByRole("heading", { name: title })).toHaveCount(0);

            // Published now, it shows, with its text kept as text.
            await post.getByRole("button", { name: "Publish now" }).click();
            await expect(post.getByText("Published. It shows on the site within a minute.")).toBeVisible();
            await expect(async () => {
              await reader.goto(`/blog/${slug}`);
              await expect(reader.getByRole("heading", { name: title })).toBeVisible({ timeout: 2000 });
            }).toPass({ timeout: 90000 });
            await expect(reader.getByText("First paragraph <b>with tags</b>.")).toBeVisible();
            await expect(reader.getByRole("heading", { level: 2, name: "A heading" })).toBeVisible();
            await expect(reader.locator("article strong")).toHaveText("Strong words");
            await expect(reader.getByRole("link", { name: "Visit Biqbaq" })).toHaveAttribute("href", "https://biqbaq.com/about");
            await expect(reader.getByRole("link", { name: "Visit Biqbaq" })).toHaveAttribute("rel", "noopener noreferrer");
            await expect(reader.getByRole("img", { name: "A loaded truck" })).toBeVisible();
            await expect(reader.getByRole("list", { name: "Tags" })).toContainText("Lagos");
            expect(await reader.locator("article b").count()).toBe(0);
            await expect.poll(() => Number(sql(`select coalesce((select readers from public.blog_read_totals t join public.blog_posts b on b.id = t.post_id where b.slug = '${slug}'), 0)`))).toBe(1);

            // Comments: a visitor is asked to sign in, and a signed-in reader's comment shows straight away.
            const comments = reader.getByRole("region", { name: "Comments" });
            await expect(comments).toContainText("No comments yet.");
            await expect(comments).toContainText("to join the conversation.");
            const commenter = await newApplicant(browser, request);
            await commenter.page.goto(`/blog/${slug}`);
            const box = commenter.page.getByRole("region", { name: /^Comments/ });
            await box.getByRole("button", { name: "Post comment" }).click();
            await expect(box.getByText("Write something first.")).toBeVisible();
            await box.getByLabel("Your comment").fill("Useful, thank you <script>x</script>");
            await box.getByRole("button", { name: "Post comment" }).click();
            await expect(box.getByText("Useful, thank you <script>x</script>")).toBeVisible();
            await expect(box.getByRole("button", { name: "Delete my comment" })).toBeVisible();
            await reader.reload();
            await expect(reader.getByRole("region", { name: /^Comments/ })).toContainText("Useful, thank you");
            await expect(reader.getByRole("region", { name: /^Comments/ }).getByRole("button", { name: "Delete my comment" })).toHaveCount(0);

            // Super Admin hides it from the Blog screen, with a reason.
            await post.getByRole("button", { name: "Back to all posts" }).click();
            await page.getByRole("tab", { name: "Comments" }).click();
            const hide = page.getByRole("article", { name: `Comment on ${title}` });
            await hide.getByRole("button", { name: "Hide comment" }).click();
            await hide.getByLabel("Reason").fill("Off topic");
            await hide.getByRole("button", { name: "Confirm: Hide comment" }).click();
            // Real comments may exist too, so this checks that this one has left the list.
            await expect(hide).toHaveCount(0);
            await commenter.page.reload();
            await expect(commenter.page.getByRole("region", { name: /^Comments/ })).toContainText("No comments yet.");
            await page.getByRole("tab", { name: "Posts" }).click();
            await page.getByRole("article", { name: title }).getByRole("button", { name: "Edit" }).click();

            // Taken back to draft, it leaves, and its cover can then be removed from Cloudinary.
            await expect(post.getByRole("button", { name: "Remove cover photo" })).toHaveCount(0);
            await post.getByRole("button", { name: "Back to draft" }).click();
            await expect(post.getByText("Back to draft, and no longer on the site.")).toBeVisible();
            // Taking the photo out of the article deletes it from Cloudinary on the next save,
            // once it is a few minutes old. The test makes it old rather than waiting.
            await post.getByRole("textbox", { name: "Article" }).locator("img").click();
            await page.keyboard.press("Delete");
            sql(`update public.media_assets set created_at = now() - interval '1 hour' where entity_type = 'blog_post' and entity_id = (select id from public.blog_posts where slug = '${slug}')`);
            await post.getByRole("button", { name: "Save changes" }).click();
            await expect(post.getByText("Saved.")).toBeVisible();
            expect(Number(sql(`select count(*) from public.media_assets m join public.blog_posts b on b.id = m.entity_id where m.entity_type = 'blog_post' and b.slug = '${slug}'`))).toBe(0);
            await post.getByRole("button", { name: "Remove cover photo" }).click();
            await expect(post.getByText("Cover photo removed.")).toBeVisible();
            expect(sql(`select coalesce(cover_url, 'none') from public.blog_posts where slug = '${slug}'`)).toBe("none");
            await expect(async () => {
              await reader.goto(`/blog/${slug}`);
              await expect(reader.getByRole("heading", { name: title })).toHaveCount(0, { timeout: 2000 });
            }).toPass({ timeout: 90000 });
            (reader as unknown as { problems?: string[] }).problems = [];
          });

          test("Super Admin writes the About us page, which the footer links to once it is published", async ({ page, request, browser }) => {
            test.setTimeout(150000);
            const id = unique();
            const owner = await confirmedAccount(page, request);
            makeSuperAdmin(owner);
            // The local copy may have its own About us page: it is put back afterwards.
            const before = sql(`select coalesce((select row_to_json(a)::text from public.about_page a), '')`);
            sql(`delete from public.about_page`);
            const visitor = await browser.newContext();
            const home = await visitor.newPage();
            try {
              // Nothing on the site until it is published.
              await home.goto("/");
              await expect(home.getByRole("contentinfo").getByRole("link", { name: "About us" })).toHaveCount(0);
              expect((await home.goto("/about"))?.status()).toBe(404);

              await page.goto("/admin/about");
              await expect(page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "About us" })).toHaveAttribute("aria-current", "page");
              await expect(page.getByText("Not on the site yet")).toBeVisible({ timeout: 15000 });
              // The page's own photo is here; the text editor has no photo button.
              await expect(page.getByRole("region", { name: "About us photo" })).toContainText("Showing the site's original photo.");
              await expect(page.getByRole("toolbar").first().getByRole("button", { name: /photo/i })).toHaveCount(0);
              await page.getByRole("button", { name: "Publish" }).click();
              await expect(page.getByText("Write something in English before publishing.")).toBeVisible();
              ignoreExpectedFailures(page); // The browser logs the refusal as an error.

              const english = page.getByRole("textbox", { name: "About us, in English" });
              await english.click();
              await page.keyboard.type(`We connect Nigerians in Canada ${id}.`);
              await page.getByRole("button", { name: "Bold" }).first().click();
              await page.keyboard.type(" Shop local.");
              await page.getByRole("button", { name: "Publish" }).click();
              await expect(page.getByText("Saved. The page is on the site, linked from the footer.")).toBeVisible();
              await expect(page.getByText("On the site", { exact: true })).toBeVisible();

              // The footer links to it; the page has the photo at the top, then the write-up.
              await home.goto("/");
              const footerLink = home.getByRole("contentinfo").getByRole("link", { name: "About us" });
              await expect(footerLink).toBeVisible({ timeout: 15000 });
              await footerLink.click();
              await expect(home).toHaveURL(/\/about$/);
              await expect(home.getByRole("heading", { level: 1 })).toHaveText("About us");
              await expect(home.getByRole("article")).toContainText(`We connect Nigerians in Canada ${id}.`);
              await expect(home.getByRole("article").locator("strong")).toHaveText("Shop local.");
              const photoTop = (await home.getByRole("article").locator("img").first().boundingBox())!.y;
              expect(photoTop).toBeLessThan((await home.getByRole("heading", { level: 1 }).boundingBox())!.y);
              // French visitors read the English until a French version is written.
              await home.goto("/fr/about");
              await expect(home.getByRole("heading", { level: 1 })).toHaveText("À propos");
              await expect(home.getByRole("article")).toContainText(`We connect Nigerians in Canada ${id}.`);

              await page.getByRole("tab", { name: "French" }).click();
              await page.getByRole("textbox", { name: "About us, in French" }).click();
              await page.keyboard.type(`Nous rapprochons les Nigérians au Canada ${id}.`);
              await page.getByRole("button", { name: "Save changes" }).click();
              await expect(page.getByText("Saved. The page is on the site, linked from the footer.")).toBeVisible();
              await home.reload();
              await expect(home.getByRole("article")).toContainText(`Nous rapprochons les Nigérians au Canada ${id}.`);

              // Taken off the site again.
              await page.getByRole("button", { name: "Take it off the site" }).click();
              await expect(page.getByText("Saved. The page isn't on the site.")).toBeVisible();
              await home.context().clearCookies({ name: "NEXT_LOCALE" });
              expect((await home.goto("/about"))?.status()).toBe(404);
              expect(sql(`select count(*) from public.audit_logs where action = 'about.save' and actor_id = (select id from auth.users where email = '${owner}')`)).toBe("3");
            } finally {
              await visitor.close();
              sql(`delete from public.about_page`);
              if (before) sql(`insert into public.about_page select * from json_populate_record(null::public.about_page, '${before.replaceAll("'", "''")}'::json)`);
            }
          });

          test("Super Admin writes What customers say, and the quotes slide right to left on the front page", async ({ page, request, browser }) => {
            test.setTimeout(150000);
            const id = unique();
            const owner = await confirmedAccount(page, request);
            makeSuperAdmin(owner);
            try {
              await page.goto("/admin/testimonials");
              await expect(page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "What customers say" })).toHaveAttribute("aria-current", "page");
              const list = page.getByRole("region", { name: "Customer quotes" });
              await list.getByRole("button", { name: "Add a quote" }).click({ timeout: 15000 });
              let form = page.getByRole("form", { name: "New quote" });
              await form.getByRole("button", { name: "Save quote" }).click();
              await expect(form).toContainText("Write the quote");
              await form.getByLabel("What the customer said").fill(`Found my favourite spices ${id}`);
              await form.getByLabel("Customer's name").fill(`Ada ${id}`);
              await form.getByLabel("City (optional)").fill("Toronto");
              await form.getByRole("button", { name: "Save quote" }).click();
              await expect(list).toContainText("Quote added.");
              await list.getByRole("button", { name: "Add a quote" }).click();
              form = page.getByRole("form", { name: "New quote" });
              await form.getByLabel("What the customer said").fill(`Not ready ${id}`);
              await form.getByLabel("Customer's name").fill(`Bola ${id}`);
              await form.getByLabel("Show it on the front page").uncheck();
              await form.getByRole("button", { name: "Save quote" }).click();
              await expect(list.getByRole("article", { name: `Bola ${id}` })).toContainText("Hidden");

              // Only the published one shows.
              const visitor = await browser.newContext();
              const home = await visitor.newPage();
              await home.goto("/");
              const section = home.getByRole("region", { name: "What customers say" });
              await expect(section.getByRole("list", { name: "What customers say" })).toContainText(`Found my favourite spices ${id}`, { timeout: 15000 });
              await expect(section.getByRole("list", { name: "What customers say" })).toContainText("Toronto");
              await expect(section).not.toContainText(`Not ready ${id}`);
              // Up to three sit still, each shown once (the local copy may have its own quotes too).
              const others = Number(sql(`select count(*) from public.testimonials where published and name <> 'Ada ${id}'`));
              if (others < 3) {
                await expect(section.getByText(`Found my favourite spices ${id}`)).toHaveCount(1);
                await expect(section.locator(".testimonials-track")).toHaveCount(0);
                await expect(section.getByRole("button", { name: "Pause the quotes" })).toHaveCount(0);
              }

              // More than three slide from right to left.
              sql(`insert into public.testimonials (quote, name, city, published, sort_order) select 'Extra ' || g || ' ${id}', 'Extra ${id} ' || g, '', true, 100 + g from generate_series(1, 3) g`);
              await list.getByRole("article", { name: `Bola ${id}` }).getByRole("button", { name: "Publish" }).click();
              await expect(list).toContainText("Published. It shows on the front page now.");
              await home.reload();
              await expect(section.locator(".testimonials-track")).toHaveCount(1, { timeout: 15000 });
              await expect(section.getByRole("list", { name: "What customers say" }).getByRole("listitem")).toHaveCount(others + 5);
              // The row itself never stands still, so the browser is pointed at the frame around it.
              const frame = section.locator(".testimonials-marquee");
              const track = section.locator(".testimonials-track");
              await frame.scrollIntoViewIfNeeded();
              const offset = () => track.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m41);
              const first = await offset();
              await home.waitForTimeout(1200);
              expect(await offset()).toBeLessThan(first);
              // Pointing at it stops it, so it can be read; so does the pause button.
              await frame.hover();
              const held = await offset();
              await home.waitForTimeout(800);
              expect(await offset()).toBe(held);
              await home.mouse.move(0, 0);
              await section.getByRole("button", { name: "Pause the quotes" }).click();
              await home.mouse.move(0, 0);
              const paused = await offset();
              await home.waitForTimeout(800);
              expect(await offset()).toBe(paused);
              await expect(section.getByRole("button", { name: "Play the quotes" })).toHaveAttribute("aria-pressed", "true");
              // With reduced motion it never moves.
              await home.emulateMedia({ reducedMotion: "reduce" });
              expect(await track.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
              await visitor.close();

              // Edit, hide and delete.
              const ada = list.getByRole("article", { name: `Ada ${id}`, exact: true });
              await ada.getByRole("button", { name: "Edit" }).click();
              const edit = page.getByRole("form", { name: `Edit the quote from Ada ${id}` });
              await edit.getByLabel("City (optional)").fill("Ottawa");
              await edit.getByRole("button", { name: "Save quote" }).click();
              await expect(list).toContainText("Quote saved.");
              await expect(ada).toContainText("Ottawa");
              await ada.getByRole("button", { name: "Hide" }).click();
              await expect(ada).toContainText("Hidden");
              page.once("dialog", (dialog) => void dialog.accept());
              await list.getByRole("article", { name: `Bola ${id}` }).getByRole("button", { name: "Delete" }).click();
              await expect(list).toContainText("Quote deleted.");
              await expect(list.getByRole("article", { name: `Bola ${id}` })).toHaveCount(0);
              expect(sql(`select count(*) from public.audit_logs where target_type = 'testimonial' and target_id in (select id::text from public.testimonials where name = 'Ada ${id}')`)).toBe("3");
            } finally {
              sql(`delete from public.testimonials where name in ('Ada ${id}', 'Bola ${id}') or name like 'Extra ${id} %'`);
            }
          });

          test("Super Admin changes a front-page photo, describes it, and puts the original back", async ({ page, request }) => {
            test.setTimeout(240000);
            const owner = await confirmedAccount(page, request);
            makeSuperAdmin(owner);
            const png = (width: number, height: number) => {
              const crc = (buffer: Buffer) => {
                let c = ~0;
                for (const byte of buffer) {
                  c ^= byte;
                  for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
                }
                return ~c >>> 0;
              };
              const chunk = (type: string, data: Buffer) => {
                const head = Buffer.alloc(8);
                head.writeUInt32BE(data.length);
                head.write(type, 4);
                const tail = Buffer.alloc(4);
                tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])));
                return Buffer.concat([head, data, tail]);
              };
              const header = Buffer.alloc(13);
              header.writeUInt32BE(width, 0);
              header.writeUInt32BE(height, 4);
              header.set([8, 2, 0, 0, 0], 8);
              const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 120)]);
              return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))), chunk("IEND", Buffer.alloc(0))]);
            };
            // The Get started photo: no other test looks at it, so tests running alongside are unaffected.
            const before = sql(`select coalesce((select image_url from public.site_images where slot = 'get_started'), 'original')`);
            test.skip(before !== "original", "Super Admin has uploaded a Get started photo on this copy");
            try {
              await page.goto("/admin/site-images");
              await openNavGroup(page, "Content");
              await expect(page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "Site images" })).toHaveAttribute("aria-current", "page");
              const slot = page.getByRole("region", { name: "Get started on Biqbaq" });
              await expect(slot).toContainText("Showing the site's original photo.", { timeout: 15000 });
              await expect(slot.getByRole("button", { name: "Back to the original" })).toHaveCount(0);
              await expect(page.getByRole("region", { name: "Top section, photo 1" })).toContainText("Find groceries and other products in your city");
              // The five Shop by category cards have their own photos too.
              for (const name of ["Fashion", "Food & groceries", "Beauty", "Home", "Cargo cars"]) {
                await expect(page.getByRole("region", { name: `Shop by category: ${name}` })).toContainText("A square photo works best.");
              }

              await slot.getByLabel("Upload a photo").setInputFiles({ name: "start.png", mimeType: "image/png", buffer: png(1200, 900) });
              await expect(slot).toContainText("Photo saved. The front page shows it now.", { timeout: 60000 });
              await expect(slot).toContainText("Showing your photo.");
              const uploaded = sql(`select image_url from public.site_images where slot = 'get_started'`);
              expect(uploaded).toMatch(/^https:\/\/res\.cloudinary\.com\/.+\/site\/get_started\//);

              await slot.getByLabel("English").fill("A grey test picture");
              await slot.getByLabel("French").fill("Une image de test grise");
              await slot.getByRole("button", { name: "Save description" }).click();
              await expect(slot).toContainText("Description saved.");

              // The front page shows it straight away, with its description.
              const home = await page.context().newPage();
              await home.goto("/");
              const picture = home.getByRole("region", { name: "Get started on Biqbaq" }).getByRole("img", { name: "A grey test picture" });
              // The new photo can take a moment to replace the cached front page under load.
              await expect(async () => {
                await home.reload();
                await expect(picture).toBeVisible({ timeout: 5000 });
              }).toPass({ timeout: 30000 });
              expect(decodeURIComponent((await picture.getAttribute("src")) ?? "")).toContain("/site/get_started/");
              await home.goto("/fr");
              await expect(home.getByRole("img", { name: "Une image de test grise" })).toBeVisible({ timeout: 15000 });
              // Opening the French page remembers French; back to English for the rest.
              await page.context().clearCookies({ name: "NEXT_LOCALE" });

              // Back to the original: the upload is gone from the database (and Cloudinary).
              page.once("dialog", (dialog) => void dialog.accept());
              await slot.getByRole("button", { name: "Back to the original" }).click();
              await expect(slot).toContainText("The original photo is back.");
              expect(sql(`select count(*) from public.site_images where slot = 'get_started'`)).toBe("0");
              await home.goto("/");
              await expect(home.getByRole("img", { name: "A grey test picture" })).toHaveCount(0);
              await expect(home.getByRole("region", { name: "Get started on Biqbaq" }).locator("img").last()).toHaveAttribute("src", /toronto-professional/, { timeout: 15000 });
              await home.close();
            } finally {
              sql(`delete from public.site_images where slot = 'get_started'`);
            }
          });

          test("Super Admin creates, previews, turns on, edits and deletes an ad, with a real photo", async ({ page, request, browser }) => {
            test.setTimeout(150000);
            const owner = await confirmedAccount(page, request);
            makeSuperAdmin(owner);
            const title = `Season sale ${unique()}`;
            const png = (width: number, height: number) => {
              const crc = (buffer: Buffer) => {
                let c = ~0;
                for (const byte of buffer) {
                  c ^= byte;
                  for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
                }
                return ~c >>> 0;
              };
              const chunk = (type: string, data: Buffer) => {
                const head = Buffer.alloc(8);
                head.writeUInt32BE(data.length);
                head.write(type, 4);
                const tail = Buffer.alloc(4);
                tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])));
                return Buffer.concat([head, data, tail]);
              };
              const header = Buffer.alloc(13);
              header.writeUInt32BE(width, 0);
              header.writeUInt32BE(height, 4);
              header.set([8, 2, 0, 0, 0], 8);
              const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 90)]);
              return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))), chunk("IEND", Buffer.alloc(0))]);
            };

            await page.goto("/account");
            await openNavGroup(page, "Content");
            await page.getByRole("link", { name: "Ads", exact: true }).click();
            await expect(page).toHaveURL(/\/admin\/ads$/);
            await page.getByRole("button", { name: "New ad" }).click();
            const editor = page.getByRole("region", { name: "New ad" });
            await editor.getByLabel("Title").fill(title);
            await editor.getByLabel("Advertiser").fill("Maple Freight");
            await editor.getByLabel("Details on the ad's page").fill("Space available in cars going to Lagos.");
            await editor.getByLabel("Where the button goes").fill("javascript:alert(1)");
            await editor.getByRole("button", { name: "Create ad" }).click();
            await expect(editor.getByText("Enter a Biqbaq page such as /products, or an address starting with https://.")).toBeVisible();
            await editor.getByLabel("Where the button goes").fill("/cargo-cars");
            await editor.getByLabel("Priority").fill("1000");
            await editor.getByRole("button", { name: "Create ad" }).click();
            const ad = page.getByRole("region", { name: "Edit ad" });
            await expect(ad.getByText("Saved.")).toBeVisible();
            await expect(ad.getByRole("group", { name: "Preview" })).toContainText(title);

            // It cannot go on without a photo, which goes through the real Cloudinary checks.
            await ad.getByRole("button", { name: "Turn on" }).click();
            await expect(ad.getByText("Add a photo before turning it on.")).toBeVisible();
            ignoreExpectedFailures(page); // The browser logs the refusal as an error.
            await ad.getByLabel("Choose a photo").setInputFiles({ name: "ad.png", mimeType: "image/png", buffer: png(900, 600) });
            await expect(ad.getByText("Photo saved.")).toBeVisible({ timeout: 30000 });
            const slug = sql(`select slug from public.advertisements where title = '${title}'`);
            expect(sql(`select image_url from public.advertisements where slug = '${slug}'`)).toMatch(/^https:\/\/res\.cloudinary\.com\/.+\/biqbaq-local\/ads\//);
            await ad.getByRole("button", { name: "Turn on" }).click();
            await expect(ad.getByText("Turned on. It shows between its start and end.")).toBeVisible();

            // With the highest priority, it leads the Sponsored section and opens its own page.
            const visitor = await (await browser.newContext()).newPage();
            await expect(async () => {
              await visitor.goto("/");
              await expect(visitor.getByRole("region", { name: "Sponsored" }).getByRole("article").first()).toContainText(title, { timeout: 2000 });
            }).toPass({ timeout: 90000 });
            await visitor.getByRole("region", { name: "Sponsored" }).getByRole("link", { name: title }).click();
            await expect(visitor).toHaveURL(new RegExp(`/ads/${slug}$`));
            await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(title);
            await expect(visitor.getByRole("main")).toContainText("Space available in cars going to Lagos.");
            await expect(visitor.getByRole("link", { name: "Visit" }).first()).toHaveAttribute("href", "/cargo-cars");

            // Turned off, it leaves at once; then it is deleted, with its photo.
            await ad.getByRole("button", { name: "Turn off" }).click();
            await expect(ad.getByText("Turned off, and no longer shown.")).toBeVisible();
            await expect(async () => {
              await visitor.goto("/");
              await expect(visitor.getByRole("main")).not.toContainText(title, { timeout: 2000 });
            }).toPass({ timeout: 90000 });
            await ad.getByRole("button", { name: "Delete ad" }).click();
            await ad.getByRole("button", { name: "Yes, delete it" }).click();
            await expect(page.getByRole("button", { name: "New ad" })).toBeVisible();
            expect(sql(`select count(*) from public.advertisements where slug = '${slug}'`)).toBe("0");
          });

          test("only Super Admin and permitted Co-admins can open the ads screen", async ({ page, request }) => {
            const email = await confirmedAccount(page, request);
            await page.goto("/admin/ads");
            await expect(page.getByText("You don't have access")).toBeVisible();
            sql(`insert into public.user_roles (user_id, role_key) select id, 'co_admin' from auth.users where email = '${email}'`);
            sql(`insert into public.user_role_permissions (user_role_id, permission_key) select r.id, 'ads.manage' from public.user_roles r join auth.users u on u.id = r.user_id where u.email = '${email}' and r.role_key = 'co_admin'`);
            await page.reload();
            await expect(page.getByRole("button", { name: "New ad" })).toBeVisible();
          });

          test("only Super Admin and permitted Co-admins can open the blog screen", async ({ page, request }) => {
            const email = await confirmedAccount(page, request);
            await page.goto("/admin/blog");
            await expect(page.getByText("You don't have access")).toBeVisible();
            sql(`insert into public.user_roles (user_id, role_key) select id, 'admin' from auth.users where email = '${email}'`);
            sql(`insert into public.user_role_permissions (user_role_id, permission_key) select r.id, 'blog.manage' from public.user_roles r join auth.users u on u.id = r.user_id where u.email = '${email}' and r.role_key = 'admin'`);
            await page.reload();
            await expect(page.getByText("You don't have access")).toBeVisible();
            sql(`insert into public.user_roles (user_id, role_key) select id, 'co_admin' from auth.users where email = '${email}'`);
            sql(`insert into public.user_role_permissions (user_role_id, permission_key) select r.id, 'blog.manage' from public.user_roles r join auth.users u on u.id = r.user_id where u.email = '${email}' and r.role_key = 'co_admin'`);
            await page.reload();
            await expect(page.getByRole("button", { name: "New post" })).toBeVisible();
          });

          test("only Super Admin can open People and roles", async ({ page, request }) => {
            await confirmedAccount(page, request);
            await page.goto("/admin/people");
            await expect(page.getByText("You don't have access")).toBeVisible();
            await expect(page.getByRole("button", { name: "Give a role" })).toHaveCount(0);
          });

          test("a moderator suspends and restores a product and a shop, and the seller is told", async ({ page, browser, request }) => {
            test.setTimeout(150000);
            const { page: shop, email } = await approvedSeller(page, browser, request);
            const id = unique();
            const name = `Reported ${id}`;
            await addProduct(shop, name);
            await item(shop, name).getByRole("button", { name: "Publish" }).click();
            await expect(item(shop, name)).toContainText("Published");
            const visitor = await (await browser.newContext()).newPage();
            await visitor.goto(`/products?q=${encodeURIComponent(name)}`);
            await expect(visitor.getByRole("main")).toContainText(name);

            await page.goto("/account");
            await openNavGroup(page, "Content");
            await page.getByRole("link", { name: "Moderation", exact: true }).click();
            await expect(page).toHaveURL(/\/admin\/moderation$/);
            const products = page.getByRole("region", { name: "Products" });
            await products.getByLabel("Search by name").fill(name);
            await products.getByRole("button", { name: "Search" }).click();
            const card = page.getByRole("article", { name });
            await card.getByRole("button", { name: "Suspend product" }).click();
            await card.getByRole("button", { name: "Confirm: Suspend product" }).click();
            await expect(card.getByText("Enter a reason.")).toBeVisible();
            await card.getByLabel("Reason").fill(`Fake item ${id}`);
            await card.getByRole("button", { name: "Confirm: Suspend product" }).click();

            // Suspending takes it off the list of live products, and off the public site.
            await expect(products.getByText("Nothing matches this search.")).toBeVisible();
            await expect(async () => {
              await visitor.goto(`/products?q=${encodeURIComponent(name)}`);
              await expect(visitor.getByRole("main")).toContainText("No products", { timeout: 2000 });
            }).toPass({ timeout: 90000 });

            // The seller is told why, and sees it on My shop.
            expect(sql(`select payload -> 'data' ->> 'reason' from public.background_jobs b join auth.users u on u.id = b.user_id where u.email = '${email}' and b.payload ->> 'template' = 'product_suspended'`)).toBe(`Fake item ${id}`);
            await shop.reload();
            await expect(item(shop, name)).toContainText("Suspended by Biqbaq");
            await expect(item(shop, name).getByRole("button", { name: "Publish" })).toHaveCount(0);

            // Lifting it needs the seller to publish again.
            await products.getByLabel("Show").selectOption("suspended");
            await card.getByRole("button", { name: "Lift suspension" }).click();
            await card.getByLabel("Reason").fill("Checked, it is genuine");
            await card.getByRole("button", { name: "Confirm: Lift suspension" }).click();
            await expect(products.getByText("Nothing matches this search.")).toBeVisible();
            await shop.reload();
            await expect(item(shop, name)).toContainText("Not public");

            // A shop, found by its owner's email.
            const shops = page.getByRole("region", { name: "Shops" });
            await shops.getByLabel("Search by name").fill(email);
            await shops.getByRole("button", { name: "Search" }).click();
            const shopCard = shops.getByRole("article", { name: "Ada's Shop" }).filter({ hasText: email });
            await expect(shopCard).toBeVisible();
            await shopCard.getByRole("button", { name: "Suspend publishing" }).click();
            await shopCard.getByLabel("Reason").fill("Too many complaints");
            await shopCard.getByRole("button", { name: "Confirm: Suspend publishing" }).click();
            await expect(shopCard).toContainText("Publishing suspended");
            await shopCard.getByRole("button", { name: "Restore publishing" }).click();
            await shopCard.getByLabel("Reason").fill("Resolved");
            await shopCard.getByRole("button", { name: "Confirm: Restore publishing" }).click();
            await expect(shopCard.getByRole("button", { name: "Suspend publishing" })).toBeVisible();

            await shopCard.getByRole("button", { name: "Suspend shop" }).click();
            await shopCard.getByLabel("Reason").fill("Fraud report");
            await shopCard.getByRole("button", { name: "Confirm: Suspend shop" }).click();
            await expect(shopCard).toContainText("Suspended");
            await shop.reload();
            await expect(shop.getByText("Your shop is suspended", { exact: false })).toBeVisible();
            await shopCard.getByRole("button", { name: "Restore shop" }).click();
            await shopCard.getByLabel("Reason").fill("Cleared");
            await shopCard.getByRole("button", { name: "Confirm: Restore shop" }).click();
            await expect(shopCard.getByRole("button", { name: "Suspend shop" })).toBeVisible();

            // Everything is in the audit log.
            await page.goto("/admin/audit-log");
            await page.getByLabel("Search people, targets and reasons").fill("Fraud report");
            await page.getByRole("button", { name: "Search", exact: true }).click();
            await expect(page.getByRole("region", { name: "Audit log entries" })).toContainText("Suspended a shop");
          });

          test("someone with no moderation permission gets no moderation screen", async ({ page, request }) => {
            await confirmedAccount(page, request);
            await page.goto("/account");
            await expect(page.getByRole("heading").first()).toBeVisible();
            await expect(page.getByRole("link", { name: "Moderation", exact: true })).toHaveCount(0);
            await page.goto("/admin/moderation");
            await expect(page.getByText("You don't have access")).toBeVisible();
            await expect(page.getByText("Suspend product")).toHaveCount(0);
          });

          // Against Stripe's test mode, with real keys and `stripe listen` forwarding notices to
          // the app. Stripe's seller sign-up has a CAPTCHA, so the shop (STRIPE_LIVE_SHOP) is set
          // up with Stripe by hand first. Run on purpose: STRIPE_LIVE=1 npx playwright test -g "live Stripe".
          test("live Stripe: a buyer pays by test card plus Biqbaq's service fee, and Stripe's notice marks the order paid", async ({ browser, request }) => {
            test.skip(!process.env.STRIPE_LIVE, "Runs only with STRIPE_LIVE=1, Stripe test keys and stripe listen");
            test.setTimeout(180000);
            const shots = process.env.SHOTS ?? "test-results";
            const shopSlug = process.env.STRIPE_LIVE_SHOP ?? "albert";
            const sellerId = sql(`select id from public.sellers where slug = '${shopSlug}'`);
            expect(sql(`select status from public.payment_accounts where seller_id = '${sellerId}'`)).toBe("enabled");
            const product = sql(`select slug || '|' || id || '|' || price_minor from public.products where seller_id = '${sellerId}' and status = 'published' and deleted_at is null order by created_at limit 1`);
            const [slug, , price] = product.split("|");

            const buyer = await newApplicant(browser, request);
            await buyer.page.goto(`/products/${slug}`);
            await buyer.page.getByLabel("Quantity").selectOption("2");
            await buyer.page.getByRole("button", { name: "Buy now" }).click({ timeout: 15000 });
            await buyer.page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 });
            const checkout = buyer.page;
            await checkout.waitForLoadState("networkidle").catch(() => {});
            // The product, and Biqbaq's service fee as a line of its own that the buyer pays.
            const fee = Number(sql(`select value #>> '{}' from public.platform_settings where key = 'payments.application_fee_minor'`));
            const charged = Number(price) * 2 + fee;
            await expect(checkout.getByText(`CA$${(charged / 100).toFixed(2)}`).first()).toBeVisible({ timeout: 30000 });
            if (fee > 0) await expect(checkout.getByText("Biqbaq service fee")).toBeVisible();

            // Shipping address in Canada, and Stripe's test card.
            await checkout.getByText("Enter address manually").click().catch(() => {});
            await checkout.locator('input[name="shippingName"]').fill("Bola Buyer");
            await checkout.locator('input[name="shippingAddressLine1"]').fill("12 King St W");
            await checkout.locator('input[name="shippingLocality"]').fill("Toronto");
            await checkout.locator('select[name="shippingAdministrativeArea"]').selectOption("ON");
            await checkout.locator('input[name="shippingPostalCode"]').fill("M5H 1A1");
            await checkout.locator('input[name="phoneNumber"]').fill("4165550100");
            // Card is one of several ways to pay (Klarna and Affirm too); its row opens the card form.
            // Stripe lays a clear button over the row, which Playwright counts as hidden.
            await checkout.getByTestId("card-accordion-item-button").dispatchEvent("click");
            await checkout.locator('input[name="cardNumber"]').fill("4242424242424242");
            await checkout.locator('input[name="cardExpiry"]').fill("12 / 34");
            await checkout.locator('input[name="cardCvc"]').fill("123");
            const billingName = checkout.locator('input[name="billingName"]');
            if (await billingName.isVisible().catch(() => false)) await billingName.fill("Bola Buyer");
            const save = checkout.locator('input[name="enableStripePass"]');
            if (await save.isChecked().catch(() => false)) await save.uncheck();
            await checkout.screenshot({ path: `${shots}/checkout-1.png`, fullPage: true });
            await checkout.getByTestId("hosted-payment-submit-button").click();

            // Back on Biqbaq, and Stripe's notice marks the order paid.
            await checkout.waitForURL(/\/account\/orders\?placed=BQ-\d+/, { timeout: 60000 });
            const number = new URL(checkout.url()).searchParams.get("placed")!;
            await expect.poll(() => sql(`select status from public.orders where number = '${number}'`), { timeout: 60000 }).toBe("paid");
            const order = sql(`select total_minor || '|' || application_fee_minor || '|' || provider_payment_id || '|' || quantity || '|' || (shipping_address ->> 'city') || '|' || subtotal_minor from public.orders where number = '${number}'`).split("|");
            expect(order[0]).toBe(String(charged));
            expect(order[5]).toBe(String(Number(price) * 2));
            expect(order[1]).toBe(String(fee));
            expect(order[3]).toBe("2");
            expect(order[4]).toBe("Toronto");
            await checkout.reload();
            await expect(checkout.getByRole("main")).toContainText(number, { timeout: 15000 });

            // On Stripe's side: paid on the seller's account, with Biqbaq's service fee.
            const account = sql(`select provider_account_id from public.payment_accounts where seller_id = '${sellerId}'`);
            const stripe = async (method: string, path: string, body?: Record<string, string>) => {
              const response = await fetch(`https://api.stripe.com${path}`, {
                method,
                headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Stripe-Account": account, "Content-Type": "application/x-www-form-urlencoded" },
                body: body ? new URLSearchParams(body).toString() : undefined,
              });
              return (await response.json()) as Record<string, unknown>;
            };
            const intent = await stripe("GET", `/v1/payment_intents/${order[2]}?expand[]=latest_charge`);
            expect(intent.status).toBe("succeeded");
            expect(intent.amount).toBe(charged);
            expect(intent.currency).toBe("cad");
            expect(intent.application_fee_amount).toBe(fee > 0 ? fee : null);
            expect((intent.metadata as Record<string, string>).biqbaq_order).toBeTruthy();

            // A part refund, as the seller's refund makes it; Biqbaq keeps its fee.
            const refund = await stripe("POST", "/v1/refunds", { payment_intent: order[2], amount: "500", refund_application_fee: "false" });
            expect(refund.status).toBe("succeeded");
            await expect.poll(() => sql(`select refunded_minor from public.orders where number = '${number}'`), { timeout: 60000 }).toBe("500");
          });

          test("online payments: off until Super Admin turns them on, then Buy now, orders and delivery", async ({ page, browser, request }) => {
            test.setTimeout(150000);
            const seller = await approvedSeller(page, browser, request);
            const shop = seller.page;
            const name = `Payable ${unique()}`;
            await addProduct(shop, name);
            await item(shop, name).getByRole("button", { name: "Publish" }).click();
            await expect(item(shop, name)).toContainText("Published");
            const productId = sql(`select id from public.products where name = '${name}'`);
            const slug = sql(`select slug from public.products where id = '${productId}'`);
            const sellerId = sql(`select seller_id from public.products where id = '${productId}'`);
            const shopSlug = sql(`select slug from public.sellers where id = '${sellerId}'`);

            // Off to begin with (§13.1).
            await shop.goto("/account/shop/settings");
            const payments = shop.getByRole("region", { name: "Online payments" });
            await expect(payments).toContainText("Online payments are off for this shop.", { timeout: 15000 });
            await expect(payments.getByRole("button", { name: "Set up payments with Stripe" })).toHaveCount(0);

            // Stripe's approval stands in here; the real account is set up with Stripe in test mode.
            sql(`insert into public.payment_accounts (seller_id, provider_account_id, status, charges_enabled, payouts_enabled) values ('${sellerId}', 'acct_e2e_${unique()}', 'verification_pending', true, true)`);
            await page.goto("/admin/payments");
            const shops = page.getByRole("region", { name: "Shops" });
            await shops.getByLabel("Search shops").fill(shopSlug);
            await shops.getByRole("button", { name: "Search", exact: true }).click();
            const row = page.getByRole("article").filter({ has: page.getByText(`/sellers/${shopSlug}`, { exact: true }) });
            await row.getByRole("button", { name: "Turn on" }).click({ timeout: 15000 });
            await expect(row.getByRole("button", { name: "Turn off" })).toBeVisible();
            // The shop takes payments only with Stripe's confirmation, recorded by the server.
            sql(`update public.payment_accounts set status = 'enabled' where seller_id = '${sellerId}'`);
            await row.getByRole("button", { name: "Turn off" }).click();
            await row.getByRole("button", { name: "Turn on" }).click();
            await expect(row).toContainText("Taking payments", { timeout: 15000 });

            await shop.reload();
            await expect(payments).toContainText("Taking payments", { timeout: 15000 });
            await expect(payments).toContainText("Buyers pay Biqbaq's $1.00 service fee on top of your price");

            // A buyer sees Buy now, and goes to Stripe's checkout (stood in for here).
            const buyer = await newApplicant(browser, request);
            const asked: unknown[] = [];
            await buyer.page.route("**/api/v1/checkout", async (route) => {
              asked.push(route.request().postDataJSON());
              await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: "/account/orders?placed=BQ-TEST" }) });
            });
            await buyer.page.goto(`/products/${slug}`);
            await expect(buyer.page.getByText("Plus Biqbaq's $1.00 service fee per order")).toBeVisible({ timeout: 15000 });
            await buyer.page.getByLabel("Quantity").selectOption("3");
            await buyer.page.getByRole("button", { name: "Buy now" }).click({ timeout: 15000 });
            await expect(buyer.page).toHaveURL(/\/account\/orders\?placed=BQ-TEST$/);
            expect(asked).toEqual([{ product: productId, quantity: 3, locale: "en" }]);
            await expect(buyer.page.getByText("Order BQ-TEST is being confirmed with Stripe")).toBeVisible();

            // The seller cannot buy their own product (checked by the database).
            await shop.goto(`/products/${slug}`);
            await shop.getByRole("button", { name: "Buy now" }).click({ timeout: 15000 });
            await expect(shop.getByText("You can't buy from your own shop.")).toBeVisible({ timeout: 15000 });

            // A paid order, as Stripe's notice records it.
            const buyerId = sql(`select id from auth.users where email = '${buyer.email}'`);
            sql(`insert into public.orders (buyer_id, seller_id, product_id, product_name, unit_price_minor, quantity, subtotal_minor, total_minor, application_fee_minor, status, paid_at, provider_payment_id, buyer_email, shipping_name, shipping_phone, shipping_address)
                 values ('${buyerId}', '${sellerId}', '${productId}', '${name}', 1250, 3, 3750, 3850, 100, 'paid', now(), 'pi_e2e', '${buyer.email}', 'Bola Buyer', '416-555-0100', '{"line1": "12 King St W", "city": "Toronto", "state": "ON", "postal_code": "M5H 1A1", "country": "CA"}')`);
            await shop.goto("/account/shop/orders");
            const order = shop.getByRole("article").filter({ hasText: name });
            await expect(order).toContainText("To deliver", { timeout: 15000 });
            await expect(order).toContainText("Bola Buyer");
            await expect(order).toContainText("12 King St W");
            // The seller sees their sale; the buyer paid it plus the service fee.
            await expect(order).toContainText("$37.50");
            await order.getByRole("button", { name: "Refund" }).click();
            // Up to the product price: the service fee is not refunded.
            await expect(order.getByLabel(/Amount to refund/)).toHaveValue("37.50");
            await order.getByLabel(/Amount to refund/).fill("38");
            await order.getByRole("button", { name: "Refund" }).click();
            await expect(order).toContainText("Enter an amount up to what's left to refund.");
            await expect(order).toContainText("The buyer's service fee isn't refunded.");
            await order.getByRole("button", { name: "Cancel" }).click();
            await order.getByRole("button", { name: "Mark delivered" }).click();
            // It moves from "To deliver" to "Delivered".
            await expect(order).toHaveCount(0);
            await shop.getByRole("tab", { name: "Delivered" }).click();
            await expect(order).toContainText("Delivered");

            await buyer.page.goto("/account/orders");
            await expect(buyer.page.getByRole("list", { name: "Your orders" })).toContainText(name, { timeout: 15000 });
            await expect(buyer.page.getByRole("list", { name: "Your orders" })).toContainText("Delivered");
            await expect(buyer.page.getByRole("list", { name: "Your orders" })).toContainText("$38.50");
            await expect(buyer.page.getByRole("list", { name: "Your orders" })).toContainText("incl. $1.00 service fee");

            // Super Admin sets the service fee in dollars, with a reason, and product pages show it.
            const fee = page.getByRole("region", { name: "Service fee" });
            await expect(fee).toContainText("Now: $1.00.", { timeout: 15000 });
            try {
              await fee.getByLabel("Fee (CAD)").fill("2.50");
              await fee.getByRole("button", { name: "Save fee" }).click();
              await expect(fee).toContainText("Give a reason for the change.");
              await fee.getByLabel("Fee (CAD)").fill("101");
              await fee.getByLabel("Reason for the change").fill("Testing the fee");
              await fee.getByRole("button", { name: "Save fee" }).click();
              await expect(fee).toContainText("Enter an amount from $0.00 to $100.00.");
              await fee.getByLabel("Fee (CAD)").fill("2.50");
              await fee.getByRole("button", { name: "Save fee" }).click();
              await expect(fee).toContainText("Saved. New checkouts add $2.50.");
              expect(sql(`select value #>> '{}' from public.platform_settings where key = 'payments.application_fee_minor'`)).toBe("250");
              await buyer.page.goto(`/products/${slug}`);
              await expect(buyer.page.getByText("Plus Biqbaq's $2.50 service fee per order")).toBeVisible({ timeout: 15000 });
            } finally {
              // Other tests and the local copy expect the default CA$1.
              sql(`update public.platform_settings set value = '100' where key = 'payments.application_fee_minor'`);
            }

            // Turning payments off removes Buy now at once.
            await row.getByRole("button", { name: "Turn off" }).click();
            await expect(row).toContainText("Paused by Biqbaq");
            await buyer.page.goto(`/products/${slug}`);
            await expect(buyer.page.getByRole("heading", { level: 1 })).toHaveText(name);
            await expect(buyer.page.getByRole("button", { name: "Buy now" })).toHaveCount(0);
            await buyer.context.close();
          });

          test("the top-bar search finds the seller's own things and goes to them", async ({ page, browser, request }) => {
            test.setTimeout(120000);
            const { page: shop } = await approvedSeller(page, browser, request);
            const name = `Findable ${unique()}`;
            await addProduct(shop, name);
            await shop.goto("/account");
            const search = shop.getByRole("combobox", { name: "Search your things" });
            await search.fill("F");
            await expect(shop.getByRole("listbox", { name: "Search results" })).toBeHidden();
            await search.fill(name.slice(0, 14));
            const results = shop.getByRole("listbox", { name: "Search results" });
            await expect(results.getByRole("group", { name: "Products" })).toContainText(name, { timeout: 15000 });
            await expect(results).toContainText("Draft");
            // Another shop's products are not found (the database decides).
            await search.fill("Ankara Tote Bag");
            await expect(results).toContainText("Nothing found", { timeout: 15000 });
            await search.fill(name);
            await expect(results.getByRole("option", { name: new RegExp(name) })).toBeVisible({ timeout: 15000 });
            await search.press("ArrowDown");
            await search.press("Enter");
            await expect(shop).toHaveURL(/\/account\/shop\/products#product-/);
            await expect(item(shop, name)).toBeInViewport({ timeout: 15000 });
          });

          test("the sign-up pop-up: Super Admin words it, visitors see it fade in after 10 seconds and sign up", async ({ page, browser, request }) => {
            test.setTimeout(120000);
            const id = unique();
            const owner = await confirmedAccount(page, request);
            makeSuperAdmin(owner);
            await page.goto("/admin/email-lists");
            const settings = page.getByRole("region", { name: "Sign-up pop-up" });
            const before = sql(`select string_agg(key || '=' || value::text, chr(10)) from public.platform_settings where key in ('subscribe_popup.message_en', 'subscribe_popup.notify_email')`);
            try {
              const english = settings.getByRole("group", { name: "English" });
              await expect(english.getByLabel("Message")).not.toHaveValue("", { timeout: 15000 });
              await english.getByLabel("Message").fill(`Deals ${id}`);
              await settings.getByRole("button", { name: "Save pop-up" }).click();
              await expect(settings).toContainText("Give a reason for the change.");
              await settings.getByLabel("Send sign-ups to").fill("not-an-email");
              await settings.getByLabel("Reason for the change").fill("Testing");
              await settings.getByRole("button", { name: "Save pop-up" }).click();
              await expect(settings).toContainText("Enter a valid email address to send sign-ups to.");
              ignoreExpectedFailures(page);
              await settings.getByLabel("Send sign-ups to").fill("Owner-Inbox@Example.com");
              await settings.getByRole("button", { name: "Save pop-up" }).click();
              await expect(settings).toContainText("Saved.");
              expect(sql(`select value #>> '{}' from public.platform_settings where key = 'subscribe_popup.notify_email'`)).toBe("owner-inbox@example.com");

              // A first-time visitor, with nothing remembered: nothing at first, then the pop-up.
              const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
              const visitor = await context.newPage();
              await visitor.clock.install();
              await visitor.goto("/");
              const popup = visitor.getByRole("dialog", { name: `Deals ${id}` });
              await expect(popup).toHaveCount(0);
              await visitor.clock.fastForward("00:09");
              await visitor.waitForTimeout(500);
              await expect(popup).toHaveCount(0);
              await visitor.clock.fastForward("00:02");
              await expect(popup).toBeVisible({ timeout: 15000 });
              await popup.getByLabel("Email address").fill("nope");
              await popup.getByRole("button", { name: "Subscribe" }).click();
              await expect(popup).toContainText("Enter a valid email address.");
              // Every test signs up from the same connection, so its hourly limit starts afresh.
              sql(`delete from public.rate_limit_counters where bucket like 'subscribe_popup:%'`);
              const email = newEmail("popup");
              await popup.getByLabel("Email address").fill(email);
              await popup.getByRole("button", { name: "Subscribe" }).click();
              await expect(popup).toContainText("Thank you for subscribing!");
              // FormSubmit only (test addresses are not sent): Biqbaq keeps no copy and sends nothing.
              expect(sql(`select count(*) from public.list_subscribers where email = '${email}'`)).toBe("0");
              expect(sql(`select count(*) from public.background_jobs where payload ->> 'to' = '${email}'`)).toBe("0");
              await popup.getByRole("button", { name: "Close" }).first().click();
              await expect(popup).toBeHidden();
              // Signed up, so never again in this browser.
              await visitor.reload();
              await visitor.clock.fastForward("00:11");
              await visitor.waitForTimeout(1000);
              await expect(visitor.getByRole("dialog")).toHaveCount(0);
              await context.close();

              // Never on the sign-in pages; closing it keeps it away.
              const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
              const second = await other.newPage();
              await second.clock.install();
              await second.goto("/sign-in");
              await second.clock.fastForward("00:11");
              await second.waitForTimeout(1000);
              await expect(second.getByRole("dialog")).toHaveCount(0);
              await second.goto("/blog");
              await second.clock.fastForward("00:11");
              await expect(second.getByRole("dialog", { name: `Deals ${id}` })).toBeVisible({ timeout: 15000 });
              await second.keyboard.press("Escape");
              await expect(second.getByRole("dialog")).toBeHidden();
              // The browser notes the close a moment after the box goes.
              await expect.poll(() => second.evaluate(() => localStorage.getItem("biqbaq.subscribePopup"))).toContain("closedAt");
              await second.reload();
              await second.clock.fastForward("00:11");
              await second.waitForTimeout(1000);
              await expect(second.getByRole("dialog")).toHaveCount(0);
              await other.close();
            } finally {
              // The local copy keeps the owner's own wording and address.
              for (const line of before.split("\n")) {
                const [key, ...value] = line.split("=");
                sql(`update public.platform_settings set value = '${value.join("=").replaceAll("'", "''")}'::jsonb where key = '${key}'`);
              }
            }
          });

          test("long lists come a page at a time, and a search result opens the page its item is on", async ({ page, browser, request }) => {
            test.setTimeout(120000);
            const { page: shop } = await approvedSeller(page, browser, request);
            const name = `Oldest ${unique()}`;
            await addProduct(shop, name);
            const productId = sql(`select id from public.products where name = '${name}'`);
            // 21 newer products, so the first one is on page 2 (20 to a page).
            sql(`insert into public.products (seller_id, slug, name, description, category_id, price_minor, currency, status, availability, created_at)
                 select seller_id, slug || '-' || g, 'Newer product ' || g, description, category_id, price_minor, currency, 'draft', availability, now() + g * interval '1 second'
                 from public.products, generate_series(1, 21) g where id = '${productId}'`);

            await shop.goto("/account/shop/products");
            const pages = shop.getByRole("navigation", { name: "Product pages" });
            await expect(pages).toContainText("Page 1 of 2", { timeout: 15000 });
            await expect(shop.locator('article[id^="product-"]')).toHaveCount(20);
            await expect(item(shop, name)).toHaveCount(0);
            await pages.getByRole("button", { name: "Next" }).click();
            await expect(pages).toContainText("Page 2 of 2");
            await expect(shop.locator('article[id^="product-"]')).toHaveCount(2);
            await expect(item(shop, name)).toBeVisible();
            await expect(pages.getByRole("button", { name: "Next" })).toBeDisabled();
            // The overview counts every product, not just one page.
            await shop.goto("/account/shop");
            await expect(shop.getByRole("main")).toContainText("22 products", { timeout: 15000 });

            // A search result for the oldest product finds it on page 2.
            const search = shop.getByRole("combobox", { name: "Search your things" });
            await search.fill(name);
            await expect(shop.getByRole("listbox", { name: "Search results" }).getByRole("option", { name: new RegExp(`^${name}`) })).toBeVisible({ timeout: 15000 });
            await shop.getByRole("listbox", { name: "Search results" }).getByRole("option", { name: new RegExp(`^${name}`) }).click();
            await expect(shop).toHaveURL(/\/account\/shop\/products#product-/);
            await expect(item(shop, name)).toBeInViewport({ timeout: 15000 });
            await expect(shop.getByRole("navigation", { name: "Product pages" })).toContainText("Page 2 of 2");
          });

          test("a seller edits their shop details, and only the public ones show", async ({ page, browser, request }) => {
            test.setTimeout(120000);
            const { page: shop } = await approvedSeller(page, browser, request);
            const id = unique();
            await expect(shop.getByRole("region", { name: "Ada's Shop" })).toBeVisible();
            const shopLink = await shop.getByRole("link", { name: "View public page" }).getAttribute("href");

            // Shop details are in Shop settings (Q-56).
            await shop.goto("/account/shop/settings");
            const details = shop.getByRole("region", { name: "Shop details" });
            await details.getByRole("button", { name: "Edit shop details" }).click();
            await details.getByLabel("Shop name").fill("   ");
            await details.getByRole("button", { name: "Save" }).click();
            await expect(details.getByText("This is required.")).toBeVisible();

            await details.getByLabel("Shop name").fill(`Renamed ${id}`);
            await details.getByLabel("City").fill("Halifax");
            await details.getByLabel("About your shop").fill(`Public words ${id}`);
            await details.getByLabel("Contact information").fill(`PRIVATE-${id}`);
            await details.getByRole("button", { name: "Save" }).click();
            await expect(details.getByText("Your shop details were saved.")).toBeVisible();
            await shop.goto("/account/shop");
            await expect(shop.getByRole("heading", { name: `Renamed ${id}` })).toBeVisible({ timeout: 15000 });

            // It shows publicly at the same address, without the private details. This is usually
            // immediate, but a page being cached at that moment can lag by about a minute.
            const visitor = await (await browser.newContext()).newPage();
            await expect(async () => {
              await visitor.goto(shopLink!);
              await expect(visitor.getByRole("main")).toContainText(`Renamed ${id}`, { timeout: 2000 });
            }).toPass({ timeout: 90000 });
            await expect(visitor.getByRole("main")).toContainText("Halifax");
            await expect(visitor.getByRole("main")).toContainText(`Public words ${id}`);
            expect(await visitor.content()).not.toContain(`PRIVATE-${id}`);

            // The private details come back for the owner, after a reload.
            await shop.goto("/account/shop/settings");
            await shop.getByRole("region", { name: "Shop details" }).getByRole("button", { name: "Edit shop details" }).click();
            await expect(shop.getByLabel("Contact information")).toHaveValue(`PRIVATE-${id}`);
          });

          test("a seller's first two products go live, and the limit holds through deleting", async ({ page, browser, request }) => {
            test.setTimeout(120000);
            const { page: shop, email } = await approvedSeller(page, browser, request);
            const id = unique();
            const [first, second, third] = [`First ${id}`, `Second ${id}`, `Third ${id}`];
            await expect(shop.getByRole("region", { name: "Ada's Shop" })).toContainText("2 publishing places left of 2");

            // A draft is private.
            await addProduct(shop, first);
            const visitor = await (await browser.newContext()).newPage();
            await visitor.goto(`/products?q=${encodeURIComponent(first)}`);
            await expect(visitor.getByRole("main")).toContainText("No products");

            // Publishing puts it on the public site straight away, with the seller's city.
            await item(shop, first).getByRole("button", { name: "Publish" }).click();
            await expect(item(shop, first)).toContainText("Published");
            await expect(shop.getByRole("region", { name: "Ada's Shop" })).toContainText("1 publishing place left of 2");
            await item(shop, first).getByRole("link", { name: "View" }).click();
            await expect(shop.getByRole("heading", { level: 1 })).toHaveText(first);
            await expect(shop.getByRole("main")).toContainText("Toronto");
            await expect(shop.getByRole("main")).toContainText("Unverified");
            await expect(shop.getByRole("main")).toContainText("$12.50");
            await shop.goto("/account/shop");

            await addProduct(shop, second);
            await item(shop, second).getByRole("button", { name: "Publish" }).click();
            await expect(item(shop, second)).toContainText("Published");
            await expect(shop.getByRole("region", { name: "Ada's Shop" })).toContainText("No publishing places left of 2");

            // The third is refused, with an explanation.
            await addProduct(shop, third);
            await item(shop, third).getByRole("button", { name: "Publish" }).click();
            await expect(item(shop, third)).toContainText("You've used all your publishing places");
            await expect(item(shop, third)).toContainText("Draft");

            // Deleting does not give a place back.
            await item(shop, first).getByRole("button", { name: "Delete" }).click();
            await item(shop, first).getByRole("button", { name: "Yes, delete it" }).click();
            await expect(item(shop, first)).toHaveCount(0);
            await item(shop, third).getByRole("button", { name: "Publish" }).click();
            await expect(item(shop, third)).toContainText("You've used all your publishing places");
            await visitor.goto(`/products?q=${encodeURIComponent(first)}`);
            await expect(visitor.getByRole("main")).toContainText("No products");

            // Unpublishing and republishing costs nothing.
            await item(shop, second).getByRole("button", { name: "Unpublish" }).click();
            await expect(item(shop, second)).toContainText("Not public");
            await item(shop, second).getByRole("button", { name: "Publish" }).click();
            await expect(item(shop, second)).toContainText("Published");

            // Editing a published product shows publicly, and is logged.
            const renamed = `Renamed ${id}`;
            await item(shop, second).getByRole("button", { name: "Edit" }).click();
            await item(shop, second).getByLabel("Product name").fill(renamed);
            await item(shop, second).getByRole("button", { name: "Save" }).click();
            await expect(item(shop, renamed)).toContainText("Published");
            await visitor.goto(`/products?q=${encodeURIComponent(renamed)}`);
            await expect(visitor.getByRole("link", { name: renamed }).first()).toBeVisible();
            expect(sql(`select count(*) from public.audit_logs a join auth.users u on u.id = a.actor_id where a.action = 'product.edit' and u.email = '${email}' and a.metadata ->> 'old_name' = '${second}'`)).toBe("1");

            // Leaves the shared catalogue as it was for later runs.
            sql(`update public.products set status = 'archived', deleted_at = now() where name like '% ${id}'`);
          });

          test("an incomplete draft saves, but cannot be published, and bad prices are refused", async ({ page, browser, request }) => {
            test.setTimeout(90000);
            const { page: shop } = await approvedSeller(page, browser, request);
            await shop.goto("/account/shop/products");
            await shop.getByRole("button", { name: "Add a product" }).click({ timeout: 15000 });
            const form = shop.getByRole("form", { name: "New product" });
            await form.getByRole("button", { name: "Save" }).click();
            await expect(form).toContainText("This is required.");
            await form.getByLabel("Product name").fill("Half done");
            await form.getByLabel("Price (CAD)").fill("twelve");
            await form.getByRole("button", { name: "Save" }).click();
            await expect(form).toContainText("Enter a price such as 12.50.");
            await form.getByRole("button", { name: "Cancel" }).click();

            await addProduct(shop, "Half done", false);
            await item(shop, "Half done").getByRole("button", { name: "Publish" }).click();
            await expect(item(shop, "Half done")).toContainText("Add a description and a category before publishing.");
            await expect(shop.getByRole("region", { name: "Ada's Shop" })).toContainText("2 publishing places left of 2");
          });

          test.describe("verification", () => {
            const review = "/admin/verification";
            const find = async (page: import("@playwright/test").Page, filter: string, email: string) => {
              await page.goto(review);
              await page.getByRole("button", { name: filter, exact: true }).click();
              await page.getByLabel("Search", { exact: true }).fill(email);
              await page.getByRole("button", { name: "Search", exact: true }).click();
              const card = page.getByRole("article").filter({ hasText: email });
              await expect(card).toBeVisible({ timeout: 15000 });
              return card;
            };
            const verification = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "Verification" });

            test("request, rejection, approval, then suspending and restoring: the full journey", async ({ page, browser, request }) => {
              test.setTimeout(150000);
              const { page: shop, email } = await approvedSeller(page, browser, request);
              const id = unique();
              await expect(verification(shop)).toContainText("Not verified");
              await expect(shop.getByText("Verified shops can publish without a limit")).toBeVisible();

              // A request needs a note.
              await shop.getByRole("button", { name: "Request verification" }).click();
              await shop.getByRole("button", { name: "Send request" }).click();
              await expect(verification(shop)).toContainText("Tell us how we can confirm who you are.");
              await shop.getByLabel("How can we confirm who you are?").fill("My store is on Queen Street");
              await shop.getByRole("button", { name: "Send request" }).click();
              await expect(verification(shop)).toContainText("Waiting for review");
              await expect(shop.getByRole("button", { name: "Request verification" })).toHaveCount(0);
              await expect(shop.getByRole("region", { name: "Ada's Shop" })).toContainText("2 publishing places left of 2");

              // Super Admin reaches the screen from their account.
              await page.goto("/account");
              await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: /^Seller verification/ }).click({ timeout: 15000 });
              await expect(page).toHaveURL(/\/admin\/verification$/);
              let card = await find(page, "Waiting for review", email);
              await expect(card).toContainText("My store is on Queen Street");
              await card.getByRole("button", { name: "View details" }).click();
              await expect(card).toContainText("416-555-0100");

              // Rejecting needs a reason, which the seller then sees.
              await card.getByRole("button", { name: "Reject" }).click();
              await card.getByRole("button", { name: "Confirm rejection" }).click();
              await expect(card).toContainText("Enter a reason.");
              await card.getByLabel("Reason for rejecting").fill("Please add a phone number");
              await card.getByRole("button", { name: "Confirm rejection" }).click();
              await expect(page.getByText("The request was rejected.")).toBeVisible();
              await shop.reload();
              await expect(verification(shop)).toContainText("Not approved", { timeout: 15000 });
              await expect(verification(shop)).toContainText("Please add a phone number");

              // They ask again, and are approved.
              await shop.getByRole("button", { name: "Request verification" }).click();
              await shop.getByLabel("How can we confirm who you are?").fill("Phone 416-555-0100");
              await shop.getByRole("button", { name: "Send request" }).click();
              await expect(verification(shop)).toContainText("Waiting for review");
              card = await find(page, "Waiting for review", email);
              await card.getByRole("button", { name: "Approve" }).click();
              await expect(page.getByText("The seller is now verified.")).toBeVisible();

              // The limit is gone, and the public label changes straight away.
              await shop.reload();
              await expect(verification(shop)).toContainText("Manually verified", { timeout: 15000 });
              await expect(shop.getByRole("region", { name: "Ada's Shop" })).toContainText("Your shop is verified");
              const names = [1, 2, 3].map((n) => `Verified ${n} ${id}`);
              for (const name of names) {
                await addProduct(shop, name);
                await item(shop, name).getByRole("button", { name: "Publish" }).click();
                await expect(item(shop, name)).toContainText("Published");
              }
              await item(shop, names[0]).getByRole("link", { name: "View" }).click();
              await expect(shop.getByText("Verified Seller").first()).toBeVisible();
              await shop.goto("/account/shop");

              // Suspending brings back the label and the limit, and keeps the listings.
              card = await find(page, "Manually verified", email);
              await card.getByRole("button", { name: "Suspend verification" }).click();
              await card.getByLabel("Reason for suspending").fill("Report received");
              await card.getByRole("button", { name: "Confirm suspension" }).click();
              await expect(page.getByText("Verification was suspended.")).toBeVisible();
              await shop.reload();
              await expect(verification(shop)).toContainText("Verification suspended", { timeout: 15000 });
              await expect(shop.getByRole("button", { name: "Request verification" })).toHaveCount(0);
              const fourth = `Verified 4 ${id}`;
              await addProduct(shop, fourth);
              await item(shop, fourth).getByRole("button", { name: "Publish" }).click();
              await expect(item(shop, fourth)).toContainText("You've used all your publishing places");
              await expect(item(shop, names[0])).toContainText("Published");

              // Restoring returns it to manually verified, and every decision is on record.
              card = await find(page, "Verification suspended", email);
              await card.getByRole("button", { name: "Restore verification" }).click();
              await card.getByLabel("Reason for restoring").fill("Report dismissed");
              await card.getByRole("button", { name: "Confirm restoring" }).click();
              await expect(page.getByText("Verification was restored.")).toBeVisible();
              card = await find(page, "Manually verified", email);
              await card.getByRole("button", { name: "View details" }).click();
              const history = card.getByRole("list").last();
              await expect(history).toContainText("Please add a phone number");
              await expect(history).toContainText("Report received");
              await expect(history).toContainText("Report dismissed");
              await expect(history).toContainText("Verification suspended → Manually verified");
              expect(sql(`select count(*) from public.audit_logs where action = 'seller.verification_change' and target_id = (select s.id::text from public.sellers s join auth.users u on u.id = s.owner_user_id where u.email = '${email}')`)).toBe("6");

              sql(`update public.products set status = 'archived', deleted_at = now() where name like '% ${id}'`);
            });

            test("Super Admin can verify a seller who never asked, with a reason", async ({ page, browser, request }) => {
              test.setTimeout(90000);
              const { page: shop, email } = await approvedSeller(page, browser, request);
              const card = await find(page, "Not verified", email);
              await card.getByRole("button", { name: "Verify this seller" }).click();
              await card.getByRole("button", { name: "Confirm verification" }).click();
              await expect(card).toContainText("Enter a reason.");
              await card.getByLabel("Why are you verifying this seller?").fill("Met in person");
              await card.getByRole("button", { name: "Confirm verification" }).click();
              await expect(page.getByText("The seller is now verified.")).toBeVisible();

              await shop.reload();
              await expect(verification(shop)).toContainText("Manually verified", { timeout: 15000 });
              await expect(shop.getByRole("region", { name: "Ada's Shop" })).toContainText("Your shop is verified");
              const owner = `(select s.id::text from public.sellers s join auth.users u on u.id = s.owner_user_id where u.email = '${email}')`;
              expect(sql(`select reason from public.audit_logs where action = 'seller.verification_change' and target_id = ${owner}`)).toBe("Met in person");
              expect(sql(`select count(*) from public.verification_requests where seller_id::text = ${owner}`)).toBe("0");
            });

            test("nobody else can reach the review screen, or its data", async ({ page, request }) => {
              await page.goto(review);
              await expect(page.getByRole("heading", { name: "You don't have access" })).toBeVisible();
              await confirmedAccount(page, request);
              await page.goto(review);
              await expect(page.getByText("This area is for Super Admin only.")).toBeVisible();
              await expect(page.getByRole("article")).toHaveCount(0);
              await page.goto("/account");
              await expect(page.getByRole("region", { name: "Your roles" })).toBeVisible({ timeout: 15000 });
              await expect(page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: /^Seller verification/ })).toHaveCount(0);
            });
          });

          test.describe("photos, through the real Cloudinary account", () => {
            /** A valid PNG of any size, so limits can be tested without storing test images. */
            function png(width: number, height: number) {
              const crcTable = Array.from({ length: 256 }, (_, n) => {
                let k = n;
                for (let i = 0; i < 8; i++) k = k & 1 ? 0xedb88320 ^ (k >>> 1) : k >>> 1;
                return k >>> 0;
              });
              const crc = (data: Buffer) => {
                let value = 0xffffffff;
                for (const byte of data) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
                return (value ^ 0xffffffff) >>> 0;
              };
              const chunk = (type: string, data: Buffer) => {
                const length = Buffer.alloc(4);
                length.writeUInt32BE(data.length);
                const body = Buffer.concat([Buffer.from(type), data]);
                const check = Buffer.alloc(4);
                check.writeUInt32BE(crc(body));
                return Buffer.concat([length, body, check]);
              };
              const header = Buffer.alloc(13);
              header.writeUInt32BE(width, 0);
              header.writeUInt32BE(height, 4);
              header.set([8, 2, 0, 0, 0], 8);
              const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x55)]);
              return Buffer.concat([
                Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
                chunk("IHDR", header),
                chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
                chunk("IEND", Buffer.alloc(0)),
              ]);
            }
            const photoInput = (page: import("@playwright/test").Page, name: string) => item(page, name).getByLabel("Add a photo");
            const productIdOf = (name: string) => sql(`select id from public.products where name = '${name}'`);

            test("a seller adds photos, the public sees them, and removing deletes them", async ({ page, browser, request }) => {
              test.setTimeout(120000);
              const { page: shop } = await approvedSeller(page, browser, request);
              const name = `Photo ${unique()}`;
              await addProduct(shop, name);

              // A large photo is made smaller in the browser, rather than refused.
              await photoInput(shop, name).setInputFiles({ name: "big.png", mimeType: "image/png", buffer: png(3000, 2000) });
              await expect(item(shop, name)).toContainText("1 of 5 photos", { timeout: 30000 });
              await expect(item(shop, name)).toContainText("Main photo");
              const stored = sql(`select secure_url from public.media_assets where entity_id = '${productIdOf(name)}'`);
              expect(stored).toMatch(/^https:\/\/res\.cloudinary\.com\/.+\/biqbaq-local\/products\//);
              expect(stored).toMatch(/\.jpg$/);

              await photoInput(shop, name).setInputFiles({ name: "second.png", mimeType: "image/png", buffer: png(50, 50) });
              await expect(item(shop, name)).toContainText("2 of 5 photos", { timeout: 30000 });

              // Choosing a different main photo.
              await item(shop, name).getByRole("button", { name: "Make main photo" }).click();
              await expect(item(shop, name).getByRole("button", { name: "Make main photo" })).toHaveCount(1);

              // The public page shows it, loaded through the site's own image service.
              await item(shop, name).getByRole("button", { name: "Publish" }).click();
              await expect(item(shop, name)).toContainText("Published");
              const visitor = await (await browser.newContext()).newPage();
              await visitor.goto(`/products/${sql(`select slug from public.products where name = '${name}'`)}`);
              const photo = visitor.getByRole("main").getByRole("img", { name }).first();
              await expect(photo).toBeVisible();
              await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 15000 }).toBeGreaterThan(0);

              // Removing both clears the record, and the files (checked after the run).
              await item(shop, name).getByRole("button", { name: "Remove photo" }).first().click();
              await expect(item(shop, name)).toContainText("1 of 5 photos");
              await expect(item(shop, name)).toContainText("Main photo");
              await item(shop, name).getByRole("button", { name: "Remove photo" }).click();
              await expect(item(shop, name)).toContainText("0 of 5 photos");
              expect(sql(`select count(*) from public.media_assets where entity_id = '${productIdOf(name)}'`)).toBe("0");
              expect(sql(`select count(*) from public.audit_logs where action = 'product.image_remove' and target_id = '${productIdOf(name)}'`)).toBe("2");
              sql(`update public.products set status = 'archived', deleted_at = now() where name = '${name}'`);
            });

            test("a verified seller lists a cargo car, and the public sees it", async ({ page, browser, request }) => {
              test.setTimeout(150000);
              const seller = await approvedSeller(page, browser, request);
              const shop = seller.page;
              // Cargo cars have their own page in My shop (Q-56).
              await shop.goto("/account/shop/cargo-cars");
              const cars = shop.getByRole("region", { name: "Cargo cars" });
              // Unverified sellers are told why they can't list cars (Q-05).
              await expect(cars).toContainText("Cargo cars are for verified sellers.");
              await expect(cars.getByRole("button", { name: "Add a cargo car" })).toHaveCount(0);

              sql(`update public.sellers set verification_status = 'manually_verified' where owner_user_id = (select id from auth.users where email = '${seller.email}')`);
              await shop.reload();
              const model = `Sedona ${unique()}`;
              const name = `2015 Kia ${model}`;
              const departure = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
              await cars.getByRole("button", { name: "Add a cargo car" }).click({ timeout: 15000 });
              const form = shop.getByRole("form", { name: "New cargo car" });
              await form.getByLabel("Make").fill("Kia");
              await form.getByLabel("Model").fill(model);
              await form.getByLabel("Year").fill("2015");
              await form.getByLabel("Leaving from").fill("Toronto");
              await form.getByLabel("Going to").fill("Lagos");
              await form.getByLabel("Estimated departure").fill(departure);
              await form.getByLabel("Weight it can still take (kg)").fill("abc");
              await form.getByRole("button", { name: "Save" }).click();
              await expect(form).toContainText("Enter a whole number of kilograms");
              await form.getByLabel("Weight it can still take (kg)").fill("180");
              await form.getByLabel("Cargo restrictions").fill("No perishable food\n\nNo liquids");
              await form.getByRole("button", { name: "Save" }).click();
              await expect(item(shop, name)).toContainText("Draft", { timeout: 15000 });

              // A photo is needed first.
              await item(shop, name).getByRole("button", { name: "Publish" }).click();
              await expect(item(shop, name)).toContainText("Add at least one photo before publishing.");
              await photoInput(shop, name).setInputFiles({ name: "car.png", mimeType: "image/png", buffer: png(800, 600) });
              await expect(item(shop, name)).toContainText("1 of 5 photos", { timeout: 30000 });
              const id = sql(`select id from public.vehicle_listings where model = '${model}'`);
              expect(sql(`select secure_url from public.media_assets where entity_type = 'vehicle' and entity_id = '${id}'`)).toMatch(/\/biqbaq-local\/vehicles\//);
              await item(shop, name).getByRole("button", { name: "Publish" }).click();
              await expect(item(shop, name)).toContainText("Live");

              // Not counted towards the publication allowance (Q-04).
              expect(sql(`select count(*) from public.product_publication_ledger where seller_id = (select seller_id from public.vehicle_listings where id = '${id}')`)).toBe("0");

              const visitor = await (await browser.newContext()).newPage();
              await visitor.goto(`/cargo-cars/${sql(`select slug from public.vehicle_listings where id = '${id}'`)}`);
              await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(name);
              await expect(visitor.getByRole("main")).toContainText("180 kg of space available");
              await expect(visitor.getByRole("main")).toContainText("No liquids");
              await expect(visitor.getByRole("main")).toContainText("Ada's Shop");
              // The seller's publish refreshes the public list too, rather than within minutes.
              await visitor.goto("/cargo-cars");
              await expect(visitor.getByRole("list", { name: "Cars going to Nigeria" })).toContainText(name);

              // Unpublishing takes it off the site; deleting removes it from the list.
              await item(shop, name).getByRole("button", { name: "Unpublish" }).click();
              await expect(item(shop, name)).toContainText("Not public");
              await item(shop, name).getByRole("button", { name: "Delete" }).click();
              await item(shop, name).getByRole("button", { name: "Yes, delete it" }).click();
              await expect(item(shop, name)).toHaveCount(0);
              expect(sql(`select count(*) from public.audit_logs where target_id = '${id}' and action like 'vehicle.%'`)).toBe("5");
            });

            test("a file that is not an image is refused, with an explanation", async ({ page, browser, request }) => {
              test.setTimeout(90000);
              const { page: shop } = await approvedSeller(page, browser, request);
              const name = `Bad file ${unique()}`;
              await addProduct(shop, name);
              await photoInput(shop, name).setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
              await expect(item(shop, name)).toContainText("Please choose a JPG, PNG or WebP image.");
              await photoInput(shop, name).setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("not really a png") });
              await expect(item(shop, name)).toContainText("We couldn't read that image.");
              await expect(item(shop, name)).toContainText("0 of 5 photos");
            });

            test("going around the screen gets nowhere", async ({ page, browser, request }) => {
              test.setTimeout(120000);
              const { page: shop, context } = await approvedSeller(page, browser, request);
              const name = `Bypass ${unique()}`;
              await addProduct(shop, name);
              const productId = productIdOf(name);
              const sign = (from: import("@playwright/test").APIRequestContext) => from.post("/api/v1/media/sign", { data: { productId } });
              const code = async (response: import("@playwright/test").APIResponse) => (await response.json()).error.code;

              // Who may ask. "page" is the owner of this test's platform: a different person who is
              // Super Admin, and may act for sellers, so an ordinary user is checked instead.
              expect((await sign(request)).status()).toBe(401);
              const stranger = await newApplicant(browser, request);
              const refused = await sign(stranger.page.request);
              expect(refused.status()).toBe(403);
              expect(await code(refused)).toBe("NOT_AUTHORIZED");
              expect((await context.request.post("/api/v1/media/sign", { data: { productId: "nonsense" } })).status()).toBe(400);

              // The response holds no secret.
              const signed = await sign(context.request);
              expect(signed.status()).toBe(200);
              const { data } = await signed.json();
              expect(Object.keys(data.fields).sort()).toEqual(["allowed_formats", "api_key", "overwrite", "public_id", "signature", "timestamp"]);
              expect(data.limits).toEqual({ max_images: 5, max_bytes: 1048576, max_dimension: 4000, formats: ["jpg", "png", "webp"] });

              const upload = (fields: Record<string, string | number>, buffer: Buffer, filename: string, mimeType: string) =>
                request.post(data.uploadUrl, { multipart: { ...fields, file: { name: filename, mimeType, buffer } } as never });

              // Changing what was signed is refused by Cloudinary.
              const tampered = await upload({ ...data.fields, public_id: `${data.fields.public_id}x` }, png(5, 5), "a.png", "image/png");
              expect(tampered.status()).toBe(401);

              // A format outside the list is refused by Cloudinary.
              const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
              expect((await upload(data.fields, gif, "a.gif", "image/gif")).status()).toBe(400);

              // An image that is too large, sent straight to Cloudinary, is caught and deleted.
              const uploaded = await upload(data.fields, png(4001, 1), "wide.png", "image/png");
              expect(uploaded.status()).toBe(200);
              const finish = (from: import("@playwright/test").APIRequestContext, publicId: string) =>
                from.post("/api/v1/media/complete", { data: { productId, publicId } });
              const tooWide = await finish(context.request, data.fields.public_id);
              expect(tooWide.status()).toBe(400);
              expect(await code(tooWide)).toBe("IMAGE_REJECTED");
              expect(sql(`select count(*) from public.media_assets where entity_id = '${productId}'`)).toBe("0");
              // Deleted: asking again finds nothing to save.
              expect(await code(await finish(context.request, data.fields.public_id))).toBe("IMAGE_REJECTED");

              // A file from somewhere else cannot be claimed, or deleted by trying to.
              expect(await code(await finish(context.request, "sample"))).toBe("IMAGE_REJECTED");
              expect(await code(await finish(stranger.page.request, data.fields.public_id))).toBe("NOT_AUTHORIZED");

              // A stranger cannot remove a photo.
              await photoInput(shop, name).setInputFiles({ name: "ok.png", mimeType: "image/png", buffer: png(40, 40) });
              await expect(item(shop, name)).toContainText("1 of 5 photos", { timeout: 30000 });
              const assetId = sql(`select id from public.media_assets where entity_id = '${productId}'`);
              expect((await stranger.page.request.delete(`/api/v1/media/${assetId}`)).status()).toBe(403);
              expect((await request.delete(`/api/v1/media/${assetId}`)).status()).toBe(401);
              expect(sql(`select count(*) from public.media_assets where id = '${assetId}'`)).toBe("1");
              expect((await context.request.delete(`/api/v1/media/${assetId}`)).status()).toBe(204);
              expect(sql(`select count(*) from public.media_assets where id = '${assetId}'`)).toBe("0");
            });
          });

          test("a shop stays private: signed-out visitors and buyers get nothing", async ({ page, request }) => {
            await page.goto("/account/shop");
            await expect(page.getByText("Sign in to manage your shop.")).toBeVisible();
            await confirmedAccount(page, request);
            await page.goto("/account/shop");
            await expect(page.getByRole("heading", { name: "You don't have a shop yet" })).toBeVisible({ timeout: 15000 });
            await page.goto("/account");
            await expect(page.getByRole("region", { name: "Your roles" })).toBeVisible({ timeout: 15000 });
            await expect(page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: /^My shop/ })).toHaveCount(0);
          });
        });

        test("a Super Admin's account shows only their own roles and applications, and Approve is easy to find", async ({ page, browser, request }) => {
          test.setTimeout(90000);
          const owner = await confirmedAccount(page, request);
          makeSuperAdmin(owner);
          const applicant = await newApplicant(browser, request);
          await apply(applicant.page).getByRole("button", { name: "Apply as Seller", exact: false }).first().click();
          await fillSeller(applicant.page);
          await applicant.page.getByRole("button", { name: "Submit application" }).click();
          await expect(applications(applicant.page)).toContainText("Waiting for review");

          await page.goto("/account");
          const roles = page.getByRole("region", { name: "Your roles" });
          await expect(roles).toContainText("Super Admin", { timeout: 15000 });
          await expect(roles.getByRole("listitem")).toHaveCount(2);
          await expect(roles).not.toContainText("Seller");
          // Their dashboard has Recent Applications instead, with Approve rather than Withdraw.
          const recent = page.getByRole("region", { name: "Recent Applications" });
          await expect(page.getByRole("region", { name: "Your applications" })).toHaveCount(0);
          const waiting = recent.getByRole("article").filter({ hasText: applicant.email });
          await expect(waiting).toContainText("Waiting for review");
          await expect(waiting.getByRole("button", { name: "Approve" })).toBeVisible();
          await expect(waiting.getByRole("button", { name: "Reject" })).toBeVisible();
          await expect(page.getByRole("button", { name: /Withdraw/ })).toHaveCount(0);
          await expect(page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: /^My shop/ })).toHaveCount(0);
          await expect(apply(page).getByRole("button", { name: "Apply as Seller", exact: false }).first()).toBeVisible();

          // The verification screen points to where new applications are.
          await page.goto("/admin/verification");
          await page.getByRole("link", { name: "Review new applications" }).click();
          await expect(page).toHaveURL(/\/admin\/role-applications$/);

          // Approving from the dashboard takes effect, and it leaves the list.
          await page.goto("/account");
          await waiting.getByRole("button", { name: "Approve" }).click({ timeout: 15000 });
          await expect(recent.getByText("The application was approved")).toBeVisible();
          await expect(waiting).toHaveCount(0);
          await applicant.page.reload();
          await expect(applicant.page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: /^My shop/ })).toBeVisible({ timeout: 15000 });

          // Applicants keep their own list, with Withdraw.
          await expect(applications(applicant.page)).toContainText("Approved");
        });

        test("signed-out visitors and ordinary users get no access, or data", async ({ page, request }) => {
          await page.goto(screen);
          await expect(page.getByRole("heading", { name: "You don't have access" })).toBeVisible();
          await confirmedAccount(page, request);
          await page.goto(screen);
          await expect(page.getByText("This area is for Super Admin only.")).toBeVisible();
          await expect(page.getByRole("article")).toHaveCount(0);
          await page.goto("/account");
          await expect(page.getByRole("region", { name: "Your roles" })).toBeVisible({ timeout: 15000 });
          await expect(page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: /^Role applications/ })).toHaveCount(0);
        });

        test("Super Admin's sidebar groups the admin links, remembers them, and ends with settings and log out", async ({ page, request }) => {
          test.setTimeout(90000);
          const owner = await confirmedAccount(page, request);
          makeSuperAdmin(owner);
          await page.goto("/account");
          const nav = page.getByRole("navigation", { name: "Dashboard" });
          // People is open; the other groups start closed, so the sidebar fits the screen.
          await expect(nav.getByRole("button", { name: "People" })).toHaveAttribute("aria-expanded", "true", { timeout: 15000 });
          await expect(nav.getByRole("link", { name: /^Role applications/ })).toBeVisible();
          for (const group of ["Content", "Communication", "Records"]) {
            await expect(nav.getByRole("button", { name: group })).toHaveAttribute("aria-expanded", "false");
          }
          await expect(nav.getByRole("link", { name: "Blog", exact: true })).toHaveCount(0);
          await nav.getByRole("button", { name: "Content" }).click();
          await expect(nav.getByRole("link", { name: "Blog", exact: true })).toBeVisible();
          // Remembered in this browser.
          await page.reload();
          await expect(nav.getByRole("button", { name: "Content" })).toHaveAttribute("aria-expanded", "true", { timeout: 15000 });
          // A page's own group always opens.
          await openNavGroup(page, "Records");
          await nav.getByRole("link", { name: "Audit log" }).click();
          await expect(page).toHaveURL(/\/admin\/audit-log$/);
          await expect(nav.getByRole("link", { name: "Audit log" })).toHaveAttribute("aria-current", "page");
          await expect(nav.getByRole("button", { name: "Records" })).toBeDisabled();
          // Ads and blog posts close the Overview (owner's decision, 2026-11-08).
          await page.goto("/account");
          await expect(page.getByRole("heading", { name: "Biqbaq Blog" })).toBeVisible({ timeout: 15000 });
          // Settings and logging out sit at the bottom.
          await page.getByRole("link", { name: "Platform settings" }).click();
          await expect(page).toHaveURL(/\/admin\/settings$/);
          await page.getByRole("button", { name: "Log out" }).click();
          await expect(page).toHaveURL(/\/$/);
          await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible({ timeout: 15000 });
        });

        test("reject with a reason, reapply, then approve: the full journey", async ({ page, browser, request }) => {
          test.setTimeout(90000);
          const owner = await confirmedAccount(page, request);
          makeSuperAdmin(owner);
          const applicant = await newApplicant(browser, request);

          await apply(applicant.page).getByRole("button", { name: "Apply as Seller", exact: false }).first().click();
          await fillSeller(applicant.page);
          await applicant.page.getByRole("button", { name: "Submit application" }).click();
          await expect(applications(applicant.page)).toContainText("Waiting for review");

          // The owner reaches the screen from their account, and finds the application.
          await page.goto("/account");
          await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: /^Role applications/ }).click({ timeout: 15000 });
          await expect(page).toHaveURL(/\/admin\/role-applications$/);
          await page.getByLabel("Search", { exact: true }).fill(applicant.email);
          await page.getByRole("button", { name: "Search", exact: true }).click();
          await expect(page.getByText("1 application")).toBeVisible();
          const card = cardFor(page, applicant.email);
          await expect(card).toContainText(applicant.email);
          await card.getByRole("button", { name: "View details" }).click();
          await expect(card).toContainText("Ada's Shop");
          await expect(card).toContainText("Food & groceries");

          // Rejecting needs a reason, which the applicant then sees.
          await card.getByRole("button", { name: "Reject" }).click();
          await card.getByRole("button", { name: "Confirm rejection" }).click();
          await expect(card.getByText("Enter a reason for rejecting.")).toBeVisible();
          await card.getByLabel("Reason for rejecting").fill("Please add a phone number");
          await card.getByRole("button", { name: "Confirm rejection" }).click();
          await expect(page.getByText("The application was rejected.")).toBeVisible();

          await applicant.page.reload();
          await expect(applications(applicant.page)).toContainText("Rejected", { timeout: 15000 });
          await expect(applications(applicant.page)).toContainText("Please add a phone number");
          await expect(page.getByRole("region", { name: "Your roles" })).toHaveCount(0);

          // They apply again, and the reviewer can see the earlier rejection.
          await apply(applicant.page).getByRole("button", { name: "Apply as Seller", exact: false }).first().click();
          await fillSeller(applicant.page);
          await applicant.page.getByRole("button", { name: "Submit application" }).click();
          await expect(applications(applicant.page)).toContainText("Waiting for review");

          await page.getByRole("button", { name: "Search", exact: true }).click();
          await page.reload();
          await page.getByLabel("Search", { exact: true }).fill(applicant.email);
          await page.getByRole("button", { name: "Search", exact: true }).click();
          const second = cardFor(page, applicant.email);
          await second.getByRole("button", { name: "View details" }).click({ timeout: 15000 });
          await expect(second.getByRole("region").or(second)).toContainText("Please add a phone number");
          await second.getByRole("button", { name: "Approve" }).click();
          await expect(page.getByText("The application was approved")).toBeVisible();

          // The approved role is live, and the whole journey is in the audit log.
          await applicant.page.reload();
          const roles = applicant.page.getByRole("region", { name: "Your roles" });
          await expect(roles).toContainText("Seller", { timeout: 15000 });
          await expect(applicant.page.getByRole("region", { name: "Your applications" })).toContainText("Approved");
          const actions = sql(`select string_agg(action, ',' order by created_at) from public.audit_logs where actor_id = (select id from auth.users where email = '${owner}')`);
          expect(actions).toBe("role_application.reject,role_application.approve");

          // It moves out of the queue, and into Approved.
          await page.getByRole("button", { name: "Waiting" }).click();
          await expect(page.getByText("No applications found.")).toBeVisible();
          await page.getByRole("button", { name: "Approved" }).click();
          await expect(cardFor(page, applicant.email)).toContainText("Decided by");
          await cardFor(page, applicant.email).getByRole("button", { name: "View details" }).click();
          await expect(cardFor(page, applicant.email).getByRole("button", { name: "Approve" })).toHaveCount(0);
          await applicant.context.close();
        });

        test("an Admin is approved with only the permissions ticked", async ({ page, browser, request }) => {
          test.setTimeout(90000);
          const owner = await confirmedAccount(page, request);
          makeSuperAdmin(owner);
          const applicant = await newApplicant(browser, request);
          await apply(applicant.page).getByRole("button", { name: "Apply as Admin" }).click();
          await applicant.page.getByLabel("Why are you applying?").fill("To help run things");
          await applicant.page.getByRole("button", { name: "Submit application" }).click();
          await expect(applications(applicant.page)).toContainText("Waiting for review");

          await page.goto(screen);
          await page.getByLabel("Search", { exact: true }).fill(applicant.email);
          await page.getByRole("button", { name: "Search", exact: true }).click();
          await expect(page.getByText("1 application")).toBeVisible({ timeout: 15000 });
          const card = cardFor(page, applicant.email);
          await card.getByRole("button", { name: "View details" }).click();
          await card.getByLabel("View platform reports").check();
          await card.getByRole("button", { name: "Approve" }).click();
          await expect(page.getByText("The application was approved")).toBeVisible();

          const granted = sql(`select string_agg(p.permission_key, ',') from public.user_role_permissions p join public.user_roles r on r.id = p.user_role_id join auth.users u on u.id = r.user_id where u.email = '${applicant.email}'`);
          expect(granted).toBe("reports.view");
          // Being an Admin does not open this screen.
          await applicant.page.goto(screen);
          await expect(applicant.page.getByText("This area is for Super Admin only.")).toBeVisible();
          await applicant.context.close();
        });

        test("filters work", async ({ page, browser, request }) => {
          test.setTimeout(90000);
          const owner = await confirmedAccount(page, request);
          makeSuperAdmin(owner);
          const applicant = await newApplicant(browser, request);
          await apply(applicant.page).getByRole("button", { name: "Apply as Marketer" }).click();
          await applicant.page.getByLabel("Why are you applying?").fill("I know many sellers");
          await applicant.page.getByRole("button", { name: "Submit application" }).click();
          await expect(applications(applicant.page)).toContainText("Waiting for review");

          await page.goto(screen);
          await page.getByLabel("Search", { exact: true }).fill(applicant.email);
          await page.getByRole("button", { name: "Search", exact: true }).click();
          await expect(page.getByText("1 application")).toBeVisible({ timeout: 15000 });
          await page.getByLabel("Role", { exact: true }).selectOption("admin");
          await expect(page.getByText("No applications found.")).toBeVisible();
          await page.getByLabel("Role", { exact: true }).selectOption("marketer");
          await expect(cardFor(page, applicant.email)).toBeVisible();
          await page.getByLabel("Search", { exact: true }).fill("nothing-matches-this");
          await page.getByRole("button", { name: "Search", exact: true }).click();
          await expect(page.getByText("No applications found.")).toBeVisible();
          await applicant.context.close();
        });

        test("an application text cannot inject anything into the screen", async ({ page, browser, request }) => {
          test.setTimeout(90000);
          const owner = await confirmedAccount(page, request);
          makeSuperAdmin(owner);
          const applicant = await newApplicant(browser, request);
          const attack = '<img src=x onerror="window.injected=true"><script>window.injected=true</script>';
          await apply(applicant.page).getByRole("button", { name: "Apply as Marketer" }).click();
          await applicant.page.getByLabel("Why are you applying?").fill(attack);
          await applicant.page.getByRole("button", { name: "Submit application" }).click();
          await expect(applications(applicant.page)).toContainText("Waiting for review");

          await page.goto(screen);
          await page.getByLabel("Search", { exact: true }).fill(applicant.email);
          await page.getByRole("button", { name: "Search", exact: true }).click();
          await expect(page.getByText("1 application")).toBeVisible({ timeout: 15000 });
          const card = cardFor(page, applicant.email);
          await card.getByRole("button", { name: "View details" }).click();
          await expect(card).toContainText("onerror");
          expect(await page.evaluate(() => (window as unknown as { injected?: boolean }).injected)).toBeUndefined();
          await applicant.context.close();
        });

        test("works in French", async ({ page, request }) => {
          const owner = await confirmedAccount(page, request);
          makeSuperAdmin(owner);
          await page.goto(`/fr${screen}`);
          await expect(page.getByRole("heading", { level: 1 })).toHaveText("Demandes de rôle");
          await expect(page.getByRole("button", { name: "En attente" })).toBeVisible({ timeout: 15000 });
        });
      });

      test("works in French", async ({ page, request }) => {
        await confirmedAccount(page, request);
        await page.goto("/fr/account");
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("Votre compte");
        await expect(page.getByRole("region", { name: "Vos rôles" })).toContainText("Acheteur");
      });
    });

    test("signing up in French keeps French after the email link", async ({ page, request }) => {
      const email = newEmail("french");
      await page.goto("/fr/register");
      await page.getByLabel("Nom complet").fill("Ada");
      await page.getByLabel("Courriel").fill(email);
      await page.getByLabel("Mot de passe", { exact: true }).fill(password);
      await page.getByLabel("Confirmer le mot de passe", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Créer le compte" }).click();
      await expect(page.getByText("Nous avons envoyé un lien")).toBeVisible();
      await page.goto(await emailLink(request, email));
      await expect(page).toHaveURL(/\/fr$/);
      await expect(page.getByRole("banner").getByRole("button", { name: "Se déconnecter" })).toBeVisible();
    });
  });

  test("the password can be shown and hidden", async ({ page }) => {
    await page.goto("/sign-in");
    const password = page.getByLabel("Password", { exact: true });
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show Password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide Password" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("account pages link to each other, starting from the header", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("banner").getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome back");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await page.getByRole("link", { name: "Back to sign in" }).click();
    await page.getByRole("main").getByRole("link", { name: "Create a free account" }).first().click();
    await expect(page).toHaveURL(/\/register$/);
    await page.goto("/fr/sign-in");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bon retour");
  });

  test("an unknown car shows a not-found page", async ({ page }) => {
    await page.goto("/cargo-cars/does-not-exist");
    await expect(page.getByRole("heading", { name: "Car not found" })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
    (page as unknown as { problems: string[] }).problems = [];
  });

  for (const path of ["/", "/products", "/products/ankara-tote-bag", "/cargo-cars", "/cargo-cars/2021-toyota-sienna", "/sellers/adire-studio", "/conditions-of-use", "/privacy-notice", "/fr/products"]) {
    test(`blog and ads appear exactly once on ${path}`, async ({ page }) => {
      await page.goto(path);
      const french = path.startsWith("/fr");
      const blog = page.getByRole("region", { name: french ? "Blogue Biqbaq" : "Biqbaq Blog" });
      const ads = page.getByRole("region", { name: french ? "Commandité" : "Sponsored" });
      await expect(blog.getByRole("article")).toHaveCount(5);
      await expect(ads.getByRole("article")).toHaveCount(3);
    });
  }

  test("the Cargo Cars page lists every car, soonest departure first", async ({ page }) => {
    await page.goto("/cargo-cars");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cargo Cars");
    const list = page.getByRole("list", { name: "Cars going to Nigeria" }).getByRole("article");
    await expect(list.filter({ hasText: "2021 Toyota Sienna" })).toHaveCount(1);
    const count = await list.count();
    expect(count).toBeGreaterThanOrEqual(9);
    await expect(page.getByText(new RegExp(`^${count} cars\\b`))).toBeVisible();
    // The sample cars keep their order among any real ones: soonest departure first.
    const texts = await list.allTextContents();
    const position = (car: string) => texts.findIndex((text) => text.includes(car));
    expect(position("2021 Toyota Sienna")).toBeLessThan(position("2019 Honda Pilot"));
    expect(position("2020 Toyota Corolla")).toBeLessThan(position("2017 Mercedes-Benz GLE"));
    expect(position("2021 Toyota Sienna")).toBeGreaterThanOrEqual(0);
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Cargo cars going to Nigeria" }).getByRole("article")).toHaveCount(4);
  });

  test("sections reveal on scroll, and stay revealed", async ({ page }) => {
    await page.goto("/");
    const faq = page.getByText("How do I become a seller?");
    const item = page.locator("details", { has: faq });
    await expect(item).toHaveCSS("opacity", "0");
    await faq.scrollIntoViewIfNeeded();
    await expect(item).toHaveCSS("opacity", "1");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(item).toHaveAttribute("data-rv-shown", "");
  });

  test("reduced motion shows everything immediately", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const hidden = await page.locator("[data-rv]").evaluateAll(
      (elements) => elements.filter((element) => getComputedStyle(element).opacity !== "1").length,
    );
    expect(hidden).toBe(0);
  });

  test("content stays visible with JavaScript turned off", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveClass(/\brv\b/);
    await expect(page.locator("details").last()).toHaveCSS("opacity", "1");
    await context.close();
  });

  test("search filters results and shows an empty state", async ({ page }) => {
    await page.goto("/products?q=stool");
    await expect(page.getByText("1 product")).toBeVisible();
    await page.goto("/products?q=zzzz");
    await expect(page.getByRole("heading", { name: "No products found" })).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page.getByText(/\d+ products/)).toBeVisible();
  });

  test("filters and pagination work and bad params are ignored", async ({ page }) => {
    await page.goto("/products");
    await page.getByLabel("Sort by").selectOption("price_asc");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/sort=price_asc/);
    await expect(page.getByRole("article").first()).toContainText("$9.00");
    // Only the local sample shops match this, as tests running alongside publish their own products.
    await page.goto("/products?q=(sample)");
    await expect(page.getByText("12 products")).toBeVisible();
    await page.getByRole("link", { name: "Next" }).click();
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await page.goto("/products?q=(sample)&category=bad&page=abc&sort=bad");
    await expect(page.getByText("12 products")).toBeVisible();
  });

  test("product page labels unverified sellers", async ({ page }) => {
    await page.goto("/products/suya-spice-blend");
    await expect(page.getByText("Unverified Seller").first()).toBeVisible();
    await page.goto("/products/ankara-tote-bag");
    await expect(page.getByText("Verified Seller").first()).toBeVisible();
  });

  test("contact form validates, and sends the enquiry to the seller without showing their address", async ({ page, request }) => {
    const token = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.1.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}` });
    const responses: string[] = [];
    page.on("response", async (response) => {
      if (response.url().includes("/contact")) responses.push(await response.text());
    });
    await page.goto("/products/ankara-tote-bag");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Enter your name.")).toBeVisible();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await page.getByLabel("Your name").fill("Ada");
    await page.getByLabel("Your email").fill(`visitor-${token}@example.com`);
    await page.getByLabel("Subject").fill(`Hello ${token}`);
    await page.getByLabel("Message").fill("Is this in stock?");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Your message was sent to the seller.")).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel("Message")).toHaveValue("");

    const mailpit = "http://127.0.0.1:54324/api/v1";
    const query = encodeURIComponent(`subject:"Hello ${token}"`);
    await expect.poll(async () => (await (await request.get(`${mailpit}/search?query=${query}`)).json()).messages.length).toBe(1);
    const found = (await (await request.get(`${mailpit}/search?query=${query}`)).json()).messages[0];
    const message = await (await request.get(`${mailpit}/message/${found.ID}`)).json();
    expect(message.To[0].Address).toBe("adire-studio@example.com");
    expect(message.ReplyTo[0].Address).toBe(`visitor-${token}@example.com`);
    expect(message.Text).toContain("Is this in stock?");
    expect(message.Text).toContain("Ankara");

    expect(responses.join()).not.toContain("adire-studio@");
    expect(await page.content()).not.toContain("adire-studio@");
  });

  test("a cargo car's form sends the visitor's message to the dealer, through Biqbaq", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.2.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}` });
    await page.goto("/cargo-cars/2021-toyota-sienna");
    // The dealer's own email and phone are never shown (Q-33).
    await expect(page.getByRole("main")).not.toContainText("@example.com");
    await page.getByLabel("Your name").fill("Ada");
    await page.getByLabel("Your email").fill(`visitor-${Date.now()}@example.com`);
    await page.getByLabel("Subject").fill("Hello");
    await page.getByLabel("Message").fill("Is there room?");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Your message was sent to the seller.")).toBeVisible({ timeout: 15000 });
  });

  test("gallery and share links work", async ({ page }) => {
    await page.goto("/products/ankara-tote-bag");
    await page.getByRole("button", { name: "View image 2" }).click();
    await expect(page.getByRole("img", { name: /placeholder image 2/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Share on WhatsApp" })).toHaveAttribute("href", /wa\.me.*ankara-tote-bag/);
    await expect(page.getByRole("link", { name: "Share on Facebook" })).toHaveAttribute("href", /facebook\.com.*ankara-tote-bag/);
  });

  test("language switch translates and keeps filters", async ({ page }) => {
    await page.goto("/products?category=food");
    await page.getByRole("button", { name: "Passer au français" }).click();
    await expect(page).toHaveURL(/\/fr\/products\?category=food/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Produits");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByText("Vendeur non vérifié").first()).toBeVisible();
  });

  test("theme choice persists across reloads", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.getByRole("button", { name: /light and dark/ }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("unknown pages show the localized not-found page", async ({ page }) => {
    // The browser logs the expected 404 responses as console errors.
    (page as unknown as { problems: string[] }).problems = [];
    await page.goto("/products/does-not-exist");
    await expect(page.getByRole("heading", { name: "Product not found" })).toBeVisible();
    // The response status is 200 here, so noindex is what keeps it out of search.
    await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
    await page.goto("/fr/nothing-here");
    await expect(page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
    (page as unknown as { problems: string[] }).problems = [];
  });
});

test("account emails cannot be sent by anyone but Supabase", async ({ request }) => {
  const payload = { user: { email: "victim@gmail.com" }, email_data: { email_action_type: "signup", token_hash: "x" } };
  const unsigned = await request.post("/api/v1/auth/email-hook", { data: payload });
  expect(unsigned.status()).toBe(401);
  const forged = await request.post("/api/v1/auth/email-hook", {
    data: payload,
    headers: { "webhook-id": "msg_1", "webhook-timestamp": String(Math.floor(Date.now() / 1000)), "webhook-signature": "v1,AAAA" },
  });
  expect(forged.status()).toBe(401);
});

test("the email worker cannot be run from outside", async ({ request }) => {
  const response = await request.post("/api/v1/internal/jobs/run");
  expect(response.status()).toBe(503);
  const body = await response.json();
  expect(body.error.code).toBe("WORKER_NOT_CONFIGURED");
  expect(JSON.stringify(body)).not.toContain("claimed");
});

test.describe("the contact API", () => {
  const address = () => `10.2.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  const enquiry = (email: string) => ({ name: "Ada", email, subject: "Spam check", message: "Hello" });

  async function productId(page: import("@playwright/test").Page) {
    let id = "";
    page.on("request", (sent) => {
      const match = /\/api\/v1\/products\/([^/]+)\/contact/.exec(sent.url());
      if (match) id = match[1];
    });
    await page.goto("/products/ankara-tote-bag");
    await page.route("**/contact", (route) => route.fulfill({ status: 202, body: "{}" }));
    await page.getByLabel("Your name").fill("Ada");
    await page.getByLabel("Your email").fill("ada@example.com");
    await page.getByLabel("Subject").fill("Id");
    await page.getByLabel("Message").fill("Id");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect.poll(() => id).not.toBe("");
    return id;
  }

  test("refuses what it should, and stops at the limit", async ({ page, request }) => {
    const id = await productId(page);
    const url = `/api/v1/products/${id}/contact`;
    const ip = address();
    const headers = { "x-forwarded-for": ip };
    const token = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    expect((await request.post("/api/v1/products/not-an-id/contact", { data: enquiry("a@example.com"), headers })).status()).toBe(404);
    expect((await request.post("/api/v1/products/00000000-0000-4000-8000-000000000000/contact", { data: enquiry("a@example.com"), headers })).status()).toBe(404);
    expect((await request.post(url, { data: { ...enquiry("nope") }, headers })).status()).toBe(400);
    expect((await request.post(url, { data: { ...enquiry("a@example.com"), extra: "x" }, headers })).status()).toBe(400);
    expect((await request.post(url, { data: "x".repeat(20001), headers: { ...headers, "content-type": "application/json" } })).status()).toBe(400);

    // A robot filling in the hidden field is told it worked, and nothing is sent.
    const robot = `robot-${token}@example.com`;
    expect((await request.post(url, { data: { ...enquiry(robot), website: "http://spam.example" }, headers })).status()).toBe(202);
    const inbox = await (await request.get(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`from:"${robot}" OR "${robot}"`)}`)).json();
    expect(inbox.messages.length).toBe(0);

    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      const response = await request.post(url, { data: enquiry(`limit-${token}-${i}@example.com`), headers });
      statuses.push(response.status());
      expect(await response.text()).not.toContain("adire-studio@");
    }
    expect(statuses).toEqual([202, 202, 202, 202, 202, 429]);
  });
});

test.describe("the public seller API", () => {
  const sql = (statement: string) =>
    execFileSync("docker", ["exec", "-i", "supabase_db_biqbaq", "psql", "-U", "supabase_admin", "-d", "postgres", "-q", "-tA", "-c", statement], {
      env: { ...process.env, PATH: `${process.env.PATH}:/Applications/Docker.app/Contents/Resources/bin` },
    }).toString().trim();
  const id = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const slug = `api-shop-${id}`;
  const email = `api-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const address = () => ({ "x-forwarded-for": `10.3.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}` });

  test.beforeAll(() => {
    sql(`insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), '${email}', now())`);
    sql(`insert into public.user_roles (user_id, role_key) select id, 'seller' from auth.users where email = '${email}'`);
    sql(`insert into public.sellers (owner_user_id, slug, name, city, verification_status) select id, '${slug}', 'API Shop', 'Toronto', 'manually_verified' from auth.users where email = '${email}'`);
    sql(`insert into public.seller_private (seller_id, contact_information) select id, 'PRIVATE-${id}' from public.sellers where slug = '${slug}'`);
    const rows = [
      ["Alpha", 3000, "in_stock", "fashion", "published", "1 day"],
      ["Bravo", 1000, "limited", "food", "published", "2 days"],
      ["Charlie", 2000, "in_stock", "fashion", "published", "3 days"],
      ["Draft one", 500, "in_stock", "fashion", "draft", null],
      ["Hidden one", 500, "in_stock", "fashion", "unpublished", "4 days"],
      ["Suspended one", 500, "in_stock", "fashion", "suspended", "5 days"],
    ];
    for (const [name, price, availability, category, status, age] of rows) {
      sql(`insert into public.products (seller_id, name, description, price_minor, availability, category_id) select s.id, '${name} ${id}', 'Words', ${price}, '${availability}', c.id from public.sellers s, public.categories c where s.slug = '${slug}' and c.slug = '${category}'`);
      sql(`set session_replication_role = replica; update public.products set status = '${status}', first_published_at = ${age ? `now() - interval '${age}'` : "null"} where name = '${name} ${id}'`);
    }
    sql(`set session_replication_role = replica; update public.products set deleted_at = now(), status = 'archived' where name = 'Hidden one ${id}'`);
    // Reviews: two published on live products, one hidden by a moderator, one on a draft.
    for (const [label, name] of [["ada", "Ada Reviewer"], ["bo", "Bo Reviewer"]]) {
      const reviewer = `${label}-${id}-1@example.com`;
      sql(`insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), '${reviewer}', now())`);
      sql(`update public.profiles set display_name = '${name}' where id = (select id from auth.users where email = '${reviewer}')`);
    }
    const review = (who: string, product: string, rating: number, body: string, status: string, age: string) =>
      sql(`set session_replication_role = replica; insert into public.reviews (product_id, author_id, rating, body, status, created_at)
           select p.id, u.id, ${rating}, '${body}', '${status}', now() - interval '${age}' from public.products p, auth.users u
           where p.name = '${product} ${id}' and u.email = '${who}-${id}-1@example.com'`);
    review("ada", "Alpha", 5, "Great fit", "published", "1 hour");
    review("bo", "Bravo", 4, "Tasty", "published", "2 hours");
    review("ada", "Bravo", 1, "Rude words", "hidden", "3 hours");
    review("bo", "Draft one", 3, "On a draft", "published", "4 hours");
  });

  test.afterAll(() => {
    sql(`set session_replication_role = replica; delete from public.products where seller_id = (select id from public.sellers where slug = '${slug}'); delete from public.seller_private where seller_id = (select id from public.sellers where slug = '${slug}'); delete from public.sellers where slug = '${slug}'; delete from public.user_roles where user_id = (select id from auth.users where email = '${email}'); delete from public.profiles where id = (select id from auth.users where email = '${email}'); delete from auth.users where email = '${email}';`);
    // Counters are not removed here: another worker may be counting at this moment. The cleanup after the run removes them.
  });

  test("returns only the seller's public products, in the documented shape", async ({ request }) => {
    const response = await request.get(`/api/v1/sellers/${slug}/products`, { headers: address() });
    expect(response.status()).toBe(200);
    expect(response.headers()["access-control-allow-origin"]).toBe("*");
    expect(response.headers()["cache-control"]).toContain("s-maxage");
    expect(response.headers()["etag"]).toBeTruthy();
    const body = await response.json();
    expect(body.seller).toMatchObject({ name: "API Shop", slug, city: "Toronto", verified: true });
    expect(body.data.map((product: { name: string }) => product.name)).toEqual([`Alpha ${id}`, `Bravo ${id}`, `Charlie ${id}`]);
    expect(body.meta).toEqual({ page: 1, pageSize: 20, total: 3, totalPages: 1 });
    const product = body.data[0];
    expect(Object.keys(product).sort()).toEqual(["availability", "category", "description", "id", "images", "name", "price", "publishedAt", "slug", "url"]);
    expect(product.price).toEqual({ amountMinor: 3000, currency: "CAD" });
    expect(product.category).toEqual({ slug: "fashion", name: "Fashion" });
    const text = JSON.stringify(body);
    for (const secret of [`PRIVATE-${id}`, email, "owner", "seller_id", "Draft one", "Hidden one", "Suspended one"]) expect(text).not.toContain(secret);
  });

  test("the product link opens its page on Biqbaq", async ({ request, page }) => {
    const body = await (await request.get(`/api/v1/sellers/${slug}/products`, { headers: address() })).json();
    const url = new URL(body.data[0].url);
    await page.goto(url.pathname);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`Alpha ${id}`);
    const french = await (await request.get(`/api/v1/sellers/${slug}/products?locale=fr`, { headers: address() })).json();
    expect(new URL(french.data[0].url).pathname.startsWith("/fr/products/")).toBe(true);
    expect(french.data.find((p: { category: { slug: string } }) => p.category.slug === "fashion").category.name).not.toBe("Fashion");
  });

  test("filters, sorts and pages", async ({ request }) => {
    const names = async (query: string) =>
      (await (await request.get(`/api/v1/sellers/${slug}/products?${query}`, { headers: address() })).json()).data.map((p: { name: string }) => p.name.split(" ")[0]);
    expect(await names("category=fashion")).toEqual(["Alpha", "Charlie"]);
    expect(await names("availability=limited")).toEqual(["Bravo"]);
    expect(await names("category=no-such-thing")).toEqual([]);
    expect(await names("sort=price_asc")).toEqual(["Bravo", "Charlie", "Alpha"]);
    expect(await names("sort=price_desc")).toEqual(["Alpha", "Charlie", "Bravo"]);
    expect(await names("sort=name")).toEqual(["Alpha", "Bravo", "Charlie"]);
    const first = await (await request.get(`/api/v1/sellers/${slug}/products?pageSize=2&sort=name`, { headers: address() })).json();
    const second = await (await request.get(`/api/v1/sellers/${slug}/products?pageSize=2&page=2&sort=name`, { headers: address() })).json();
    expect(first.meta).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect([...first.data, ...second.data].map((p: { name: string }) => p.name.split(" ")[0])).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(await names("page=50")).toEqual([]);
  });

  test("refuses bad requests, unknown and suspended sellers, and answers browsers", async ({ request }) => {
    expect((await request.get(`/api/v1/sellers/${slug}/products?pageSize=1000`, { headers: address() })).status()).toBe(400);
    expect((await request.get(`/api/v1/sellers/${slug}/products?sort=random`, { headers: address() })).status()).toBe(400);
    const unknown = await request.get(`/api/v1/sellers/no-such-shop-${id}/products`, { headers: address() });
    expect(unknown.status()).toBe(404);
    expect((await unknown.json()).error.code).toBe("SELLER_NOT_FOUND");
    expect((await request.get(`/api/v1/sellers/Not%20A%20Slug/products`, { headers: address() })).status()).toBe(404);
    const preflight = await request.fetch(`/api/v1/sellers/${slug}/products`, { method: "OPTIONS", headers: { Origin: "https://abc-store.example", "Access-Control-Request-Method": "GET" } });
    expect(preflight.status()).toBe(204);
    expect(preflight.headers()["access-control-allow-origin"]).toBe("*");
    expect((await request.post(`/api/v1/sellers/${slug}/products`, { headers: address() })).status()).toBe(405);
  });

  test("an unchanged answer is not sent twice", async ({ request }) => {
    const headers = address();
    const first = await request.get(`/api/v1/sellers/${slug}/products`, { headers });
    const etag = first.headers()["etag"];
    const again = await request.get(`/api/v1/sellers/${slug}/products`, { headers: { ...headers, "If-None-Match": etag } });
    expect(again.status()).toBe(304);
    expect(await again.text()).toBe("");
  });

  test("returns the shop's published reviews, with a summary, in the documented shape", async ({ request }) => {
    const response = await request.get(`/api/v1/sellers/${slug}/reviews`, { headers: address() });
    expect(response.status()).toBe(200);
    expect(response.headers()["access-control-allow-origin"]).toBe("*");
    expect(response.headers()["etag"]).toBeTruthy();
    const body = await response.json();
    expect(body.seller).toMatchObject({ name: "API Shop", slug, verified: true });
    expect(body.summary).toEqual({ reviewCount: 2, averageRating: 4.5 });
    expect(body.meta).toEqual({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
    // Newest first, with names as Biqbaq shows them.
    expect(body.data.map((review: { body: string }) => review.body)).toEqual(["Great fit", "Tasty"]);
    const review = body.data[0];
    expect(Object.keys(review).sort()).toEqual(["author", "body", "createdAt", "id", "product", "rating", "verifiedPurchase"]);
    expect(review).toMatchObject({ rating: 5, author: { name: "Ada Reviewer" }, verifiedPurchase: false, product: { name: `Alpha ${id}` } });
    expect(new URL(review.product.url).pathname).toBe(`/products/${review.product.slug}`);
    const text = JSON.stringify(body);
    for (const secret of ["Rude words", "On a draft", email, `ada-${id}`, "author_id", "status"]) expect(text).not.toContain(secret);

    // One product's reviews, and a page at a time.
    const bravo = body.data[1].product.slug;
    const one = await (await request.get(`/api/v1/sellers/${slug}/reviews?product=${bravo}`, { headers: address() })).json();
    expect(one.summary).toEqual({ reviewCount: 1, averageRating: 4 });
    expect(one.data.map((r: { body: string }) => r.body)).toEqual(["Tasty"]);
    const second = await (await request.get(`/api/v1/sellers/${slug}/reviews?pageSize=1&page=2`, { headers: address() })).json();
    expect(second.meta).toEqual({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    expect(second.data.map((r: { body: string }) => r.body)).toEqual(["Tasty"]);
    const none = await (await request.get(`/api/v1/sellers/${slug}/reviews?product=no-such-product`, { headers: address() })).json();
    expect(none.summary).toEqual({ reviewCount: 0, averageRating: null });

    // Bad requests and unknown shops, as for products.
    expect((await request.get(`/api/v1/sellers/${slug}/reviews?pageSize=1000`, { headers: address() })).status()).toBe(400);
    expect((await request.get(`/api/v1/sellers/no-such-shop-${id}/reviews`, { headers: address() })).status()).toBe(404);
    const preflight = await request.fetch(`/api/v1/sellers/${slug}/reviews`, { method: "OPTIONS", headers: { Origin: "https://abc-store.example", "Access-Control-Request-Method": "GET" } });
    expect(preflight.status()).toBe(204);
  });

  test("one internet address cannot go past the limit", async ({ request }) => {
    sql(`update public.platform_settings set value = '10' where key = 'api.max_requests_per_hour'`);
    try {
      const headers = address();
      const statuses = [];
      for (let i = 0; i < 11; i += 1) statuses.push((await request.get(`/api/v1/sellers/${slug}/products`, { headers })).status());
      expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
      const limited = await request.get(`/api/v1/sellers/${slug}/products`, { headers });
      expect(limited.status()).toBe(429);
      expect(limited.headers()["retry-after"]).toBe("3600");
      expect((await request.get(`/api/v1/sellers/${slug}/products`, { headers: address() })).status()).toBe(200);
    } finally {
      sql(`update public.platform_settings set value = '600' where key = 'api.max_requests_per_hour'`);
    }
  });
});


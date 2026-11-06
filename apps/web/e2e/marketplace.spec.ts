import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

// Dev-only, from next-themes when a language switch re-renders the root layout.
// Its script already ran on first load, so the theme is unaffected.
const KNOWN_DEV_WARNING = "Encountered a script tag while rendering React component";

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
    await page.goto("/");
    const active = page.locator("img[data-active]");
    const headline = page.getByRole("heading", { level: 1 });
    await expect(active).toHaveAttribute("alt", /grocery store/);
    await expect(headline).toHaveAccessibleName("Find groceries and other products in your city");
    await expect(active).toHaveAttribute("alt", /shipping container/, { timeout: 8000 });
    await expect(headline).toHaveAccessibleName("Find cargo vehicles heading to Nigeria and send your goods");
    await expect(active).toHaveAttribute("alt", /Toronto/, { timeout: 7000 });
    await expect(headline).toHaveAccessibleName("The Platform made for Entrepreneurs to do business");
    await page.getByRole("button", { name: "Pause the photo slideshow" }).click();
    await page.waitForTimeout(6000);
    await expect(active).toHaveAttribute("alt", /Toronto/);
    await expect(headline).toHaveAccessibleName("The Platform made for Entrepreneurs to do business");
  });

  test("hero photos stay still with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForTimeout(6000);
    await expect(page.locator("img[data-active]")).toHaveAttribute("alt", /grocery store/);
    await expect(page.getByRole("button", { name: "Play the photo slideshow" })).toBeVisible();
  });

  test("home lists cargo cars going to Nigeria, below the new products", async ({ page }) => {
    await page.goto("/");
    const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
    const newProducts = headings.findIndex((h) => h.includes("New on Biqbaq"));
    expect(headings[newProducts + 1]).toContain("Cargo cars going to Nigeria");
    const section = page.getByRole("region", { name: "Cargo cars going to Nigeria" });
    await expect(section.getByRole("article")).toHaveCount(4);
    await expect(section.getByText("Unverified Seller")).toBeVisible();
    await section.getByRole("link", { name: "2021 Toyota Sienna" }).click();
    await expect(page).toHaveURL(/\/cargo-cars\/2021-toyota-sienna$/);
  });

  test("view counts appear on products and cargo cars", async ({ page }) => {
    await page.goto("/");
    const products = page.getByRole("region", { name: "New on Biqbaq" });
    await expect(products.getByRole("article").filter({ hasText: "Ankara Tote Bag" })).toContainText("1,240 views");
    const cargo = page.getByRole("region", { name: "Cargo cars going to Nigeria" });
    await expect(cargo.getByRole("article").first()).toContainText("1,876 views");
    await page.goto("/products");
    await expect(page.getByRole("article").first()).toContainText(/\d views/);
    await page.goto("/products/ankara-tote-bag");
    await expect(page.getByRole("main").getByText("1,240 views").first()).toBeVisible();
  });

  test("home shows blog topics below the cargo cars", async ({ page }) => {
    await page.goto("/");
    const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
    const cargo = headings.findIndex((h) => h.includes("Cargo cars going to Nigeria"));
    expect(headings[cargo + 1]).toContain("From the Biqbaq blog");
    const section = page.getByRole("region", { name: "From the Biqbaq blog" });
    await expect(section.getByRole("article")).toHaveCount(5);
    const lead = section.getByRole("article").first();
    await expect(lead).toContainText("Most read");
    await expect(lead).toContainText("Amara N. (sample)");
    await expect(lead).toContainText("3,420 readers");
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
    const blog = headings.findIndex((h) => h.includes("From the Biqbaq blog"));
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
    for (const [name, url] of [
      ["Create a Free Account", /\/register$/],
      ["Get a free website After Referrals", /\/register$/],
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
      const tiles = document.querySelector('[aria-label="Get started on Biqbaq"]')!;
      return ads.compareDocumentPosition(tiles) & Node.DOCUMENT_POSITION_FOLLOWING;
    });
    expect(order).toBeTruthy();
    await page.goto("/products?q=calgary");
    await expect(page.getByText("Calgary, Canada").first()).toBeVisible();
  });

  test("clicking a car's photo opens its own page, with full details", async ({ page }) => {
    await page.goto("/cargo-cars");
    const list = page.getByRole("list", { name: "Cars going to Nigeria" });
    // Clicks straight away, so this also covers a photo that is still animating in.
    await list.getByRole("article").nth(1).locator('[data-rv="fade"]').click();
    await expect(page).toHaveURL(/\/cargo-cars\/2019-honda-pilot$/);
    const main = page.getByRole("main");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("2019 Honda Pilot");
    await expect(main).toContainText("Calgary");
    await expect(main).toContainText("Lagos, Nigeria");
    await expect(main).toContainText("December 12, 2026");
    await expect(main).toContainText("About 65% of space available");
    await expect(main).toContainText("Accepting cargo");
    await expect(main).toContainText("942 views");
    await expect(main).toContainText("Prairie Motors (sample)");
    await expect(page.getByRole("heading", { name: "Cargo restrictions" })).toBeVisible();

    await page.getByRole("button", { name: "View image 2" }).click();
    await expect(page.getByRole("img", { name: /Pilot, placeholder image 2/ })).toBeVisible();

    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Enter your name.")).toBeVisible();

    const related = page.getByRole("region", { name: "More cars going to Nigeria" }).getByRole("article");
    await expect(related).toHaveCount(4);
    await related.first().getByRole("link").click();
    await expect(page).toHaveURL(/\/cargo-cars\/2021-toyota-sienna$/);

    await page.goto("/fr/cargo-cars/2021-toyota-sienna");
    await expect(page.getByRole("main")).toContainText("Détails du trajet");
  });

  test("clicking a product's photo opens its page", async ({ page }) => {
    await page.goto("/products");
    await page.getByRole("article").first().locator('[data-rv="fade"]').click();
    await expect(page).toHaveURL(/\/products\/[a-z0-9-]+$/);
  });

  test("cargo cars can be filtered by departure city and destination", async ({ page }) => {
    await page.goto("/cargo-cars");
    await page.getByLabel("Leaving from").selectOption("Calgary");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/from=Calgary/);
    await expect(page.getByText("1 car ·")).toBeVisible();
    await expect(page.getByRole("list", { name: "Cars going to Nigeria" }).getByRole("article")).toContainText("2019 Honda Pilot");

    await page.goto("/cargo-cars?to=Abuja");
    await expect(page.getByLabel("Going to", { exact: true })).toHaveValue("Abuja");
    await expect(page.getByText("3 cars ·")).toBeVisible();

    await page.goto("/cargo-cars?from=Calgary&to=Abuja");
    await expect(page.getByRole("heading", { name: "No cars found" })).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page.getByText("12 cars")).toBeVisible();

    await page.goto("/cargo-cars?from=Nowhere");
    await expect(page.getByText("12 cars")).toBeVisible();
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

  test("Google sign-in appears on sign-up and sign-in, and is honest that it is not connected", async ({ page }) => {
    for (const [path, name] of [["/register", "Sign up with Google"], ["/sign-in", "Sign in with Google"]] as const) {
      await page.goto(path);
      const url = page.url();
      await page.getByRole("button", { name }).click();
      await expect(page.getByText("Google sign-in isn't connected")).toBeVisible();
      expect(page.url()).toBe(url);
    }
    await page.goto("/forgot-password");
    await expect(page.getByRole("button", { name: /Google/ })).toHaveCount(0);
    await page.goto("/fr/register");
    await expect(page.getByRole("button", { name: "S'inscrire avec Google" })).toBeVisible();
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
      await expect(page.getByRole("list", { name: "All articles" }).getByRole("article")).toHaveCount(4);
      await expect(page.getByRole("region", { name: "Sponsored" }).getByRole("article")).toHaveCount(3);
      // The large lead article opens its own page too.
      await page.getByRole("link", { name: "How to start selling your products online from Canada" }).click();
      await expect(page).toHaveURL(/\/blog\/how-to-start-selling-your-products-online-from-canada$/);
      await page.goto("/blog");
      await page.getByRole("link", { name: "Styling Ankara for a Canadian winter" }).click();
      await expect(page).toHaveURL(/\/blog\/styling-ankara-for-a-canadian-winter$/);
      const main = page.getByRole("main");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Styling Ankara for a Canadian winter");
      await expect(main).toContainText("Ngozi E. (sample)");
      await expect(main).toContainText("1,185 readers");
      await expect(main).toContainText("4 min read");
      await expect(main).toContainText("October 2, 2026");
      await expect(main).toContainText("This is sample text");
      await expect(page.getByRole("link", { name: "Share on WhatsApp" })).toBeVisible();
    });

    test("an article does not list itself below, and shows the ads", async ({ page }) => {
      await page.goto("/blog/styling-ankara-for-a-canadian-winter");
      const section = page.getByRole("region", { name: "From the Biqbaq blog" });
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
      await page.goto(await emailLink(request, email));
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
        await expect(apply(page).getByRole("button", { name: "Apply as Seller", exact: false })).toHaveCount(2);
        await expect(apply(page).getByRole("button", { name: /Apply as/ })).toHaveCount(4);
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
        await expect(apply(page).getByRole("button", { name: /Apply as Seller\b/ })).toHaveCount(1);
        await expect(apply(page).getByRole("button", { name: /Apply as/ })).toHaveCount(3);

        await page.reload();
        await expect(applications(page)).toContainText("Waiting for review");
        await applications(page).getByRole("button", { name: "Withdraw Seller application" }).click();
        await expect(applications(page)).toContainText("Withdrawn");
        await expect(apply(page).getByRole("button", { name: /Apply as/ })).toHaveCount(4);

        await apply(page).getByRole("button", { name: "Apply as Seller", exact: false }).first().click();
        await fillSeller(page);
        await page.getByRole("button", { name: "Submit application" }).click();
        await expect(applications(page)).toContainText("Waiting for review");
      });

      test("Marketer, Admin and Seller Staff applications work too", async ({ page, request }) => {
        await confirmedAccount(page, request);
        await page.goto("/account");
        for (const role of ["Marketer", "Admin"]) {
          await apply(page).getByRole("button", { name: `Apply as ${role}` }).click();
          await page.getByLabel("Why are you applying?").fill("I would like to help");
          await page.getByRole("button", { name: "Submit application" }).click();
          await expect(applications(page)).toContainText(role);
        }
        await apply(page).getByRole("button", { name: "Apply as Seller Staff" }).click();
        await page.getByLabel("Which seller will you work with?").fill("Ada's Shop");
        await page.getByRole("button", { name: "Submit application" }).click();
        await expect(applications(page)).toContainText("Seller Staff");
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
            await seller.page.getByRole("link", { name: "Manage my shop" }).click({ timeout: 15000 });
            await expect(seller.page).toHaveURL(/\/account\/shop$/);
            await expect(seller.page.getByRole("heading", { name: "Ada's Shop" })).toBeVisible({ timeout: 15000 });
            return seller;
          }

          async function addProduct(page: import("@playwright/test").Page, name: string, complete = true) {
            await page.getByRole("button", { name: "Add a product" }).click();
            const form = page.getByRole("form", { name: "New product" });
            await form.getByLabel("Product name").fill(name);
            await form.getByLabel("Price (CAD)").fill("12.50");
            if (complete) {
              await form.getByLabel("Description").fill("Made for this test");
              await form.getByLabel("Category").selectOption({ label: "Food & groceries" });
            }
            await form.getByRole("button", { name: "Save" }).click();
            await expect(page.getByRole("article", { name })).toContainText("Draft");
          }
          const item = (page: import("@playwright/test").Page, name: string) => page.getByRole("article", { name });

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
            await shop.getByRole("button", { name: "Add a product" }).click();
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

          test("a shop stays private: signed-out visitors and buyers get nothing", async ({ page, request }) => {
            await page.goto("/account/shop");
            await expect(page.getByText("Sign in to manage your shop.")).toBeVisible();
            await confirmedAccount(page, request);
            await page.goto("/account/shop");
            await expect(page.getByRole("heading", { name: "You don't have a shop yet" })).toBeVisible({ timeout: 15000 });
            await page.goto("/account");
            await expect(page.getByRole("region", { name: "Your roles" })).toBeVisible({ timeout: 15000 });
            await expect(page.getByRole("link", { name: "Manage my shop" })).toHaveCount(0);
          });
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
          await expect(page.getByRole("link", { name: "Review role applications" })).toHaveCount(0);
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
          await page.getByRole("link", { name: "Review role applications" }).click({ timeout: 15000 });
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

        test("filters work, and Seller Staff approval warns it gives no seller access", async ({ page, browser, request }) => {
          test.setTimeout(90000);
          const owner = await confirmedAccount(page, request);
          makeSuperAdmin(owner);
          const applicant = await newApplicant(browser, request);
          await apply(applicant.page).getByRole("button", { name: "Apply as Seller Staff" }).click();
          await applicant.page.getByLabel("Which seller will you work with?").fill("Ada's Shop");
          await applicant.page.getByRole("button", { name: "Submit application" }).click();
          await expect(applications(applicant.page)).toContainText("Waiting for review");

          await page.goto(screen);
          await page.getByLabel("Search", { exact: true }).fill(applicant.email);
          await page.getByRole("button", { name: "Search", exact: true }).click();
          await expect(page.getByText("1 application")).toBeVisible({ timeout: 15000 });
          await page.getByLabel("Role", { exact: true }).selectOption("marketer");
          await expect(page.getByText("No applications found.")).toBeVisible();
          await page.getByLabel("Role", { exact: true }).selectOption("seller_staff");
          await cardFor(page, applicant.email).getByRole("button", { name: "View details" }).click();
          await expect(page.getByText("Approving gives no access to any seller.")).toBeVisible();
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
      const blog = page.getByRole("region", { name: french ? "Sur le blogue de Biqbaq" : "From the Biqbaq blog" });
      const ads = page.getByRole("region", { name: french ? "Commandité" : "Sponsored" });
      await expect(blog.getByRole("article")).toHaveCount(5);
      await expect(ads.getByRole("article")).toHaveCount(3);
    });
  }

  test("the Cargo Cars page lists every car, soonest departure first", async ({ page }) => {
    await page.goto("/cargo-cars");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cargo Cars");
    await expect(page.getByText("12 cars")).toBeVisible();
    const cars = page.getByRole("list", { name: "Cars going to Nigeria" }).getByRole("article");
    await expect(cars).toHaveCount(12);
    await expect(cars.first()).toContainText("2021 Toyota Sienna");
    await expect(cars.last()).toContainText("2017 Mercedes-Benz GLE");
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

  test("contact form validates, and is honest that nothing is sent", async ({ page }) => {
    await page.goto("/products/ankara-tote-bag");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Enter your name.")).toBeVisible();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await page.getByLabel("Your name").fill("Ada");
    await page.getByLabel("Your email").fill("ada@example.com");
    await page.getByLabel("Subject").fill("Hello");
    await page.getByLabel("Message").fill("Is this in stock?");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("it was not sent")).toBeVisible();
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

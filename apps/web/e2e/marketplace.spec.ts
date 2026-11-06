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
    await expect(products.getByRole("article").first()).toContainText("1,240 views");
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
    await expect(page).toHaveURL(/\/blog$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Biqbaq blog");
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
    await expect(page).toHaveURL(/category=food/);
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

  test("registration validates, and is honest that no account is created", async ({ page }) => {
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

    await page.getByLabel("Confirm password", { exact: true }).fill("long-enough");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("no account was created")).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
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

  for (const path of ["/register", "/sign-in", "/forgot-password", "/fr/register"]) {
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

  test("the password can be shown and hidden", async ({ page }) => {
    await page.goto("/sign-in");
    const password = page.getByLabel("Password", { exact: true });
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show Password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide Password" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("the account forms send nothing to any server", async ({ page }) => {
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") posts.push(request.url());
    });
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Password", { exact: true }).fill("a-secret-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("you weren't signed in")).toBeVisible();
    expect(posts).toEqual([]);
    await expect(page).not.toHaveURL(/secret/);
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

  for (const path of ["/", "/products", "/products/ankara-tote-bag", "/cargo-cars", "/cargo-cars/2021-toyota-sienna", "/blog", "/fr/products"]) {
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
    await expect(page.getByText("12 products")).toBeVisible();
  });

  test("filters and pagination work and bad params are ignored", async ({ page }) => {
    await page.goto("/products");
    await page.getByLabel("Sort by").selectOption("price_asc");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/sort=price_asc/);
    await expect(page.getByRole("article").first()).toContainText("$9.00");
    await expect(page.getByText("12 products")).toBeVisible();
    await page.goto("/products");
    await page.getByRole("link", { name: "Next" }).click();
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await page.goto("/products?category=bad&page=abc&sort=bad");
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

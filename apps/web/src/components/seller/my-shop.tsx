"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { cardClass, headingClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { ProductPhotos } from "@/components/seller/product-photos";
import { ShopApi } from "@/components/seller/shop-api";
import { ShopProfile } from "@/components/seller/shop-profile";
import { ShopStaff } from "@/components/seller/shop-staff";
import { VerificationCard } from "@/components/seller/verification-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { formatPrice } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSessionUser } from "@/lib/supabase/use-session-user";
import { cn } from "@/lib/utils";
import { getPhotoLimit, listShopPhotos, type ShopPhoto } from "@/modules/media-management/client";
import { refreshCatalog } from "@/modules/product-catalog/actions";
import { can, getSellerAllowance, getShopAccess, type ShopAccess } from "@/modules/staff-management";
import {
  createDraft,
  deleteProduct,
  listCategories,
  listShopProducts,
  priceInputValue,
  productFormSchema,
  publishProduct,
  shopErrorKey,
  unpublishProduct,
  updateProduct,
  type Category,
  type SellerProduct,
} from "@/modules/product-catalog/seller-products";
import { AVAILABILITIES } from "@/modules/product-catalog/types";
import { getMyLatestRequest, type MyVerificationRequest } from "@/modules/verification";
import { getMyAllowance, getMyShop, getShopById, placesLeft, type MyShop as Shop, type PublishingAllowance } from "@/modules/seller-management";

const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold transition-colors outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-70";
const selectClass =
  "h-11 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface ShopData {
  shop: Shop | null;
  access: ShopAccess | null;
  products: SellerProduct[];
  categories: Category[];
  allowance: PublishingAllowance | null;
  photos: ShopPhoto[];
  photoLimit: number;
  verificationRequest: MyVerificationRequest | null;
}

/** Keeps the public pages current. If this fails they catch up within about a minute. */
const refreshPublicPages = () => refreshCatalog().catch(() => undefined);

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function ProductEditor({
  supabase,
  sellerId,
  product,
  categories,
  onDone,
  onCancel,
}: {
  supabase: SupabaseClient;
  sellerId: string;
  product?: SellerProduct;
  categories: Category[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fieldId = (name: string) => `${product?.id ?? "new"}-${name}`;
  const fieldError = (name: string) => (errors[name] ? t(`shop.errors.${errors[name]}`) : undefined);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    const parsed = productFormSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
      return;
    }
    setErrors({});
    setSaving(true);
    const { error } = product
      ? await updateProduct(supabase, product.id, parsed.data)
      : await createDraft(supabase, sellerId, parsed.data);
    if (error) {
      setSaving(false);
      setFailure(shopErrorKey(error));
      return;
    }
    if (product?.status === "published") await refreshPublicPages();
    onDone();
  }

  return (
    <form onSubmit={save} noValidate className="grid gap-4" aria-label={t(product ? "shop.editTitle" : "shop.newTitle")}>
      <Field id={fieldId("name")} label={t("shop.fields.name")} error={fieldError("name")}>
        <Input id={fieldId("name")} name="name" defaultValue={product?.name} maxLength={150} className="h-11 rounded-xl" />
      </Field>
      <Field id={fieldId("description")} label={t("shop.fields.description")} error={fieldError("description")}>
        <Textarea id={fieldId("description")} name="description" defaultValue={product?.description} maxLength={5000} rows={4} className="rounded-xl" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={fieldId("category_id")} label={t("shop.fields.category")}>
          <select id={fieldId("category_id")} name="category_id" defaultValue={product?.category_id ?? ""} className={selectClass}>
            <option value="">{t("shop.fields.noCategory")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{t(`categories.${category.slug}`)}</option>
            ))}
          </select>
        </Field>
        <Field id={fieldId("price")} label={t("shop.fields.price")} hint={t("shop.fields.priceHint")} error={fieldError("price")}>
          <Input
            id={fieldId("price")}
            name="price"
            inputMode="decimal"
            defaultValue={product ? priceInputValue(product.price_minor) : ""}
            className="h-11 rounded-xl"
          />
        </Field>
        <Field id={fieldId("availability")} label={t("shop.fields.availability")}>
          <select id={fieldId("availability")} name="availability" defaultValue={product?.availability ?? "in_stock"} className={selectClass}>
            {AVAILABILITIES.map((value) => (
              <option key={value} value={value}>{t(`availability.${value}`)}</option>
            ))}
          </select>
        </Field>
        <Field id={fieldId("condition")} label={t("shop.fields.condition")}>
          <select id={fieldId("condition")} name="condition" defaultValue={product?.condition ?? ""} className={selectClass}>
            <option value="">{t("shop.fields.noCondition")}</option>
            <option value="new">{t("condition.new")}</option>
            <option value="used">{t("condition.used")}</option>
          </select>
        </Field>
      </div>
      <p className="text-sm text-muted-foreground">{t("shop.publishNeeds")}</p>
      {failure && <Notice kind="error">{t(`shop.errors.${failure}`)}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={primaryButton}>{t(saving ? "shop.saving" : "shop.save")}</button>
        <button type="button" onClick={onCancel} className={cn(secondaryButton, "h-11 px-5")}>{t("shop.cancel")}</button>
      </div>
    </form>
  );
}

function ProductItem({
  supabase,
  sellerId,
  access,
  product,
  categories,
  photos,
  photoLimit,
  onChanged,
}: {
  supabase: SupabaseClient;
  sellerId: string;
  access: ShopAccess | null;
  product: SellerProduct;
  categories: Category[];
  photos: ShopPhoto[];
  photoLimit: number;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const { status } = product;
  const suspended = status === "suspended";

  async function run(action: (client: SupabaseClient, id: string) => PromiseLike<{ error: { code?: string; message: string } | null }>) {
    setBusy(true);
    setFailure(null);
    const { error } = await action(supabase, product.id);
    if (error) {
      setFailure(shopErrorKey(error));
    } else {
      await refreshPublicPages();
    }
    setConfirming(false);
    await onChanged();
    setBusy(false);
  }

  const tone = status === "published" ? "good" : suspended ? "bad" : status === "draft" ? "waiting" : "neutral";

  return (
    <li>
      <article aria-label={product.name} className={cardClass}>
        {editing ? (
          <ProductEditor
            supabase={supabase}
            sellerId={sellerId}
            product={product}
            categories={categories}
            onCancel={() => setEditing(false)}
            onDone={() => void onChanged().then(() => setEditing(false))}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold break-words">{product.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {formatPrice({ amountMinor: product.price_minor, currency: "CAD" }, locale)}
                </p>
              </div>
              <StatusPill tone={tone}>{t(`shop.status.${status}`)}</StatusPill>
            </div>
            {suspended && <p className="mt-2 text-sm text-muted-foreground">{t("shop.suspendedHelp")}</p>}
            <ProductPhotos
              productId={product.id}
              productName={product.name}
              photos={photos}
              limit={photoLimit}
              readOnly={suspended || !can(access, "products.edit")}
              onChanged={async () => {
                if (status === "published") await refreshPublicPages();
                await onChanged();
              }}
            />
            {failure && <div className="mt-3"><Notice kind="error">{t(`shop.errors.${failure}`)}</Notice></div>}
            {confirming ? (
              <div className="mt-3 grid gap-2">
                <p className="text-sm">{t("shop.deleteWarning", { name: product.name })}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => void run(deleteProduct)} className={secondaryButton}>{t("shop.confirmDelete")}</button>
                  <button type="button" onClick={() => setConfirming(false)} className={secondaryButton}>{t("shop.keep")}</button>
                </div>
              </div>
            ) : (
              !suspended && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {status === "published" ? (
                    <>
                      <Link href={`/products/${product.slug}`} className={secondaryButton}>{t("shop.view")}</Link>
                      {can(access, "products.publish") && <button type="button" disabled={busy} onClick={() => void run(unpublishProduct)} className={secondaryButton}>{t("shop.unpublish")}</button>}
                    </>
                  ) : (
                    can(access, "products.publish") && <button type="button" disabled={busy} onClick={() => void run(publishProduct)} className={secondaryButton}>{t("shop.publish")}</button>
                  )}
                  {can(access, "products.edit") && <button type="button" onClick={() => setEditing(true)} className={secondaryButton}>{t("shop.edit")}</button>}
                  {can(access, "products.delete") && <button type="button" onClick={() => setConfirming(true)} className={secondaryButton}>{t("shop.delete")}</button>}
                </div>
              )
            )}
          </>
        )}
      </article>
    </li>
  );
}

/**
 * Reads and writes directly under the security rules, so the database decides what
 * this person can do. The screen only explains the outcome.
 */
export function MyShop() {
  const t = useTranslations("shop");
  const tStaff = useTranslations("staff");
  const user = useSessionUser();
  // Staff open a shop they work for by its id. Without one, this is the person's own shop.
  const staffSellerId = useSearchParams().get("seller");
  const [data, setData] = useState<ShopData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async (userId: string) => {
    const supabase = getSupabaseBrowserClient();
    const shop = staffSellerId ? await getShopById(supabase, staffSellerId) : await getMyShop(supabase, userId);
    if (shop.error) {
      setLoadFailed(true);
      return;
    }
    if (!shop.data) {
      setData({ shop: null, access: null, products: [], categories: [], allowance: null, photos: [], photoLimit: 0, verificationRequest: null });
      return;
    }
    const products = await listShopProducts(supabase, shop.data.id);
    if (products.error) {
      setLoadFailed(true);
      return;
    }
    const [shopAccess, categories, allowance, photos, photoLimit, verificationRequest] = await Promise.all([
      getShopAccess(supabase, shop.data.id),
      listCategories(supabase),
      staffSellerId ? getSellerAllowance(supabase, shop.data.id) : getMyAllowance(supabase),
      listShopPhotos(supabase, products.data.map((product) => product.id)),
      getPhotoLimit(supabase),
      getMyLatestRequest(supabase, shop.data.id),
    ]);
    if (shopAccess.error || categories.error || allowance.error || photos.error || photoLimit.error || verificationRequest.error) {
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    setData({
      shop: shop.data as Shop,
      access: shopAccess.access,
      products: products.data as SellerProduct[],
      categories: categories.data as Category[],
      allowance: allowance.data as PublishingAllowance,
      photos: photos.data as ShopPhoto[],
      photoLimit: photoLimit.data as number,
      verificationRequest: verificationRequest.data as MyVerificationRequest | null,
    });
  }, [staffSellerId]);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    // Waits a moment, as Supabase cannot make requests during its own auth callback.
    const timer = setTimeout(() => void load(userId), 0);
    return () => clearTimeout(timer);
  }, [userId, load]);

  if (user === undefined || (user && !data && !loadFailed)) {
    return <Skeleton className="h-64 rounded-3xl" aria-hidden />;
  }
  if (!user) {
    return (
      <div className={cn(cardClass, "mx-auto max-w-lg text-center")}>
        <p className="text-sm text-muted-foreground">{t("signedOutBody")}</p>
        <Link href="/sign-in" className={cn(primaryButton, "mt-5")}>{t("signIn")}</Link>
      </div>
    );
  }
  if (loadFailed || !data) return <Notice kind="error">{t("errors.loadFailed")}</Notice>;
  if (!data.shop || !data.allowance) {
    return (
      <div className={cn(cardClass, "mx-auto max-w-lg text-center")}>
        <h2 className={headingClass}>{t("noShopTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("noShopBody")}</p>
        <Link href="/account" className={cn(primaryButton, "mt-5")}>{t("backToAccount")}</Link>
      </div>
    );
  }

  const { shop, access, allowance, categories, products, photos, photoLimit, verificationRequest } = data;
  const isOwner = Boolean(access?.is_owner);
  const left = placesLeft(allowance);
  const supabase = getSupabaseBrowserClient();
  const reload = () => load(user.id);

  return (
    <div className="grid gap-4">
      <section aria-labelledby="shop-summary" className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="shop-summary" className={headingClass}>{shop.name}</h2>
            <p className="text-sm text-muted-foreground">{shop.city}</p>
            {!isOwner && <p className="mt-1 text-sm font-medium">{tStaff("workingAsStaff")}</p>}
          </div>
          {shop.status === "active" && <Link href={`/sellers/${shop.slug}`} className={secondaryButton}>{t("viewPublic")}</Link>}
        </div>
        <div className="mt-4 grid gap-2">
          {shop.status === "suspended" && <Notice kind="error">{t("shopSuspended")}</Notice>}
          {shop.publishing_suspended && <Notice kind="error">{t("publishingSuspended")}</Notice>}
          {left === null ? (
            <p className="text-sm font-semibold">{t("noLimit")}</p>
          ) : (
            <>
              <p className="text-sm font-semibold">{t("places", { left, allowance: allowance.allowance })}</p>
              <p className="text-sm text-muted-foreground">{t("placesHelp")}</p>
            </>
          )}
        </div>
      </section>

      {shop.status === "active" && isOwner && (
        <ShopProfile
          shop={shop}
          categorySlugs={categories.map((category) => category.slug)}
          onSaved={async () => {
            await refreshPublicPages();
            await reload();
          }}
        />
      )}

      {shop.status === "active" && isOwner && <ShopApi slug={shop.slug} />}

      {isOwner && (
        <VerificationCard
          status={shop.verification_status}
          request={verificationRequest}
          shopActive={shop.status === "active"}
          onChanged={reload}
        />
      )}

      {shop.status === "active" && can(access, "staff.manage") && (
        <ShopStaff sellerId={shop.id} available={access?.permissions ?? []} />
      )}

      <section aria-labelledby="shop-products" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="shop-products" className={headingClass}>{t("productsTitle")}</h2>
          {!adding && shop.status === "active" && can(access, "products.create") && (
            <button type="button" onClick={() => setAdding(true)} className={primaryButton}>{t("addProduct")}</button>
          )}
        </div>
        {adding && (
          <div className={cardClass}>
            <ProductEditor
              supabase={supabase}
              sellerId={shop.id}
              categories={categories}
              onCancel={() => setAdding(false)}
              onDone={() => void reload().then(() => setAdding(false))}
            />
          </div>
        )}
        {products.length === 0 && !adding && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        <ul className="grid gap-3">
          {products.map((product) => (
            <ProductItem key={product.id} supabase={supabase} sellerId={shop.id} access={access} product={product} categories={categories} photos={photos.filter((photo) => photo.entity_id === product.id)} photoLimit={photoLimit} onChanged={reload} />
          ))}
        </ul>
      </section>
    </div>
  );
}

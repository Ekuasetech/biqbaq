"use client";

import { cn } from "@/lib/utils";
import { useScrollToHash, useSeekHash } from "@/lib/use-scroll-to-hash";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { cardClass, headingClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { ProductPhotos } from "@/components/seller/product-photos";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pager } from "@/components/ui/pager";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeVehiclePhoto, uploadVehiclePhoto } from "@/modules/media-management/client";
import { refreshCatalog } from "@/modules/product-catalog/actions";
import {
  deleteVehicle,
  listMyVehicles,
  MY_VEHICLES_PAGE_SIZE,
  makeMainVehiclePhoto,
  parseRestrictions,
  publishVehicle,
  saveVehicle,
  unpublishVehicle,
  vehicleErrorKey,
  vehicleSchema,
  type MyVehicle,
} from "@/modules/vehicle-marketplace/seller";

const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";
const refreshPublic = () => refreshCatalog().catch(() => undefined);

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Editor({ vehicle, onDone, onCancel }: { vehicle: MyVehicle | null; onDone: () => Promise<void>; onCancel: () => void }) {
  const t = useTranslations("shopVehicles");
  const key = vehicle?.id ?? "new";
  const [form, setForm] = useState({
    make: vehicle?.make ?? "",
    model: vehicle?.model ?? "",
    year: vehicle ? String(vehicle.year) : String(new Date().getFullYear()),
    origin: vehicle?.origin_city ?? "",
    destination: vehicle?.destination_city ?? "",
    departure: vehicle?.departure_date ?? "",
    availableKg: vehicle ? String(vehicle.available_kg) : "",
    restrictions: (vehicle?.restrictions ?? []).join("\n"),
    cargoStatus: vehicle?.cargo_status ?? "accepting_cargo",
  });
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const set = (field: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [field]: event.target.value });

  async function save(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    const parsed = vehicleSchema.safeParse({ ...form, restrictions: parseRestrictions(form.restrictions) });
    if (!parsed.success) {
      setFailure(parsed.error.issues[0]?.message ?? "generic");
      return;
    }
    setWorking(true);
    setFailure(null);
    const { error } = await saveVehicle(getSupabaseBrowserClient(), vehicle?.id ?? null, parsed.data);
    setWorking(false);
    if (error) {
      setFailure(vehicleErrorKey(error));
      return;
    }
    if (vehicle?.status === "published") await refreshPublic();
    await onDone();
  }

  return (
    <form onSubmit={save} noValidate aria-label={t(vehicle ? "editTitle" : "newTitle")} className="grid gap-4">
      {failure && <Notice kind="error">{t.has(`errors.${failure}`) ? t(`errors.${failure}`) : t("errors.generic")}</Notice>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id={`${key}-make`} label={t("fields.make")}><Input id={`${key}-make`} value={form.make} maxLength={40} onChange={set("make")} className="h-11 text-base md:text-sm" /></Field>
        <Field id={`${key}-model`} label={t("fields.model")}><Input id={`${key}-model`} value={form.model} maxLength={60} onChange={set("model")} className="h-11 text-base md:text-sm" /></Field>
        <Field id={`${key}-year`} label={t("fields.year")}><Input id={`${key}-year`} inputMode="numeric" value={form.year} onChange={set("year")} className="h-11 text-base md:text-sm" /></Field>
        <Field id={`${key}-origin`} label={t("fields.origin")} hint={t("hints.origin")}><Input id={`${key}-origin`} value={form.origin} maxLength={80} onChange={set("origin")} className="h-11 text-base md:text-sm" /></Field>
        <Field id={`${key}-destination`} label={t("fields.destination")} hint={t("hints.destination")}><Input id={`${key}-destination`} value={form.destination} maxLength={80} onChange={set("destination")} className="h-11 text-base md:text-sm" /></Field>
        <Field id={`${key}-departure`} label={t("fields.departure")}><Input id={`${key}-departure`} type="date" value={form.departure} onChange={set("departure")} className="h-11" /></Field>
        <Field id={`${key}-kg`} label={t("fields.availableKg")} hint={t("hints.availableKg")}><Input id={`${key}-kg`} inputMode="numeric" value={form.availableKg} onChange={set("availableKg")} className="h-11 text-base md:text-sm" /></Field>
        <Field id={`${key}-status`} label={t("fields.cargoStatus")}>
          <select id={`${key}-status`} value={form.cargoStatus} onChange={set("cargoStatus")} className="h-11 rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="accepting_cargo">{t("cargoStatus.accepting_cargo")}</option>
            <option value="full">{t("cargoStatus.full")}</option>
          </select>
        </Field>
      </div>
      <Field id={`${key}-restrictions`} label={t("fields.restrictions")} hint={t("hints.restrictions")}>
        <Textarea id={`${key}-restrictions`} value={form.restrictions} rows={3} onChange={set("restrictions")} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={working} className={primaryButton}>{working ? t("working") : t("save")}</button>
        <button type="button" onClick={onCancel} className={secondaryButton}>{t("cancel")}</button>
      </div>
    </form>
  );
}

function VehicleItem({ vehicle, photoLimit, onChanged }: { vehicle: MyVehicle; photoLimit: number; onChanged: () => Promise<void> }) {
  const t = useTranslations("shopVehicles");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const name = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  const suspended = vehicle.status === "suspended";
  const departure = new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(vehicle.departure_date));

  async function run(action: () => PromiseLike<{ error: { code?: string; message?: string } | null }>) {
    setBusy(true);
    setFailure(null);
    const { error } = await action();
    if (error) setFailure(vehicleErrorKey(error));
    else await refreshPublic();
    setConfirming(false);
    await onChanged();
    setBusy(false);
  }

  const supabase = getSupabaseBrowserClient();
  return (
    <li>
      <article id={`vehicle-${vehicle.id}`} aria-label={name} className={cn(cardClass, "scroll-mt-24 transition-shadow")}>
        {editing ? (
          <Editor vehicle={vehicle} onCancel={() => setEditing(false)} onDone={() => onChanged().then(() => setEditing(false))} />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="break-words font-semibold">{name}</h3>
                <p className="text-sm text-muted-foreground">
                  {vehicle.origin_city} → {vehicle.destination_city} · {t("departs", { date: departure })} · {t("space", { kg: vehicle.available_kg })}
                </p>
              </div>
              <StatusPill tone={vehicle.status === "published" ? (vehicle.is_public ? "good" : "waiting") : suspended ? "bad" : vehicle.status === "draft" ? "waiting" : "neutral"}>
                {vehicle.status === "published" && !vehicle.is_public ? t("status.hidden") : t(`status.${vehicle.status}`)}
              </StatusPill>
            </div>
            {vehicle.status === "published" && !vehicle.is_public && <p className="mt-2 text-sm text-muted-foreground">{t("hiddenHelp")}</p>}
            {suspended && <p className="mt-2 text-sm text-muted-foreground">{t("suspendedHelp")}</p>}
            <ProductPhotos
              productId={vehicle.id}
              productName={name}
              photos={vehicle.photos}
              limit={photoLimit}
              readOnly={suspended}
              onChanged={async () => {
                if (vehicle.status === "published") await refreshPublic();
                await onChanged();
              }}
              actions={{
                upload: (file) => uploadVehiclePhoto(vehicle.id, file),
                remove: removeVehiclePhoto,
                makeMain: async (id) => {
                  const { error } = await makeMainVehiclePhoto(supabase, id);
                  if (error) throw new Error(error.message);
                },
              }}
            />
            {failure && <div className="mt-3"><Notice kind="error">{t.has(`errors.${failure}`) ? t(`errors.${failure}`) : t("errors.generic")}</Notice></div>}
            {!suspended && (confirming ? (
              <div className="mt-3 grid gap-2">
                <p className="text-sm">{t("deleteWarning", { name })}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => void run(() => deleteVehicle(supabase, vehicle.id))} className={secondaryButton}>{t("confirmDelete")}</button>
                  <button type="button" onClick={() => setConfirming(false)} className={secondaryButton}>{t("keep")}</button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {vehicle.status === "published" ? (
                  <>
                    {vehicle.is_public && <Link href={`/cargo-cars/${vehicle.slug}`} prefetch={false} className={secondaryButton}>{t("view")}</Link>}
                    <button type="button" disabled={busy} onClick={() => void run(() => unpublishVehicle(supabase, vehicle.id))} className={secondaryButton}>{t("unpublish")}</button>
                  </>
                ) : (
                  <button type="button" disabled={busy} onClick={() => void run(() => publishVehicle(supabase, vehicle.id))} className={secondaryButton}>{t("publish")}</button>
                )}
                <button type="button" onClick={() => setEditing(true)} className={secondaryButton}>{t("edit")}</button>
                <button type="button" onClick={() => setConfirming(true)} className={secondaryButton}>{t("delete")}</button>
              </div>
            ))}
          </>
        )}
      </article>
    </li>
  );
}

/** A shop owner's cargo cars. Only verified sellers can list them (owner's decision, 2026-11-07). */
export function ShopVehicles({ verified, photoLimit }: { verified: boolean; photoLimit: number }) {
  const t = useTranslations("shopVehicles");
  const [vehicles, setVehicles] = useState<MyVehicle[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [page, setPage] = useState(1);
  const seek = useSeekHash("vehicle-");

  const load = useCallback(async () => {
    const { data } = await listMyVehicles(getSupabaseBrowserClient(), page);
    const found = (data ?? []) as MyVehicle[];
    // The last car on a later page was deleted: show the page before.
    if (found.length === 0 && page > 1) setPage(page - 1);
    // A search result names a car on a later page: look there.
    else if (seek(found.map((vehicle) => vehicle.id), page, MY_VEHICLES_PAGE_SIZE, found[0]?.total ?? 0)) setPage(page + 1);
    else setVehicles(found);
  }, [page, seek]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  useScrollToHash(vehicles !== null);

  return (
    <section aria-labelledby="shop-vehicles" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="shop-vehicles" className={headingClass}>{t("title")}</h2>
        {verified && !adding && <button type="button" onClick={() => setAdding(true)} className={primaryButton}>{t("add")}</button>}
      </div>
      <p className="text-sm text-muted-foreground">{t(verified ? "intro" : "needsVerification")}</p>
      {adding && (
        <div className={cardClass}>
          <Editor vehicle={null} onCancel={() => setAdding(false)} onDone={() => load().then(() => setAdding(false))} />
        </div>
      )}
      {vehicles && vehicles.length > 0 && (
        <ul className="grid gap-3">
          {vehicles.map((vehicle) => <VehicleItem key={vehicle.id} vehicle={vehicle} photoLimit={photoLimit} onChanged={load} />)}
        </ul>
      )}
      {vehicles && vehicles.length > 0 && <Pager page={page} total={vehicles[0].total} pageSize={MY_VEHICLES_PAGE_SIZE} onPage={setPage} label={t("pages")} />}
    </section>
  );
}

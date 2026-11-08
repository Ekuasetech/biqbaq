"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { useRef, useState, type ChangeEvent } from "react";
import { Notice } from "@/components/account/account-dashboard";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ACCEPTED_TYPES,
  makeMainPhoto,
  photoErrorKey,
  removeProductPhoto,
  uploadProductPhoto,
  type ShopPhoto,
} from "@/modules/media-management/client";

const smallButton =
  "rounded-md border border-border bg-card px-2 py-1 text-xs font-semibold outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-70";

export function ProductPhotos({
  productId,
  productName,
  photos,
  limit,
  readOnly,
  onChanged,
  actions,
}: {
  productId: string;
  productName: string;
  photos: ShopPhoto[];
  limit: number;
  readOnly: boolean;
  onChanged: () => Promise<void>;
  /** For photos of something other than a product, such as a cargo car. */
  actions?: { upload: (file: File) => Promise<void>; remove: (id: string) => Promise<void>; makeMain: (id: string) => Promise<void> };
}) {
  const t = useTranslations("shop.photos");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"uploading" | "changing" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function run(kind: "uploading" | "changing", action: () => Promise<unknown>) {
    setBusy(kind);
    setFailure(null);
    try {
      await action();
      await onChanged();
    } catch (error) {
      setFailure(photoErrorKey(error));
    }
    setBusy(null);
  }

  function chosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clearing it lets someone choose the same file again after a failure.
    event.target.value = "";
    if (file) void run("uploading", () => (actions ? actions.upload(file) : uploadProductPhoto(productId, file)));
  }

  async function makeMain(id: string) {
    if (actions) return actions.makeMain(id);
    const { error } = await makeMainPhoto(getSupabaseBrowserClient(), id);
    if (error) throw new Error(error.message);
  }

  return (
    <section aria-label={t("title")} className="mt-3 grid gap-2">
      <p className="text-xs text-muted-foreground">{t("count", { count: photos.length, max: limit })}</p>
      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {photos.map((photo, index) => (
            <li key={photo.id} className="grid w-28 gap-1">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                <Image src={photo.secure_url} alt={t("alt", { number: index + 1, name: productName })} fill sizes="112px" className="object-cover" />
              </div>
              {photo.is_primary && <p className="text-xs font-semibold">{t("main")}</p>}
              {!readOnly && (
                <>
                  {!photo.is_primary && (
                    <button type="button" disabled={busy !== null} onClick={() => void run("changing", () => makeMain(photo.id))} className={smallButton}>
                      {t("makeMain")}
                    </button>
                  )}
                  <button type="button" disabled={busy !== null} onClick={() => void run("changing", () => (actions ? actions.remove(photo.id) : removeProductPhoto(photo.id)))} className={smallButton}>
                    {t("remove")}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && photos.length < limit && (
        <div>
          <input
            ref={input}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            onChange={chosen}
            disabled={busy !== null}
            aria-label={t("add")}
            className="sr-only"
          />
          <button type="button" disabled={busy !== null} onClick={() => input.current?.click()} className={smallButton}>
            {busy === "uploading" ? t("uploading") : t("add")}
          </button>
          <p className="mt-1 text-xs text-muted-foreground">{t("help")}</p>
        </div>
      )}
      {failure && <Notice kind="error">{t(`errors.${failure}`)}</Notice>}
    </section>
  );
}

"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { cardClass, headingClass, Notice, primaryButton } from "@/components/account/account-dashboard";
import { SuperAdminOnly } from "@/components/admin/role-applications";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  findSetting,
  FORMATS,
  listSettingHistory,
  listSettings,
  parseSettingInput,
  SETTING_GROUPS,
  settingErrorKey,
  settingInputValue,
  updateSetting,
  type SettingChange,
  type SettingDefinition,
} from "@/modules/platform-configuration";
import { refreshCatalog } from "@/modules/product-catalog/actions";

const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-60";

function useShowValue() {
  const t = useTranslations("settings");
  return (setting: SettingDefinition | undefined, value: unknown): string => {
    if (typeof value === "boolean") return value ? t("on") : t("off");
    if (Array.isArray(value)) return value.map((format) => String(format).toUpperCase()).join(", ");
    if (setting?.kind === "megabytes") return `${settingInputValue(setting, value)} MB`;
    return String(value);
  };
}

function SettingRow({ setting, value, onSaved }: { setting: SettingDefinition; value: unknown; onSaved: () => Promise<void> }) {
  const t = useTranslations("settings");
  const show = useShowValue();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [on, setOn] = useState(false);
  const [formats, setFormats] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const label = t(`items.${setting.id}.label`);
  const inputId = `setting-${setting.id}`;

  function start() {
    setText(settingInputValue(setting, value));
    setOn(value === true);
    setFormats(Array.isArray(value) ? (value as string[]) : []);
    setReason("");
    setFailure(null);
    setEditing(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const parsed = parseSettingInput(setting, setting.kind === "toggle" ? on : setting.kind === "formats" ? formats : text);
    if (parsed === null || (Array.isArray(parsed) && parsed.length === 0)) {
      setFailure("invalidValue");
      return;
    }
    if (!reason.trim()) {
      setFailure("reasonRequired");
      return;
    }
    setSaving(true);
    setFailure(null);
    const { error } = await updateSetting(getSupabaseBrowserClient(), setting.key, parsed, reason);
    if (error) {
      setSaving(false);
      setFailure(settingErrorKey(error));
      return;
    }
    // Some settings change public pages. If this refresh fails, they catch up within about a minute.
    await refreshCatalog().catch(() => undefined);
    await onSaved();
    setSaving(false);
    setEditing(false);
  }

  return (
    <li className="grid gap-3 border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0" aria-label={label}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-sm text-muted-foreground">{t(`items.${setting.id}.help`)}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold" data-testid={`value-${setting.id}`}>{show(setting, value)}</span>
          {!editing && <button type="button" onClick={start} className={secondaryButton}>{t("change")}</button>}
        </div>
      </div>
      {editing && (
        <form onSubmit={save} noValidate className="grid gap-3 rounded-2xl bg-muted/50 p-4" aria-label={t("changeLabel", { name: label })}>
          {failure && <Notice kind="error">{t(`errors.${failure}`, { min: setting.min ?? 0, max: setting.max ?? 0 })}</Notice>}
          {setting.kind === "toggle" && (
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={on} onChange={(event) => setOn(event.target.checked)} className="size-4" />
              {t("turnOn")}
            </label>
          )}
          {(setting.kind === "number" || setting.kind === "megabytes") && (
            <div className="grid max-w-56 gap-1.5">
              <Label htmlFor={inputId}>{t(setting.kind === "megabytes" ? "newValueMegabytes" : "newValue")}</Label>
              <Input id={inputId} inputMode="decimal" value={text} onChange={(event) => setText(event.target.value)} className="h-11 text-base md:text-sm" />
              <p className="text-xs text-muted-foreground">{t("range", { min: setting.min ?? 0, max: setting.max ?? 0 })}</p>
            </div>
          )}
          {setting.kind === "formats" && (
            <fieldset className="flex flex-wrap gap-4">
              <legend className="mb-1.5 text-sm font-medium">{t("newValue")}</legend>
              {FORMATS.map((format) => (
                <label key={format} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formats.includes(format)}
                    onChange={(event) => setFormats(event.target.checked ? [...formats, format] : formats.filter((f) => f !== format))}
                    className="size-4"
                  />
                  {format.toUpperCase()}
                </label>
              ))}
            </fieldset>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={`${inputId}-reason`}>{t("reason")}</Label>
            <Textarea id={`${inputId}-reason`} value={reason} rows={2} maxLength={500} onChange={(event) => setReason(event.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className={primaryButton}>{saving ? t("saving") : t("save")}</button>
            <button type="button" onClick={() => setEditing(false)} className={secondaryButton}>{t("cancel")}</button>
          </div>
        </form>
      )}
    </li>
  );
}

function Settings() {
  const t = useTranslations("settings");
  const format = useFormatter();
  const show = useShowValue();
  const [values, setValues] = useState<Map<string, unknown> | null>(null);
  const [history, setHistory] = useState<SettingChange[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const [settings, changes] = await Promise.all([listSettings(supabase), listSettingHistory(supabase)]);
    if (settings.error || changes.error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setValues(new Map(settings.data.map((row) => [row.key as string, row.value as unknown])));
    setHistory(changes.data as SettingChange[]);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (failed) return <Notice kind="error">{t("errors.loadFailed")}</Notice>;
  if (!values) return <Skeleton className="h-64 rounded-3xl" />;

  return (
    <div className="grid gap-4">
      {SETTING_GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={`settings-${group.id}`} className={cardClass}>
          <h2 id={`settings-${group.id}`} className={headingClass}>{t(`groups.${group.id}.title`)}</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">{t(`groups.${group.id}.help`)}</p>
          <ul>
            {group.settings.filter((setting) => values.has(setting.key)).map((setting) => (
              <SettingRow key={setting.key} setting={setting} value={values.get(setting.key)} onSaved={load} />
            ))}
          </ul>
        </section>
      ))}
      <section aria-labelledby="settings-history" className={cardClass}>
        <h2 id="settings-history" className={headingClass}>{t("history.title")}</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("history.empty")}</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {history.map((change) => {
              const setting = findSetting(change.key);
              return (
                <li key={change.id} className="border-t border-border pt-3 text-sm first:border-t-0 first:pt-0">
                  <p className="font-semibold">{setting ? t(`items.${setting.id}.label`) : change.key}</p>
                  <p>{t("history.change", { from: show(setting, change.old_value), to: show(setting, change.new_value) })}</p>
                  {change.reason && <p className="break-words text-muted-foreground">{t("history.reason", { reason: change.reason })}</p>}
                  <p className="text-xs text-muted-foreground">
                    {t("history.who", {
                      name: change.actor_name ?? change.actor_email ?? t("history.unknown"),
                      date: format.dateTime(new Date(change.created_at), { dateStyle: "medium", timeStyle: "short" }),
                    })}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export function PlatformSettingsScreen() {
  return (
    <SuperAdminOnly>
      <Settings />
    </SuperAdminOnly>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { ApplicationCard, usePlatformPermissions } from "@/components/admin/role-applications";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { adminErrorKey, listRecentApplications, type AdminApplication } from "@/modules/role-management/admin";

/** The Super Admin dashboard's waiting applications. The database refuses anyone else. */
export function RecentApplications() {
  const t = useTranslations("account");
  const tAdmin = useTranslations("admin");
  const permissions = usePlatformPermissions();
  const [rows, setRows] = useState<AdminApplication[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<"approved" | "rejected" | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await listRecentApplications(getSupabaseBrowserClient());
    if (error) {
      setFailure(adminErrorKey(error));
      return;
    }
    setFailure(null);
    setRows(data as AdminApplication[]);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <section aria-labelledby="recent-applications" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="recent-applications" className="font-heading text-xl font-extrabold tracking-tight">{t("recentApplications")}</h2>
        <Link href="/admin/role-applications" className="text-sm font-semibold underline underline-offset-4">
          {t("viewAllApplications")}
        </Link>
      </div>
      {notice && <p role="status" className="text-sm">{tAdmin(`decision.${notice}`)}</p>}
      {failure && <p role="alert" className="text-sm text-destructive">{tAdmin(`errors.${failure}`)}</p>}
      {!rows && !failure && <Skeleton className="h-40 rounded-3xl" />}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">{t("noRecentApplications")}</p>}
      {rows && rows.length > 0 && (
        <ul className="grid gap-3">
          {rows.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              permissions={permissions}
              onDecided={(message) => {
                setNotice(message);
                void load();
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

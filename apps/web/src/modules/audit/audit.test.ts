import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { AUDIT_ACTIONS, auditActionMessageKey } from "./index";

const migrations = new URL("../../../../../supabase/migrations/", import.meta.url);

describe("AUDIT_ACTIONS", () => {
  it("has a label in both languages", () => {
    for (const action of AUDIT_ACTIONS) {
      const key = auditActionMessageKey(action) as keyof typeof en.auditLog.actions;
      expect(en.auditLog.actions[key], action).toBeTruthy();
      expect(fr.auditLog.actions[key], action).toBeTruthy();
    }
  });

  it("covers every action name the database writes", () => {
    const sql = readdirSync(migrations).map((file) => readFileSync(new URL(file, migrations), "utf8")).join("\n");
    const written = new Set<string>();
    for (const match of sql.matchAll(/write_audit\(\s*'([a-z_]+\.[a-z_]+)'/g)) written.add(match[1]);
    for (const match of sql.matchAll(/values \([^,]+, '([a-z_]+\.[a-z_]+)'/g)) written.add(match[1]);
    expect(written.size).toBeGreaterThan(10);
    for (const action of written) expect(AUDIT_ACTIONS, action).toContain(action);
  });
});

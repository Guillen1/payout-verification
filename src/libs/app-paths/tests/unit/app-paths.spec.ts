import type { FactoryProvider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { appPathsProvider, type AppPaths } from "../../app-paths";

const pathsFor = (env: Record<string, string>, headers: Record<string, string> = {}) =>
  (appPathsProvider as FactoryProvider<AppPaths>).useFactory(new ConfigService(env), { headers }) as AppPaths;

describe("appPathsProvider", () => {
  it("serves the business the page asks for", () => {
    expect(pathsFor({}, { "x-tenant": "brand-group" })).toMatchObject({
      tenant: "tenants/brand-group",
      data: "data/brand-group",
      out: "out/brand-group",
      evals: "out/evals"
    });
  });

  it("serves the agency network when the page names none", () => {
    expect(pathsFor({})).toMatchObject({ tenant: "tenants/agency-network", data: "data/demo", out: "out" });
  });

  it("refuses a business it does not know", () => {
    expect(() => pathsFor({}, { "x-tenant": "../secrets" })).toThrow(/No tenant/);
  });

  it("serves only the configured tenant when TENANT_DIR is set", () => {
    const paths = pathsFor(
      { TENANT_DIR: "/tmp/t", DATA_DIR: "/tmp/d", OUT_DIR: "/tmp/o" },
      { "x-tenant": "brand-group" }
    );
    expect(paths).toEqual({ tenant: "/tmp/t", data: "/tmp/d", out: "/tmp/o", evals: "/tmp/o/evals" });
  });
});

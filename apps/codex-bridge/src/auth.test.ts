import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { AuthService } from "./auth.js";
import { StateStore } from "./persistence.js";

describe("AuthService", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-phone-auth-"));
  const store = new StateStore(tempDir);
  const auth = new AuthService(store, 1_000, "123456");

  it("pairs a trusted device with a configured PIN", () => {
    const response = auth.pair("123456", "iPhone");
    expect(response?.deviceName).toBe("iPhone");
    expect(auth.validateToken(response?.token ?? null)?.deviceName).toBe("iPhone");
  });

  it("rejects a wrong PIN", () => {
    expect(auth.pair("654321", "Wrong phone")).toBeNull();
  });
});


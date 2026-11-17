import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetConfigCache, loadConfig } from "../src/config";

const ENV = ["JWT_SECRET", "OS_SERVICE_URL", "OS_SERVICE_KEY", "OS_SERVICE_TIMEOUT_MS"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  process.env.JWT_SECRET = "x".repeat(32);
  process.env.OS_SERVICE_URL = "https://kong.example.com/os";
  process.env.OS_SERVICE_KEY = "k";
  __resetConfigCache();
});

afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  __resetConfigCache();
});

describe("OS_SERVICE_TIMEOUT_MS", () => {
  it.each([
    ["-1", 5000],
    ["0", 5000],
    ["abc", 5000],
    ["1.5", 5000],
    ["3000000000", 5000],
    ["1500", 1500],
    ["2147483647", 2147483647],
  ])("%s -> %d", async (raw, esperado) => {
    process.env.OS_SERVICE_TIMEOUT_MS = raw;
    expect((await loadConfig()).osServiceTimeoutMs).toBe(esperado);
  });

  it("ausente -> 5000", async () => {
    delete process.env.OS_SERVICE_TIMEOUT_MS;
    expect((await loadConfig()).osServiceTimeoutMs).toBe(5000);
  });
});
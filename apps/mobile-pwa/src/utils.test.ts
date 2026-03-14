import { describe, expect, it, vi } from "vitest";
import { formatRelativeTime, truncatePath } from "./utils.js";

describe("utils", () => {
  it("formats recent times", () => {
    vi.setSystemTime(new Date("2026-03-14T10:00:00Z"));
    expect(formatRelativeTime(Date.parse("2026-03-14T09:30:00Z"))).toBe("30m ago");
    vi.useRealTimers();
  });

  it("truncates long paths", () => {
    expect(truncatePath("C:/Users/kiwun/Documents/laoek/project/src")).toBe(".../laoek/project/src");
  });
});

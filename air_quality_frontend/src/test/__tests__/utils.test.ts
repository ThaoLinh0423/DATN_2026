import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn() utility", () => {
  it("returns a single class unchanged", () => {
    expect(cn("foo")).toBe("foo");
  });

  it("merges multiple class strings", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("ignores falsy values", () => {
    expect(cn("foo", undefined, null, false, "bar")).toBe("foo bar");
  });

  it("handles conditional object syntax from clsx", () => {
    expect(cn({ foo: true, bar: false })).toBe("foo");
  });

  it("deduplicates Tailwind conflicting classes (tailwind-merge)", () => {
    // tailwind-merge should keep the last conflicting class
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("handles array of classes", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });

  it("returns empty string when no classes are provided", () => {
    expect(cn()).toBe("");
  });

  it("handles mixed arrays and strings", () => {
    const result = cn("base", ["extra"], { conditional: true });
    expect(result).toContain("base");
    expect(result).toContain("extra");
    expect(result).toContain("conditional");
  });
});

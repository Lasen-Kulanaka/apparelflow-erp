import { describe, it, expect } from "vitest";
import { computeStatus, approvalBlocker, wastagePct } from "../src/domain/verification.js";

describe("computeStatus (traffic light)", () => {
  it("GREEN when actual equals expected", () => expect(computeStatus(100, 100)).toBe("GREEN"));
  it("YELLOW when actual is above expected", () => expect(computeStatus(100, 101)).toBe("YELLOW"));
  it("RED when actual is below expected", () => expect(computeStatus(100, 99)).toBe("RED"));
  it("null when not counted yet", () => expect(computeStatus(100, null)).toBeNull());
});

describe("approvalBlocker (hard stop)", () => {
  const item = (name, expected, actual) => ({ component_name: name, expected_qty: expected, actual_qty: actual });

  it("allows approval when all match or exceed", () => {
    expect(approvalBlocker([item("A", 10, 10), item("B", 10, 12)])).toBeNull();
  });
  it("blocks on any shortage", () => {
    expect(approvalBlocker([item("A", 10, 10), item("Cuffs", 10, 9)])).toMatch(/Cuffs/);
  });
  it("blocks when a component is uncounted", () => {
    expect(approvalBlocker([item("A", 10, null)])).toMatch(/not counted/);
  });
  it("blocks when there are no components", () => {
    expect(approvalBlocker([])).not.toBeNull();
  });
});

describe("wastagePct", () => {
  it("matches the brief's formula", () => {
    // expected 1.8 x 50 = 90 yds; used 95.5 -> (5.5 / 90) x 100 = 6.11
    expect(wastagePct(95.5, 1.8, 50)).toBe(6.11);
  });
  it("is negative when less fabric was used than expected", () => {
    expect(wastagePct(85, 1.8, 50)).toBeLessThan(0);
  });
});
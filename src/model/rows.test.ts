import { describe, expect, it } from "vitest";
import defaultKit from "../kits/default.json";
import { kitRows, padDisplayOrder, padNumber } from "./types";
import type { Kit } from "./types";

describe("pad order", () => {
  it("numbers pads from bottom-left", () => {
    expect(padNumber(12)).toBe(1);
    expect(padNumber(13)).toBe(2);
    expect(padNumber(3)).toBe(16);
    expect(padDisplayOrder()).toEqual([3, 2, 1, 0, 7, 6, 5, 4, 11, 10, 9, 8, 15, 14, 13, 12]);
  });
  it("orders collapsed rows top to bottom, pad 1 last, reps by lowest index", () => {
    const rows = kitRows(defaultKit as Kit);
    const kit = defaultKit as Kit;
    expect(rows.map((r) => kit.slots[r.pad].role)).toEqual([
      "Crash", "High Tom", "Mid Tom", "Low Tom", "Ride", "Open Hat", "Closed Hat", "Snare", "Sidestick", "Cymbal", "Kick", "Crash 2",
    ]);
    expect(rows.find((r) => kit.slots[r.pad].role === "Kick")).toEqual({ pad: 13, pads: [13, 14] });
    expect(rows.find((r) => kit.slots[r.pad].role === "Closed Hat")).toEqual({ pad: 4, pads: [4, 6] });
  });
});

import { describe, expect, it } from "vitest";
import { RETIRED_SEEDS, fingerprint, mergeSeeds } from "./seeds";

const a1 = { id: "a", name: "A", hits: [{ pad: 1, step: 0 }] };
const a2 = { id: "a", name: "A", hits: [{ pad: 1, step: 0 }, { pad: 2, step: 4 }] };
const edited = { id: "a", name: "My A", hits: [{ pad: 1, step: 0 }] };

describe("fingerprint", () => {
  it("ignores key order and undefined fields", () => {
    expect(fingerprint({ x: 1, y: [1, 2] })).toBe(fingerprint({ y: [1, 2], x: 1, z: undefined }));
    expect(fingerprint(a1)).not.toBe(fingerprint(a2));
  });
});

describe("mergeSeeds", () => {
  it("copies missing seeds and records them", () => {
    const rec: Record<string, string> = {};
    const r = mergeSeeds([], [a1], rec);
    expect(r.list).toEqual([a1]);
    expect(r.changed).toBe(false);
    expect(rec.a).toBe(fingerprint(a1));
  });
  it("replaces an unedited copy when the seed changes", () => {
    const rec = { a: fingerprint(a1) };
    const r = mergeSeeds([a1], [a2], rec);
    expect(r.list).toEqual([a2]);
    expect(r.changed).toBe(true);
    expect(rec.a).toBe(fingerprint(a2));
  });
  it("keeps an edited copy", () => {
    const rec = { a: fingerprint(a1) };
    const r = mergeSeeds([edited], [a2], rec);
    expect(r.list).toEqual([edited]);
    expect(r.changed).toBe(false);
    expect(rec.a).toBe(fingerprint(a1));
  });
  it("adopts a pre-existing copy that still equals the seed", () => {
    const rec: Record<string, string> = {};
    const r = mergeSeeds([a1], [a1], rec);
    expect(r.changed).toBe(false);
    expect(rec.a).toBe(fingerprint(a1));
  });
  it("upgrades copies that match a retired fingerprint", () => {
    RETIRED_SEEDS.a = [fingerprint(a1)];
    try {
      const r = mergeSeeds([a1], [a2], {});
      expect(r.list).toEqual([a2]);
      expect(r.changed).toBe(true);
    } finally {
      delete RETIRED_SEEDS.a;
    }
  });
});

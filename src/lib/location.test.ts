import { describe, expect, it } from "vitest";
import { DECIMAL_PATTERN } from "@/lib/fields";
import { formatCoordinate, locationToRecord, parseLocation } from "@/lib/location";
import type { Location } from "@/lib/types";

describe("formatCoordinate", () => {
  it.each([
    [35.68123456789, "35.6812346"],
    [139, "139"],
    [-0.00000001, "0"],
    [1e-7, "0.0000001"],
    [-139.5, "-139.5"],
  ])("%s → %s", (n, expected) => {
    const s = formatCoordinate(n);
    expect(s).toBe(expected);
    expect(DECIMAL_PATTERN.test(s)).toBe(true);
  });
});

describe("parseLocation", () => {
  it("number を受ける (旧 record)", () => {
    expect(parseLocation({ latitude: 35.6812, longitude: 139.7671, altitude: 40 })).toEqual({
      latitude: 35.6812,
      longitude: 139.7671,
      altitude: 40,
    });
  });

  it("decimal string を受ける", () => {
    expect(parseLocation({ latitude: "35.6812362", longitude: "139.7671248" })).toEqual({
      latitude: 35.6812362,
      longitude: 139.7671248,
    });
  });

  it("number と string の混在を受ける", () => {
    expect(parseLocation({ latitude: "35.5", longitude: 139.5, altitude: "-3.25" })).toEqual({
      latitude: 35.5,
      longitude: 139.5,
      altitude: -3.25,
    });
  });

  it("範囲外・不正な必須値は null", () => {
    expect(parseLocation({ latitude: 91, longitude: 0 })).toBeNull();
    expect(parseLocation({ latitude: 0, longitude: -180.1 })).toBeNull();
    expect(parseLocation({ latitude: 0, longitude: "abc" })).toBeNull();
    expect(parseLocation({ latitude: "1e1", longitude: 0 })).toBeNull();
    expect(parseLocation({ latitude: NaN, longitude: 0 })).toBeNull();
  });

  it("altitude が不正なら altitude だけ落とす", () => {
    const loc = parseLocation({ latitude: 35, longitude: 139, altitude: "x" });
    expect(loc).toEqual({ latitude: 35, longitude: 139 });
    expect(loc && "altitude" in loc).toBe(false);
  });

  it("object でない・必須欠落は null", () => {
    expect(parseLocation(null)).toBeNull();
    expect(parseLocation(undefined)).toBeNull();
    expect(parseLocation([35, 139])).toBeNull();
    expect(parseLocation("35,139")).toBeNull();
    expect(parseLocation({ latitude: 35 })).toBeNull();
    expect(parseLocation({ longitude: 139 })).toBeNull();
  });
});

describe("locationToRecord", () => {
  it("decimal string で書く", () => {
    expect(locationToRecord({ latitude: 35.68123619, longitude: 139.76712477, altitude: 40 })).toEqual({
      latitude: "35.6812362",
      longitude: "139.7671248",
      altitude: "40",
    });
  });

  it("altitude が無ければキーを作らない", () => {
    const rec = locationToRecord({ latitude: 35, longitude: 139 });
    expect("altitude" in rec).toBe(false);
  });

  it("parseLocation と往復する", () => {
    const cases: Location[] = [
      { latitude: 35.68123456789, longitude: 139.76712345678, altitude: 12.3456789 },
      { latitude: -90, longitude: 180 },
      { latitude: -33.8688197, longitude: -151.2092955, altitude: -0.5 },
    ];
    for (const loc of cases) {
      const back = parseLocation(locationToRecord(loc));
      expect(back).not.toBeNull();
      expect(Math.abs(back!.latitude - loc.latitude)).toBeLessThanOrEqual(1e-7);
      expect(Math.abs(back!.longitude - loc.longitude)).toBeLessThanOrEqual(1e-7);
      if (loc.altitude === undefined) {
        expect("altitude" in back!).toBe(false);
      } else {
        expect(Math.abs(back!.altitude! - loc.altitude)).toBeLessThanOrEqual(1e-7);
      }
    }
  });
});

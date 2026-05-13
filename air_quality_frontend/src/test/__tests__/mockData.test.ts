import { describe, it, expect } from "vitest";
import { mockLocations, mockSensors, mockDustReadings, mockAlerts } from "@/data/mockData";

describe("mockData – data integrity", () => {
  // ── Locations ──────────────────────────────────────────────────────────────
  describe("mockLocations", () => {
    it("has at least one location", () => {
      expect(mockLocations.length).toBeGreaterThan(0);
    });

    it("each location has required fields with correct types", () => {
      mockLocations.forEach((loc) => {
        expect(typeof loc.id).toBe("number");
        expect(typeof loc.name).toBe("string");
        expect(loc.name.length).toBeGreaterThan(0);
        expect(typeof loc.latitude).toBe("number");
        expect(typeof loc.longitude).toBe("number");
        expect(typeof loc.created_at).toBe("string");
      });
    });

    it("latitude is in valid range (-90 to 90)", () => {
      mockLocations.forEach((loc) => {
        expect(loc.latitude).toBeGreaterThanOrEqual(-90);
        expect(loc.latitude).toBeLessThanOrEqual(90);
      });
    });

    it("longitude is in valid range (-180 to 180)", () => {
      mockLocations.forEach((loc) => {
        expect(loc.longitude).toBeGreaterThanOrEqual(-180);
        expect(loc.longitude).toBeLessThanOrEqual(180);
      });
    });

    it("ids are unique", () => {
      const ids = mockLocations.map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // ── Sensors ────────────────────────────────────────────────────────────────
  describe("mockSensors", () => {
    it("has at least one sensor", () => {
      expect(mockSensors.length).toBeGreaterThan(0);
    });

    it("each sensor has required fields", () => {
      mockSensors.forEach((s) => {
        expect(typeof s.id).toBe("number");
        expect(typeof s.sensor_code).toBe("string");
        expect(typeof s.sensor_name).toBe("string");
        expect(typeof s.location_id).toBe("number");
        expect(typeof s.sensor_type).toBe("string");
        expect(typeof s.measurement_type).toBe("string");
        expect(typeof s.brand).toBe("string");
        expect(["Đã kích hoạt", "Chưa kích hoạt", "Bảo trì"]).toContain(s.status);
      });
    });

    it("all location_ids reference existing locations", () => {
      const locationIds = new Set(mockLocations.map((l) => l.id));
      mockSensors.forEach((s) => {
        expect(locationIds.has(s.location_id)).toBe(true);
      });
    });

    it("sensor ids are unique", () => {
      const ids = mockSensors.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("sensor_codes are unique", () => {
      const codes = mockSensors.map((s) => s.sensor_code);
      expect(new Set(codes).size).toBe(codes.length);
    });
  });

  // ── DustReadings ──────────────────────────────────────────────────────────
  describe("mockDustReadings", () => {
    it("has readings", () => {
      expect(mockDustReadings.length).toBeGreaterThan(0);
    });

    it("each reading has valid numeric measurements", () => {
      mockDustReadings.forEach((r) => {
        expect(r.pm25).toBeGreaterThanOrEqual(0);
        expect(r.pm10).toBeGreaterThanOrEqual(0);
        expect(r.aqi).toBeGreaterThanOrEqual(0);
      });
    });

    it("pm10 is generally >= pm25", () => {
      // PM10 includes PM2.5 particles – in practice pm10 >= pm25
      mockDustReadings.forEach((r) => {
        expect(r.pm10).toBeGreaterThanOrEqual(r.pm25);
      });
    });
  });

  // ── Alerts ────────────────────────────────────────────────────────────────
  describe("mockAlerts", () => {
    it("has alerts", () => {
      expect(mockAlerts.length).toBeGreaterThan(0);
    });

    it("each alert has required fields", () => {
      mockAlerts.forEach((a) => {
        expect(typeof a.id).toBe("number");
        expect(typeof a.location_id).toBe("number");
        expect(typeof a.alert_type).toBe("string");
        expect(typeof a.message).toBe("string");
        expect(typeof a.is_active).toBe("boolean");
        expect(typeof a.created_at).toBe("string");
      });
    });

    it("alert ids are unique", () => {
      const ids = mockAlerts.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});

import { describe, expect, it } from "vitest";
import { fetchPowerHistory } from "../src/history";
import type { HassEntity, HomeAssistant } from "../src/types";

const start = new Date("2026-07-25T12:00:00Z");
const end = new Date("2026-07-26T12:00:00Z");
const ids = {
  solar: "sensor.solar",
  home: "sensor.home",
  battery: "sensor.battery"
};

function sample(entityId: string, value: number, time: Date): HassEntity {
  return {
    entity_id: entityId,
    state: String(value),
    last_changed: time.toISOString(),
    attributes: {}
  };
}

function minutesAfterStart(minutes: number): Date {
  return new Date(start.getTime() + minutes * 60 * 1000);
}

function reference(entityId: string): HassEntity {
  return {
    entity_id: entityId,
    state: "0",
    attributes: { unit_of_measurement: "W" }
  };
}

function hassWithHistory(history: HassEntity[][]): HomeAssistant {
  return {
    states: {
      [ids.solar]: reference(ids.solar),
      [ids.home]: reference(ids.home),
      [ids.battery]: reference(ids.battery)
    },
    async callApi<T>() {
      return history as T;
    }
  };
}

describe("power history", () => {
  it("converts recorded watts to kW", async () => {
    const hass = hassWithHistory([
      [sample(ids.solar, 2400, start)],
      [sample(ids.home, 1000, start)],
      [sample(ids.battery, -1200, start)]
    ]);

    const points = await fetchPowerHistory(hass, ids, end);
    expect(points).toHaveLength(24);
    for (const point of points) {
      expect(point.solar).toBe(2.4);
      expect(point.home).toBe(1);
      expect(point.battery).toBe(-1.2);
    }
  });

  it("holds each value until the next recorded change", async () => {
    // Idle overnight, then a load comes on near the end of the window. Home
    // Assistant records nothing in between, so the idle hours must stay at
    // zero instead of ramping toward the next recorded value.
    const loadOn = minutesAfterStart(20 * 60);
    const hass = hassWithHistory([
      [sample(ids.solar, 0, start), sample(ids.solar, 50, minutesAfterStart(21 * 60))],
      [sample(ids.home, 0, start), sample(ids.home, 80, loadOn)],
      [sample(ids.battery, 0, start), sample(ids.battery, -80, loadOn)]
    ]);

    const points = await fetchPowerHistory(hass, ids, end);
    const idle = points.filter((point) => point.timestamp < loadOn.getTime() - 60 * 60 * 1000);
    expect(idle.length).toBeGreaterThan(0);
    for (const point of idle) {
      expect(point.solar).toBe(0);
      expect(point.home).toBe(0);
      expect(point.battery).toBe(0);
    }
    expect(points.at(-1)?.solar).toBe(0.05);
    expect(points.at(-1)?.home).toBe(0.08);
    expect(points.at(-1)?.battery).toBe(-0.08);
  });

  it("includes changes that fall between chart points", async () => {
    // Points are about 63 minutes apart. A 40-minute load between two of them
    // would be missed by sampling, so each point averages the window around it.
    const pointSpacing = (24 * 60) / 23;
    const burstStart = minutesAfterStart(10 * pointSpacing + 10);
    const burstEnd = minutesAfterStart(10 * pointSpacing + 50);
    const hass = hassWithHistory([
      [sample(ids.solar, 0, start)],
      [sample(ids.home, 0, start), sample(ids.home, 80, burstStart), sample(ids.home, 0, burstEnd)],
      [sample(ids.battery, 0, start)]
    ]);

    const points = await fetchPowerHistory(hass, ids, end);
    expect(points[10].home).toBeGreaterThan(0);
    expect(points[11].home).toBeGreaterThan(0);
    expect(points[9].home).toBe(0);
    expect(points[12].home).toBe(0);
    const averagedEnergy = (points[10].home + points[11].home) * pointSpacing;
    expect(averagedEnergy).toBeCloseTo(0.08 * 40, 6);
  });
});

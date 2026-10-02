import { describe, expect, it } from "vitest";
import type { HassEntity } from "../src/types";
import {
  energyInKwh,
  estimateFullTime,
  formatEnergy,
  formatPower,
  formatValue,
  numericState,
  powerInKw
} from "../src/values";

function state(value: string, unit: string): HassEntity {
  return {
    entity_id: "sensor.test",
    state: value,
    attributes: { unit_of_measurement: unit }
  };
}

describe("entity values", () => {
  it("normalizes watts and watt-hours", () => {
    expect(powerInKw(state("5360", "W"))).toBe(5.36);
    expect(energyInKwh(state("21400", "Wh"))).toBe(21.4);
  });

  it("preserves kilowatt units and signs", () => {
    expect(powerInKw(state("-2.15", "kW"))).toBe(-2.15);
    expect(energyInKwh(state("6.8", "kWh"))).toBe(6.8);
  });

  it("distinguishes milli and mega prefixes", () => {
    expect(powerInKw(state("1.5", "MW"))).toBe(1500);
    expect(powerInKw(state("250000", "mW"))).toBe(0.25);
    expect(energyInKwh(state("2", "MWh"))).toBe(2000);
    expect(energyInKwh(state("500000", "mWh"))).toBe(0.5);
  });

  it("treats unavailable states as missing", () => {
    expect(numericState(state("unavailable", "W"))).toBeUndefined();
    expect(numericState(state("not-a-number", "W"))).toBeUndefined();
  });

  it("formats numbers with the supplied locale", () => {
    expect(formatValue(1234.5, "kW", { digits: 1, locale: "en-US" })).toBe(
      "1,234.5 kW"
    );
    expect(formatValue(1234.5, "kW", { digits: 1, locale: "de-DE" })).toBe(
      "1.234,5 kW"
    );
  });

  it("never shows a sign on values that round to zero", () => {
    expect(formatValue(-0.001, "kW", { locale: "en-US" })).toBe("0.00 kW");
    expect(formatValue(-0.001, "kW", { signed: true, locale: "en-US" })).toBe("0.00 kW");
  });
});

describe("scaled formatting", () => {
  it("shows power under 1 kW in watts", () => {
    expect(formatPower(0.043, { locale: "en-US" })).toBe("43 W");
    expect(formatPower(-0.08, { signed: true, locale: "en-US" })).toBe("-80 W");
    expect(formatPower(0.05, { signed: true, locale: "en-US" })).toBe("+50 W");
    expect(formatPower(0, { signed: true, locale: "en-US" })).toBe("0 W");
  });

  it("keeps kilowatts from 1 kW, including values that round up to it", () => {
    expect(formatPower(1.25, { locale: "en-US" })).toBe("1.25 kW");
    expect(formatPower(0.9996, { locale: "en-US" })).toBe("1.00 kW");
    expect(formatPower(-2.5, { signed: true, locale: "en-US" })).toBe("-2.50 kW");
  });

  it("shows energy under 1 kWh in watt-hours", () => {
    expect(formatEnergy(0.05, { locale: "en-US" })).toBe("50 Wh");
    expect(formatEnergy(0.2149, { locale: "en-US" })).toBe("215 Wh");
    expect(formatEnergy(6.8, { locale: "en-US" })).toBe("6.8 kWh");
  });

  it("keeps kilo units when auto scaling is off", () => {
    expect(formatPower(0.043, { locale: "en-US", autoScale: false })).toBe("0.04 kW");
    expect(formatEnergy(0.05, { locale: "en-US", autoScale: false })).toBe("0.1 kWh");
  });

  it("shows missing values as a dash", () => {
    expect(formatPower(undefined)).toBe("—");
    expect(formatEnergy(undefined)).toBe("—");
  });
});

describe("battery forecast", () => {
  it("estimates a full time from usable capacity and charge power", () => {
    const now = new Date("2026-07-26T12:00:00+10:00");
    const full = estimateFullTime(75, 2.5, 10, now);
    expect(full?.getTime()).toBe(now.getTime() + 60 * 60 * 1000);
  });

  it("does not forecast while idle or discharging", () => {
    expect(estimateFullTime(75, 0, 10)).toBeUndefined();
    expect(estimateFullTime(75, -2, 10)).toBeUndefined();
  });
});

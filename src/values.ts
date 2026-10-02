import type { HassEntity, HomeAssistant } from "./types";

const UNAVAILABLE_STATES = new Set(["unknown", "unavailable", "none", ""]);

export function numericState(entity: HassEntity | undefined): number | undefined {
  if (!entity || UNAVAILABLE_STATES.has(entity.state.toLowerCase())) return undefined;
  const value = Number(entity.state);
  return Number.isFinite(value) ? value : undefined;
}

// Powers of ten from each SI prefix to kilo. "m" (milli) and "M" (mega) differ
// only by case, so the prefix is matched case-sensitively for those two.
const KILO_EXPONENTS: Record<string, number> = {
  m: -6,
  "": -3,
  k: 0,
  M: 3,
  g: 6
};

function toKilo(
  entity: HassEntity | undefined,
  baseUnit: "w" | "wh"
): number | undefined {
  const value = numericState(entity);
  if (value === undefined) return undefined;

  const unit = entity?.attributes.unit_of_measurement?.replace(/\s/g, "") ?? "";
  if (!unit.toLowerCase().endsWith(baseUnit)) return value;

  const prefix = unit.slice(0, -baseUnit.length);
  const exponent =
    prefix === "m" || prefix === "M"
      ? KILO_EXPONENTS[prefix]
      : KILO_EXPONENTS[prefix.toLowerCase()];
  if (exponent === undefined) return value;
  // Divide for smaller prefixes so 21400 Wh is exactly 21.4 kWh.
  return exponent < 0 ? value / 10 ** -exponent : value * 10 ** exponent;
}

export function powerInKw(entity: HassEntity | undefined): number | undefined {
  return toKilo(entity, "w");
}

export function energyInKwh(entity: HassEntity | undefined): number | undefined {
  return toKilo(entity, "wh");
}

export function formatValue(
  value: number | undefined,
  unit: string,
  options: { signed?: boolean; digits?: number; locale?: string } = {}
): string {
  if (value === undefined) return "—";
  const digits = options.digits ?? 2;
  // Drop the sign from values that round to zero so they never show as "-0.00".
  const displayed = Number(value.toFixed(digits)) === 0 ? 0 : value;
  const formatted = new Intl.NumberFormat(options.locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: options.signed ? "exceptZero" : "auto"
  }).format(displayed);
  return `${formatted} ${unit}`;
}

interface ScaledFormatOptions {
  signed?: boolean;
  locale?: string;
  autoScale?: boolean;
}

// Shows values below one kilo unit in the base unit (W or Wh) when autoScale
// is on, falling back to the kilo unit once the rounded value reaches 1,000.
function formatScaled(
  kiloValue: number | undefined,
  units: { base: string; kilo: string; kiloDigits: number },
  options: ScaledFormatOptions
): string {
  const { autoScale = true, ...formatOptions } = options;
  if (kiloValue !== undefined && autoScale && Math.abs(Math.round(kiloValue * 1000)) < 1000) {
    return formatValue(kiloValue * 1000, units.base, { ...formatOptions, digits: 0 });
  }
  return formatValue(kiloValue, units.kilo, { ...formatOptions, digits: units.kiloDigits });
}

export function formatPower(kw: number | undefined, options: ScaledFormatOptions = {}): string {
  return formatScaled(kw, { base: "W", kilo: "kW", kiloDigits: 2 }, options);
}

export function formatEnergy(kwh: number | undefined, options: ScaledFormatOptions = {}): string {
  return formatScaled(kwh, { base: "Wh", kilo: "kWh", kiloDigits: 1 }, options);
}

export function entity(hass: HomeAssistant | undefined, entityId: string | undefined) {
  return entityId && hass ? hass.states[entityId] : undefined;
}

export function estimateFullTime(
  stateOfCharge: number | undefined,
  chargingPowerKw: number,
  capacityKwh: number | undefined,
  now = new Date()
): Date | undefined {
  if (
    stateOfCharge === undefined ||
    !capacityKwh ||
    capacityKwh <= 0 ||
    chargingPowerKw <= 0 ||
    stateOfCharge >= 100
  ) {
    return undefined;
  }

  const remainingKwh = ((100 - stateOfCharge) / 100) * capacityKwh;
  return new Date(now.getTime() + (remainingKwh / chargingPowerKw) * 60 * 60 * 1000);
}


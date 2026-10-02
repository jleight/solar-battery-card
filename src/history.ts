import type { HassEntity, HistoryPoint, HomeAssistant } from "./types";
import { powerInKw } from "./values";

type HistoryResponse = HassEntity[][];

interface PowerEntities {
  solar: string;
  home: string;
  battery: string;
}

const HISTORY_HOURS = 24;
const BUCKET_COUNT = 24;

function seriesByEntity(
  response: HistoryResponse,
  entityId: string
): HassEntity[] {
  return (
    response.find((series) => series.some((state) => state.entity_id === entityId)) ??
    []
  );
}

function normalizedPower(state: HassEntity | undefined, reference: HassEntity | undefined) {
  if (!state) return 0;
  return (
    powerInKw({
      ...state,
      attributes: {
        ...reference?.attributes,
        ...state.attributes
      }
    }) ?? 0
  );
}

// Home Assistant records a state only when it changes, so each value holds
// until the next recorded state rather than ramping toward it.
function averageOver(
  series: HassEntity[],
  from: number,
  to: number,
  reference: HassEntity | undefined
): number {
  if (series.length === 0) return 0;

  let value = normalizedPower(series[0], reference);
  let cursor = from;
  let total = 0;

  for (const state of series) {
    const stateTime = Date.parse(state.last_changed ?? state.last_updated ?? "");
    if (!Number.isFinite(stateTime)) continue;
    if (stateTime > cursor) {
      const until = Math.min(stateTime, to);
      total += value * (until - cursor);
      cursor = until;
      if (cursor >= to) break;
    }
    value = normalizedPower(state, reference);
  }

  if (cursor < to) total += value * (to - cursor);
  return to > from ? total / (to - from) : value;
}

export async function fetchPowerHistory(
  hass: HomeAssistant,
  entities: PowerEntities,
  now = new Date()
): Promise<HistoryPoint[]> {
  const end = now;
  const start = new Date(end.getTime() - HISTORY_HOURS * 60 * 60 * 1000);
  const entityIds = [entities.solar, entities.home, entities.battery];
  const path =
    `history/period/${encodeURIComponent(start.toISOString())}` +
    `?end_time=${encodeURIComponent(end.toISOString())}` +
    `&filter_entity_id=${encodeURIComponent(entityIds.join(","))}` +
    "&minimal_response&no_attributes&significant_changes_only=0";

  const response = await hass.callApi<HistoryResponse>("GET", path);
  const solar = seriesByEntity(response, entities.solar);
  const home = seriesByEntity(response, entities.home);
  const battery = seriesByEntity(response, entities.battery);

  const span = end.getTime() - start.getTime();
  const halfBucket = span / (BUCKET_COUNT - 1) / 2;

  return Array.from({ length: BUCKET_COUNT }, (_, index) => {
    const timestamp = start.getTime() + (index / (BUCKET_COUNT - 1)) * span;
    // Each point averages the window around it, so changes between points
    // still show up instead of being skipped.
    const from = Math.max(start.getTime(), timestamp - halfBucket);
    const to = Math.min(end.getTime(), timestamp + halfBucket);
    return {
      timestamp,
      solar: Math.max(0, averageOver(solar, from, to, hass.states[entities.solar])),
      home: Math.max(0, averageOver(home, from, to, hass.states[entities.home])),
      battery: averageOver(battery, from, to, hass.states[entities.battery])
    };
  });
}

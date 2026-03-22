import type { Scenario } from "./schemas.js";

// In-memory cache for the latest analysis result per scenario
const cache = new Map<string, Scenario>();

export function cacheScenario(scenario: Scenario): void {
  cache.set(scenario.id, scenario);
}

export function getCachedScenario(scenarioId: string): Scenario | undefined {
  return cache.get(scenarioId);
}

export function clearCache(scenarioId?: string): void {
  if (scenarioId) {
    cache.delete(scenarioId);
  } else {
    cache.clear();
  }
}
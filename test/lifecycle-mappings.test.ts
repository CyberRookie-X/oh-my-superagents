import { describe, it, expect } from "vitest";
import { CANONICAL_ROUTE_TO_LIFECYCLE_STAGE, LIFECYCLE_STAGE_TO_CANONICAL_ROUTE, deriveLifecycleStage, resolveLifecycleStageToCanonicalRoute } from "../src/lifecycle-mappings.js";

describe("CANONICAL_ROUTE_TO_LIFECYCLE_STAGE", () => {
  it("maps phase.plan to plan", () => expect(CANONICAL_ROUTE_TO_LIFECYCLE_STAGE["phase.plan"]).toBe("plan"));
  it("maps phase.brainstorm to design", () => expect(CANONICAL_ROUTE_TO_LIFECYCLE_STAGE["phase.brainstorm"]).toBe("design"));
});

describe("LIFECYCLE_STAGE_TO_CANONICAL_ROUTE", () => {
  it("maps design to phase.brainstorm", () => expect(LIFECYCLE_STAGE_TO_CANONICAL_ROUTE["design"]).toBe("phase.brainstorm"));
  it("maps plan to phase.plan", () => expect(LIFECYCLE_STAGE_TO_CANONICAL_ROUTE["plan"]).toBe("phase.plan"));
});

describe("deriveLifecycleStage", () => {
  it("returns execute_task for intent routes", () => expect(deriveLifecycleStage("intent.build")).toBe("execute_task"));
  it("returns design for phase.brainstorm", () => expect(deriveLifecycleStage("phase.brainstorm")).toBe("design"));
  it("returns bootstrap for unknown routes", () => expect(deriveLifecycleStage("phase.unknown" as any)).toBe("bootstrap"));
});

describe("resolveLifecycleStageToCanonicalRoute", () => {
  it("maps design to phase.brainstorm", () => expect(resolveLifecycleStageToCanonicalRoute("design")).toBe("phase.brainstorm"));
  it("returns undefined for unknown", () => expect(resolveLifecycleStageToCanonicalRoute("unknown" as any)).toBeUndefined());
});

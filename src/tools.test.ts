import { describe, it, expect } from "vitest";
import type { ToolDefinition } from "@barry-rocks/tools";
import * as tools from "./tools.js";

// Object.values() over a module namespace yields a union of every export
// (tools, but also re-exported classes), and a type predicate must be
// assignable to its parameter type. Widening to unknown first lets us narrow
// to just the tool definitions without naming that union.
const allTools = (Object.values(tools) as unknown[]).filter(
  (v): v is ToolDefinition & { handler: (args: never) => unknown } =>
    typeof v === "object" && v !== null && "name" in v && "handler" in v,
);

describe("tool exports", () => {
  it("exports at least one tool", () => {
    expect(allTools.length).toBeGreaterThan(0);
  });

  for (const tool of allTools) {
    describe(tool.name, () => {
      it("has required fields", () => {
        expect(tool.name).toBeTruthy();
        expect(tool.namespace).toBeTruthy();
        expect(typeof tool.handler).toBe("function");
        expect(tool.description).toBeTruthy();
      });
    });
  }
});

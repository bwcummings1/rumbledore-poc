import { InngestTestEngine } from "@inngest/test";
import { describe, expect, it } from "vitest";
import { JOB_EVENTS } from "./events";
import { appPing, functions } from "./index";

describe("appPing Inngest function", () => {
  it("runs through the Inngest test engine and records its step", async () => {
    const testEngine = new InngestTestEngine({ function: appPing });
    const event = {
      name: JOB_EVENTS.appPing,
      data: {
        message: "hello jobs",
        requestedAt: "2026-06-11T00:00:00.000Z",
      },
    };

    const stepRun = await testEngine.executeStep("build-ping-response", {
      events: [event],
    });

    expect(stepRun.result).toEqual({
      message: "hello jobs",
      requestedAt: "2026-06-11T00:00:00.000Z",
    });

    const { ctx, result } = await testEngine.execute({
      events: [event],
    });

    expect(result).toEqual({
      ok: true,
      eventName: JOB_EVENTS.appPing,
      message: "hello jobs",
      requestedAt: "2026-06-11T00:00:00.000Z",
    });
    expect(ctx.step.run).toHaveBeenCalledWith(
      "build-ping-response",
      expect.any(Function),
    );
  });

  it("is exported through the shared function registry", () => {
    expect(functions).toContain(appPing);
  });
});

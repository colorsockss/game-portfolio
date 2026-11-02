import { expect, test, vi } from "vitest";
import { createEventBus } from "../src/application/events.js";

interface Events {
  readonly ping: number;
  readonly other: string;
}

test("calls the handlers of a type in order, and only for what comes after they subscribe", () => {
  const events = createEventBus<Events>(console);
  const seen: string[] = [];
  events.emit("ping", 1);
  events.on("ping", value => seen.push(`a${value}`));
  events.on("ping", value => seen.push(`b${value}`));
  events.on("other", value => seen.push(value));
  events.emit("ping", 2);
  // 상태가 아니라서 같은 값도 날 때마다 알린다.
  events.emit("ping", 2);
  expect(seen).toEqual(["a2", "b2", "a2", "b2"]);
});

test("a handler stops once released, and releasing twice leaves the others", () => {
  const events = createEventBus<Events>(console);
  const seen: number[] = [];
  const handler = (value: number) => seen.push(value);
  const off = events.on("ping", handler);
  events.on("ping", handler);
  off();
  off();
  events.emit("ping", 1);
  expect(seen).toEqual([1]);
});

test("a handler that throws is logged and the rest still run", () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const events = createEventBus<Events>(logger);
  const seen: number[] = [];
  events.on("ping", () => {
    throw new Error("boom");
  });
  events.on("ping", value => seen.push(value));
  events.emit("ping", 1);
  expect(seen).toEqual([1]);
  expect(logger.error).toHaveBeenCalledWith("A ping handler failed:", expect.any(Error));
});

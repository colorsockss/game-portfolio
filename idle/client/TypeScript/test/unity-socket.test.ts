import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { SocketHandlers } from "../src/adapters/net/ports.js";
import { createSocketBridge, type SocketEvent } from "../src/unity/socket.js";

const Opened = 0;
const Message = 1;
const Closed = 2;

// TypeScript에서 보이는 WebSocketFacade. 소켓별 이벤트는 폴링될 때까지 큐에서 기다린다.
function fakeFacade() {
  const queues = new Map<number, SocketEvent[]>();
  const sent: { id: number; data: ArrayBuffer }[] = [];
  let polls = 0;
  let lastId = 0;
  const facade = {
    Opened, Message, Closed,
    Open: () => (queues.set(++lastId, []), lastId),
    Send: (id: number, data: ArrayBuffer) => void sent.push({ id, data }),
    Close: (id: number, code: number, reason: string) => void queues.get(id)?.push(event(Closed, { Code: code, Reason: reason })),
    Poll(id: number) {
      polls++;
      return queues.get(id)?.shift() ?? null;
    },
  };
  const push = (id: number, kind: number, fields: Partial<SocketEvent> = {}) => queues.get(id)!.push(event(kind, fields));
  return { facade, sent, push, polls: () => polls };
}

function event(Kind: number, fields: Partial<SocketEvent>): SocketEvent {
  return { Kind, Data: null, Code: 0, Reason: null, ...fields };
}

function recorder(): SocketHandlers & { events: unknown[] } {
  const events: unknown[] = [];
  return {
    events,
    onOpen: () => void events.push("open"),
    onMessage: data => void events.push([...data]),
    onClose: (code, reason) => void events.push(["close", code, reason]),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("hands each socket's events to its handlers, in order, on the next frame", () => {
  const fake = fakeFacade();
  const bridge = createSocketBridge(fake.facade);
  const first = recorder();
  const second = recorder();
  bridge.connect("ws://a", first);
  bridge.connect("ws://b", second);

  fake.push(1, Opened);
  fake.push(1, Message, { Data: new Uint8Array([1, 2]).buffer });
  fake.push(2, Closed, { Code: 1006, Reason: "refused" });
  expect(first.events).toEqual([]);
  vi.advanceTimersToNextTimer();
  expect(first.events).toEqual(["open", [1, 2]]);
  expect(second.events).toEqual([["close", 1006, "refused"]]);
});

test("polls only while a socket is open", () => {
  const fake = fakeFacade();
  const bridge = createSocketBridge(fake.facade);
  vi.advanceTimersByTime(100);
  expect(fake.polls()).toBe(0);

  const socket = bridge.connect("ws://a", recorder());
  vi.advanceTimersToNextTimer();
  expect(fake.polls()).toBe(1);

  socket.close(1000, "done");
  vi.advanceTimersToNextTimer();
  const afterClose = fake.polls();
  vi.advanceTimersByTime(100);
  expect(fake.polls()).toBe(afterClose);
  expect(vi.getTimerCount()).toBe(0);
});

test("sends whole buffers, copying a view out of a larger one", () => {
  const fake = fakeFacade();
  const socket = createSocketBridge(fake.facade).connect("ws://a", recorder());
  const whole = new Uint8Array([1, 2, 3]);
  socket.send(whole);
  socket.send(new Uint8Array([9, 8, 7, 6]).subarray(1, 3));

  expect(fake.sent[0].data).toBe(whole.buffer);
  expect([...new Uint8Array(fake.sent[1].data)]).toEqual([8, 7]);
});

test("a handler that throws holds back no other event", () => {
  const fake = fakeFacade();
  const bridge = createSocketBridge(fake.facade);
  const events = recorder();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  bridge.connect("ws://a", { ...events, onOpen: () => { throw new Error("broken"); } });

  fake.push(1, Opened);
  fake.push(1, Message, { Data: new Uint8Array([5]).buffer });
  vi.advanceTimersToNextTimer();
  expect(events.events).toEqual([[5]]);
  expect(error).toHaveBeenCalledOnce();
});

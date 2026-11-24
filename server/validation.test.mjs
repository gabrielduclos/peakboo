import { test } from "node:test";
import assert from "node:assert/strict";
import {
  roomInput,
  eventInput,
  messageInput,
  rsvpInput,
} from "./validation.mjs";
test("event cannot end before it starts", () => {
  assert.equal(
    eventInput.safeParse({
      title: "Café",
      startsAt: "2026-11-28T16:00:00-03:00",
      endsAt: "2026-11-28T15:00:00-03:00",
    }).success,
    false,
  );
});
test("timezones remain explicit and preserve the intended instant", () => {
  const e = eventInput.parse({
    title: "Café",
    startsAt: "2026-11-28T16:00:00-03:00",
    endsAt: "2026-11-28T17:00:00-03:00",
  });
  assert.equal(new Date(e.startsAt).toISOString(), "2026-11-28T19:00:00.000Z");
  assert.equal(
    eventInput.safeParse({ ...e, startsAt: "2026-11-28T16:00:00" }).success,
    false,
  );
});
test("empty or oversized messages cannot be stored", () => {
  for (const text of ["   ", "x".repeat(4001)])
    assert.equal(
      messageInput.safeParse({ id: crypto.randomUUID(), text }).success,
      false,
    );
});
test("room labels normalize whitespace and rsvp values are bounded", () => {
  assert.equal(roomInput.parse({ name: "  Amigos  " }).name, "Amigos");
  assert.equal(rsvpInput.safeParse({ status: "owner" }).success, false);
});

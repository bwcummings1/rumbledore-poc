if (
  typeof globalThis.PointerEvent === "undefined" &&
  typeof globalThis.MouseEvent !== "undefined"
) {
  class PointerEventShim extends globalThis.MouseEvent {
    pointerId = 1;
    pointerType = "mouse";
  }

  Object.defineProperty(globalThis, "PointerEvent", {
    configurable: true,
    value: PointerEventShim,
  });
}

/**
 * Node 26 ships its own `globalThis.localStorage`/`sessionStorage` accessors.
 * They are inert unless the process was started with `--localstorage-file`, in
 * which case reading them only emits an ExperimentalWarning and yields
 * `undefined`. Because Vitest's jsdom environment shares one object between
 * `window` and `globalThis`, those built-in accessors sit on top of jsdom's and
 * win, so `window.localStorage` is `undefined` in every jsdom test — anything
 * that persists a preference blows up with "Cannot read properties of undefined".
 *
 * jsdom still constructed its real `Storage` instances; they are reachable at
 * the internal `_localStorage` / `_sessionStorage` slots. Rebind the public
 * names to them so tests see the Web Storage the jsdom environment promises.
 * No-ops off jsdom and on Node versions without the built-ins.
 */
const globals = globalThis as unknown as Record<string, unknown>;
const StorageConstructor = globals.Storage;

for (const [publicName, jsdomSlot] of [
  ["localStorage", "_localStorage"],
  ["sessionStorage", "_sessionStorage"],
] as const) {
  if (typeof StorageConstructor !== "function") {
    break;
  }
  if (globals[publicName] !== undefined) {
    continue;
  }

  const jsdomStorage = globals[jsdomSlot];
  if (!(jsdomStorage instanceof StorageConstructor)) {
    continue;
  }

  Object.defineProperty(globalThis, publicName, {
    configurable: true,
    enumerable: true,
    get: () => jsdomStorage,
  });
}

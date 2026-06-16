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

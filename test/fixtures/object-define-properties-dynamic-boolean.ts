const obj: { value?: unknown } = {};
let enumerable = true;
Object.defineProperties(obj, {
  value: { value: "x", writable: true, enumerable, configurable: true }
});

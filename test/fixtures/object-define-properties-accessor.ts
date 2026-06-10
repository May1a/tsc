const obj: { value?: unknown } = {};
Object.defineProperties(obj, {
  value: { get() { return "x"; }, enumerable: true, configurable: true }
});

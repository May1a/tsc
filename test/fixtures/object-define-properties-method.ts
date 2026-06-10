const obj: { value?: unknown } = {};
Object.defineProperties(obj, {
  value() { return "x"; }
});

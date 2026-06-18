const obj: { value?: unknown } = {};
const value = { value: "x", writable: true, enumerable: true, configurable: true };
Object.defineProperties(obj, { value });

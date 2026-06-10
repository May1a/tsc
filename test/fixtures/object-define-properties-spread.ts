const obj: { value?: unknown } = {};
const descriptors = { value: { value: "x", writable: true, enumerable: true, configurable: true } };
Object.defineProperties(obj, { ...descriptors });

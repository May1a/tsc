/** The globals a program can read as values, each of which the runtime materializes on first use. */
const jsGlobalNames = [
  "process", "Buffer", "globalThis", "Symbol", "Object", "Reflect", "Array",
  "performance", "setTimeout", "clearTimeout",
  "BigInt", "Proxy", "Date", "RegExp", "Int32Array", "Uint32Array",
  "AbortController", "Intl", "Math", "String", "Number", "Boolean",
  "setInterval", "clearInterval",
  "Map", "Set", "WeakMap", "WeakSet", "Uint8Array", "Float64Array",
  "URL", "console", "JSON"
] as const;

export type JsGlobalName = (typeof jsGlobalNames)[number];

const jsGlobalsByName: ReadonlyMap<string, JsGlobalName> = new Map(jsGlobalNames.map((name) => [name, name]));

export function asJsGlobalName(name: string): JsGlobalName | undefined {
  return jsGlobalsByName.get(name);
}

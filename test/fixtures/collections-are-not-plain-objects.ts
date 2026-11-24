declare function print(value: unknown): void;

const map: any = new Map([["a", 1]]);
const set: any = new Set([1]);
let seen = "";
for (const key in map) { seen += key; }
print(seen + Object.keys(map).length + Object.values(set).length + Object.entries(map).length);
print(JSON.stringify({ map, list: [set] }));
print(Object.keys(Object.assign({}, map)).length);
print(Object.freeze(map).get("a"));
print(Object.prototype.hasOwnProperty.call(map, "a"));
print(String(map));

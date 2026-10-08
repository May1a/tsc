declare function print(value: unknown): void;
const map = new Map<string, number>();
map.set("a", 1);
map.set("b", 2);
for (const { length, "0": key, "1": value } of map) { print(length); print(key); print(value); }
for (const {} of map) { print("entry"); }
for (const [key, value] of map) { print(key); print(value); }

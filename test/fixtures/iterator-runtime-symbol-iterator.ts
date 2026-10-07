declare function print(value: unknown): void;

for (const value of [1, 2]) {
  print(value);
}
for (const character of "ab") {
  print(character);
}
const map = new Map<string, number>();
map.set("a", 1);
for (const entry of map) {
  print(entry[1]);
}
const set = new Set<string>();
set.add("x");
for (const value of set) {
  print(value);
}

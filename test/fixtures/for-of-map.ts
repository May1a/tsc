declare function print(value: unknown): void;

const map = new Map();
map.set("first", 1);
map.set("drop", 2);
map.set("third", 3);
print(map.delete("drop"));
map.set("fourth", 4);

for (const entry of map) {
  print(entry[0]);
  print(entry[1]);
}

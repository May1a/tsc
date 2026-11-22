declare function print(value: unknown): void;

const m = new Map<string, number>();
m.set("a", 1);
m.set("b", 2);
for (const entry of m.entries()) {
  print(entry[0] + "=" + entry[1]);
}

const s = new Set<string>();
s.add("x");
s.add("y");
for (const entry of s.entries()) {
  print(entry[0] + ":" + entry[1]);
}

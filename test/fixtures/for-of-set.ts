declare function print(value: unknown): void;

const set = new Set();
set.add("first");
set.add("second");
set.add("third");
print(set.delete("second"));
set.add("fourth");

for (const value of set) {
  print(value);
}

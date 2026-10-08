declare function print(value: unknown): void;

const arrays = [[1], [2, 3]];
for (const { length, "0": first } of arrays) { print(length); print(first); }

const strings = ["ab", "c", "é", "😀z"];
for (const { length, "0": { length: firstLength }, "2": third } of strings) {
  print(length);
  // A non-BMP character has two separately indexed UTF-16 code units.
  print(firstLength);
  print(third);
}

const nested = [["ab"], ["c"]];
for (const [{ length }] of nested) { print(length); }

// JSON can supply primitive values despite this static object type.
const primitives: { missing?: number }[] = JSON.parse("[1,true,false]");
for (const { missing = 9 } of primitives) { print(missing); }

declare function print(value: unknown): void;

// Surrogate pair U+1F600 (😀) must be one iteration step, not two code units.
const text = "a😀b";
for (const ch of text) {
  print(ch);
}

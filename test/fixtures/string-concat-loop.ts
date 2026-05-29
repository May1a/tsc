declare function print(value: unknown): void;

let s = "x";
for (let i = 0; i < 3; i = i + 1) {
  s = s + ".";
}
print(s);

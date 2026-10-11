declare function print(value: unknown): void;

for (let i = 0, s = "x"; i < 2; i = i + 1) {
  print(s);
}
for (let t: any; t === undefined; t = 1) {
  print("first");
  break;
}

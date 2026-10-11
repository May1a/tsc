declare function print(value: unknown): void;

let v: any = "x";
v = null;
if (v) {
  print(1);
} else {
  print(2);
}
let w: any = "loop";
w = 1;
while (w) {
  print(w);
  w = 0;
}
print("done");

declare function print(value: unknown): void;

function suffix() {
  return "!";
}

let s = "hi";
s = s + suffix();
print(s);

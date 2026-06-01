declare function print(value: unknown): void;

function check() {
  let s = "a";
  s = s + "b";
  if (s === "ab") {
    print(s);
  }
}

check();

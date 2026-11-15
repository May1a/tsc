declare function print(value: unknown): void;
function outer() {
  function read() { print(x); return null; }
  let [x = read()]: any = [];
  print(x);
}
outer();

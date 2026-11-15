declare function print(value: unknown): void;
function outer() {
  function read() { print(x); }
  read();
  const x = 1;
}
outer();

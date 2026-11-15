declare function print(value: unknown): void;
function outer() {
  for (let i = 0; i < 2; i++) {
    function read() { print(x); }
    let x = i;
    read();
  }
}
outer();

declare function print(value: unknown): void;

function lexical() {
  function read() { print(typeof x); }
  try { read(); } catch (error) { print(error instanceof ReferenceError); }
  let x: any = 1;
  read();
}
lexical();

function hoisted() {
  function read() { print(typeof x); }
  read();
  var x = 2;
  read();
}
hoisted();

function kinds() {
  const text = "text";
  let flag = true;
  const nil = null;
  const missing = undefined;
  const array = [1];
  const nan = NaN;
  const fn = () => 1;
  print(typeof text);
  print(typeof flag);
  print(typeof nil);
  print(typeof missing);
  print(typeof array);
  print(typeof nan);
  print(typeof fn);
}
kinds();

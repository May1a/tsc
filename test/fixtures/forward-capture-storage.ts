declare function print(value: unknown): void;
function f() {
  function g() { x = null; }
  let x: any = 1;
  g();
  print(x);
}
f();

function earlyWrite() {
  function write() { x = null; }
  try { write(); } catch (error) { print(error instanceof ReferenceError); }
  let x: any = 2;
  print(x);
  write();
  print(x);
}
earlyWrite();
function earlyRead() {
  function read() { print(x); }
  try { read(); } catch (error) { print(error instanceof ReferenceError); }
  let x: any = 3;
  read();
}
earlyRead();
function shadow() {
  let x: any = 4;
  {
    function change() { x = null; }
    let x: any = 5;
    change();
    print(x);
  }
  print(x);
}
shadow();

function rhsBeforeTdz() {
  let effects = 0;
  function rhs() { effects++; return null; }
  function write() { x = rhs(); }
  try { write(); } catch (error) { print(error instanceof ReferenceError); }
  print(effects);
  let x: any = null;
  write();
  print(effects);
  print(x);
}
rhsBeforeTdz();

function forwardVar() {
  function read() { print(x); }
  function write() { x = null; }
  read();
  var x: any = 8;
  write();
  read();
}
forwardVar();

function numericRead() {
  function read() { print(x); }
  try { read(); } catch (error) { print(error instanceof ReferenceError); }
  let x = 9;
  read();
}
numericRead();

function returningRead() {
  function read(): any { return x; }
  let x: any = 10;
  print(read());
}
returningRead();

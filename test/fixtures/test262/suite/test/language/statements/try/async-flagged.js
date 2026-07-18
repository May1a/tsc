/*---
description: An async-flagged test the synchronous harness must skip
flags: [async, generated]
---*/
async function f() {
  return 1;
}
f();

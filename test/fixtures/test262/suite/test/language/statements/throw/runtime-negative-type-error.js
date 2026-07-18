/*---
description: Iterating a non-iterable raises a TypeError
flags: [generated]
negative:
  phase: runtime
  type: TypeError
---*/
const iterable = {};
for (const value of iterable as any) {
  print(value);
}

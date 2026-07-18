/*---
description: A runtime negative must throw the declared error class
flags: [generated]
negative:
  phase: runtime
  type: TypeError
---*/
throw Test262Error("wrong error class");

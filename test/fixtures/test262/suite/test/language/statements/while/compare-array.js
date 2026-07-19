/*---
description: The compiler-owned compareArray include supports qualified and global calls
flags: [generated]
includes: [assert.js, compareArray.js]
---*/
assert.compareArray([1, NaN, -0], [1, NaN, -0]);
assert(compareArray(["a", "b"], ["a", "b"]));
assert(compareArray([0], [-0]) === false);

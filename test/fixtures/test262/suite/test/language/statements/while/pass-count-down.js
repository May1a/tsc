/*---
description: A while loop accumulates a countdown total
flags: [generated]
includes: [assert.js, sta.js]
---*/
let count = 3;
let total = 0;
while (count > 0) {
  total = total + count;
  count = count - 1;
}
assert(total === 6, "total accumulates 3 + 2 + 1");
assert(count === 0);

declare function print(value: unknown): void;

// Test262 head-lhs-let.js: parser recovery detaches the break from this loop.
var let;
for (let = 3; ;)
  break;
print(let);

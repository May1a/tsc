/*---
description: Own property keys enumerate integer-like keys first (property order differs from Node today)
flags: [generated]
---*/
print(JSON.stringify({ b: 1, 2: 3, a: 4, 1: 5 }));

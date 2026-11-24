/*---
description: Evaluating source text is a coverage gap
flags: [generated]
features: [for-in]
---*/
for (const key in eval("({ a: 1 })")) {
  print(key);
}

/*---
description: A malformed variable declaration is rejected at parse time
flags: [generated]
negative:
  phase: parse
  type: SyntaxError
---*/
$DONOTEVALUATE();
let x = ;

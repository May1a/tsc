// @ts-nocheck
function Factory(): any {
  let result = {};
  result = 1;
  return result;
}

// A primitive return is ignored, so the new object is the result.
print(typeof new Factory());

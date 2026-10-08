import { describe, expect, test } from "vitest";
import { scanSource } from "../../scripts/check-unchecked-object-access.mjs";

// The exact emitter template from PR #60, before the fix. Its receiver was an
// arbitrary loop item, so strings crashed and arrays used an object layout.
// eslint-disable-next-line no-template-curly-in-string -- This fixture contains TypeScript template source.
const originalAccess = 'return { lines: [...receiver.lines, ...key.lines, `  ${value} = call i64 @valueObjectGet(i64 ${receiver.value}, i64 ${key.length}, ptr ${key.value})`], value };';

describe("no-unchecked-object-access", () => {
  test("rejects the emitter that caused the for-of destructuring crash", () => {
    expect(scanSource(originalAccess)).toEqual([
      { rule: "no-unchecked-object-access", line: 1, column: 61 }
    ]);
  });

  test.each([
    'const line = "call i64 @valueObjectGet(i64 0, i64 1, ptr null)";',
    'const helper = "valueObjectGet"; emitGeneratedJsCall(helper, args, context);',
    'emitGeneratedJsCall("valueObjectGet", args, context);',
    'const helper = `valueObjectGet`;'
  ])("rejects alternate ways to emit the unchecked helper: %s", (source) => {
    expect(scanSource(source).map((finding) => finding.rule)).toEqual(["no-unchecked-object-access"]);
  });

  test("allows value-kind dispatch and ignores comments and longer symbol names", () => {
    expect(scanSource([
      '// valueObjectGet is reserved for static runtime IR.',
      'const name = "valueObjectGetter";',
      // eslint-disable-next-line no-template-curly-in-string -- This fixture contains TypeScript template source.
      'const line = `call i64 @valuePropertyGet(i64 ${receiver.value}, i64 1, ptr ${key})`;',
      'emitGeneratedJsCall("checkedValuePropertyGet", args, context);'
    ].join("\n"))).toEqual([]);
  });

  test("reports source locations in multiline files", () => {
    expect(scanSource('\nconst helper = "valueObjectGet";')).toEqual([
      { rule: "no-unchecked-object-access", line: 2, column: 16 }
    ]);
  });
});

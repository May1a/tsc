import { describe, expect, test } from "vitest";
import { scanDeadExports } from "../../scripts/check-dead-exports.mjs";

describe("no-dead-export check", () => {
  test("flags an exported declaration with no importer", () => {
    const findings = scanDeadExports({
      "/repo/src/dead.ts": "export function orphan(): number { return 1; }\nexport type UnusedType = string;\n",
      "/repo/src/main.ts": "export const entry = 42;\n"
    }, {
      checkedFiles: ["/repo/src/dead.ts"],
      entryFiles: ["/repo/src/main.ts"]
    });
    expect(findings.map((finding) => finding.message)).toEqual([
      "Export 'orphan' is never imported by any module or test. Remove 'export' or delete it.",
      "Export 'UnusedType' is never imported by any module or test. Remove 'export' or delete it."
    ]);
  });

  test("accepts exports imported directly or through a barrel", () => {
    const findings = scanDeadExports({
      "/repo/src/leaf.ts": "export function helper(): number { return 1; }\nexport type HelperType = number;\n",
      "/repo/src/index.ts": "export { helper, type HelperType } from './leaf.js';\n",
      "/repo/test/leaf.test.ts": "import { helper, type HelperType } from '../src/index.js';\nconst x: HelperType = helper();\nvoid x;\n"
    }, {
      checkedFiles: ["/repo/src/leaf.ts"],
      entryFiles: []
    });
    expect(findings).toEqual([]);
  });
});

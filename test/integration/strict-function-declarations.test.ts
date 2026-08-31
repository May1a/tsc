import { compileFixture, expectSuccessfulCompile } from "./helpers.js";
import { describe, expect, test } from "vitest";

// Issue #43: function declarations in positions the ECMAScript grammar forbids
// (iteration-statement bodies, catch-parameter redeclaration) are early errors
// that the TypeScript parser accepts, so the frontend must reject them itself.
const expectInvalidFunctionDeclaration = async (fixture: string, message: string): Promise<void> => {
  const result = await compileFixture(fixture);

  try {
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("error TSCN1004");
    expect(result.stderr).toContain(message);
  } finally {
    await result.cleanup();
  }
};

describe("tscn strict-mode function declaration early errors", () => {
  test("rejects a function declaration used directly as a while body", async () => {
    await expectInvalidFunctionDeclaration(
      "while-decl-function-body.ts",
      "A function declaration cannot be used directly as the body of a while statement"
    );
  });

  test("rejects a function declaration used directly as a do-while body", async () => {
    await expectInvalidFunctionDeclaration(
      "do-while-decl-function-body.ts",
      "A function declaration cannot be used directly as the body of a do-while statement"
    );
  });

  test("rejects a function declaration used directly as a for body", async () => {
    await expectInvalidFunctionDeclaration(
      "for-decl-function-body.ts",
      "A function declaration cannot be used directly as the body of a for statement"
    );
  });

  test("rejects a function declaration used directly as an if body", async () => {
    await expectInvalidFunctionDeclaration(
      "if-decl-function-body.ts",
      "A function declaration cannot be used directly as the body of an if statement"
    );
  });

  test("rejects a function declaration used directly as an else body", async () => {
    await expectInvalidFunctionDeclaration(
      "else-decl-function-body.ts",
      "A function declaration cannot be used directly as the body of an if statement"
    );
  });

  test("rejects a catch parameter redeclared by a directly nested function declaration", async () => {
    await expectInvalidFunctionDeclaration(
      "catch-param-function-redeclare.ts",
      "Catch parameter 'e' cannot be redeclared by a directly nested function declaration"
    );
  });

  test("accepts function declarations nested in a try block with a non-colliding catch parameter", async () => {
    const result = await expectSuccessfulCompile("nested-function-in-try.ts");
    await result.cleanup();
  });
});

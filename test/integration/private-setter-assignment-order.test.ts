import { test } from "vitest";
import { expectNativeBehaviorIfAvailable, expectSuccessfulCompile } from "./helpers.js";

test("private setter assignment evaluates the RHS before checking the receiver brand", async () => {
  const result = await expectSuccessfulCompile("private-setter-assignment-order.ts", { link: true });
  try {
    await expectNativeBehaviorIfAvailable(result, {
      status: 0,
      stdout: "rhs\nTypeError\nrhs\nsetter\n1\n",
      stderr: ""
    });
  } finally {
    await result.cleanup();
  }
});

test("private setter assignment captures its receiver once and preserves operand exceptions", async () => {
  const result = await expectSuccessfulCompile("private-setter-assignment-effects.ts", { link: true });
  try {
    await expectNativeBehaviorIfAvailable(result, {
      status: 0,
      stdout: "change\noriginal\n2\nchange\nTypeError\nreceiver\nrhs\noriginal\n3\n"
        + "invalid receiver\nthrowing rhs\nrhs error\nthrowing receiver\nreceiver error\n",
      stderr: ""
    });
  } finally {
    await result.cleanup();
  }
});

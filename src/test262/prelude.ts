import type { Expectation } from "./types.js";

// Marker lines printed by the negative-runtime wrapper when the observed throw
// does not match the declared expectation. Kept distinctive so they cannot be
// mistaken for test output.
export const unexpectedThrowMarker = "__T262_UNEXPECTED_THROW__";
export const missingThrowMarker = "__T262_MISSING_THROW__";

// Compiler-owned minimal assertion prelude. It mirrors the Test262 `sta.js` /
// `assert.js` subset that fits the supported synchronous surface: a standalone
// test error, `$ERROR`, and bare `assert(...)` calls with optional messages.
// Wider assertion APIs (assert.sameValue, assert.throws, ...) are not yet
// expressible within the supported surface; tests using them surface as
// coverage gaps instead of being approximated.
//
// The prelude must stay behaviorally identical under tscn and Node: it is fed
// unchanged to both sides of the correctness oracle.
export const assertionPrelude = `declare function print(value: unknown): void;

function Test262Error(message: any): any {
  const error = new Error(message);
  error.name = "Test262Error";
  return error;
}

function $ERROR(...args: any[]): any {
  throw Test262Error(args[0]);
}

function assert(...args: any[]): void {
  if (args[0] !== true) {
    throw Test262Error(args[1]);
  }
}
`;

// Compiler options for the assembled entry module. Test262 sources are plain
// JavaScript, so type checking is relaxed to keep TS strictness from rejecting
// valid JS; `types: []` keeps ambient @types packages from the host checkout
// from leaking into the program.
export const assembledTsConfig = JSON.stringify(
  {
    compilerOptions: {
      module: "NodeNext",
      moduleResolution: "NodeNext",
      target: "ES2022",
      strict: false,
      skipLibCheck: true,
      types: []
    }
  },
  undefined,
  2
);

const assembleNegativeRuntime = (source: string, errorName: string): string => {
  const expected = JSON.stringify(errorName);
  return `try {
${source}
  print(${JSON.stringify(missingThrowMarker)});
} catch (__t262Error) {
  if (__t262Error === null) {
    print(${JSON.stringify(unexpectedThrowMarker)});
  }
  if (__t262Error === undefined) {
    print(${JSON.stringify(unexpectedThrowMarker)});
  }
  if (__t262Error !== null) {
    if (__t262Error !== undefined) {
      if (__t262Error.name !== ${expected}) {
        print(${JSON.stringify(unexpectedThrowMarker)});
      }
    }
  }
}
`;
};

/**
 * Materializes the entry module for a selected test: the assertion prelude
 * followed by the test source. Runtime-negative tests are wrapped so the
 * thrown error class is observed through stdout on both sides of the oracle.
 * The identical assembled source is fed to tscn and to Node.
 */
export const assembleEntry = (source: string, expectation: Expectation): string => {
  if (expectation.kind === "negative-runtime") {
    return `${assertionPrelude}\n${assembleNegativeRuntime(source, expectation.errorName)}`;
  }
  return `${assertionPrelude}\n${source}\n`;
};

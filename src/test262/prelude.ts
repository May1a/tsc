import ts from "typescript";
import type { Expectation } from "./types.js";

// Marker lines printed by the negative-runtime wrapper when the observed throw
// does not match the declared expectation. Kept distinctive so they cannot be
// mistaken for test output.
export const unexpectedThrowMarker = "__T262_UNEXPECTED_THROW__";
export const missingThrowMarker = "__T262_MISSING_THROW__";

// Compiler-owned minimal assertion prelude. Test262's function-property API is
// rewritten to these identifier calls because function properties are outside
// the current lowering surface. Both oracle sides receive the same source.
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

function __t262SameValue(...args: any[]): void {
  if (Object.is(args[0], args[1])) {
  } else {
    throw Test262Error(args[2]);
  }
}

function __t262NotSameValue(...args: any[]): void {
  if (Object.is(args[0], args[1])) {
    throw Test262Error(args[2]);
  }
}

function __t262Throws(...args: any[]): void {
  let caught = false;
  const callback = args[1];
  try {
    callback();
  } catch (thrown) {
    caught = true;
    if (thrown === null) {
      throw Test262Error(args[2]);
    }
    if (thrown === undefined) {
      throw Test262Error(args[2]);
    }
    if (thrown.constructor !== args[0]) {
      throw Test262Error(args[2]);
    }
  }
  if (caught === false) {
    throw Test262Error(args[2]);
  }
}
`;

const assertionMethodNames = new Map([
  ["sameValue", "__t262SameValue"],
  ["notSameValue", "__t262NotSameValue"],
  ["throws", "__t262Throws"]
]);

type SourceReplacement = {
  readonly start: number;
  readonly end: number;
  readonly text: string;
};

const rewriteAssertionCalls = (source: string): string => {
  const sourceFile = ts.createSourceFile("test262.js", source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  const replacements: SourceReplacement[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "assert"
    ) {
      const replacement = assertionMethodNames.get(node.expression.name.text);
      if (replacement !== undefined) {
        replacements.push({
          start: node.expression.getStart(sourceFile),
          end: node.expression.end,
          text: replacement
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  let rewritten = source;
  for (const replacement of replacements.toSorted((left, right) => right.start - left.start)) {
    rewritten = `${rewritten.slice(0, replacement.start)}${replacement.text}${rewritten.slice(replacement.end)}`;
  }
  return rewritten;
};

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
  const rewrittenSource = rewriteAssertionCalls(source);
  if (expectation.kind === "negative-runtime") {
    return `${assertionPrelude}\n${assembleNegativeRuntime(rewrittenSource, expectation.errorName)}`;
  }
  return `${assertionPrelude}\n${rewrittenSource}\n`;
};

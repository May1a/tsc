import type { Expectation } from "./types.js";
import ts from "typescript";

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
  error.constructor = Test262Error;
  return error;
}

function $ERROR(...args: any[]): any {
  throw Test262Error(args[0]);
}

function $DONOTEVALUATE(): void {
  throw Test262Error("Test262 code marked $DONOTEVALUATE was evaluated");
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

function compareArray(...args: any[]): boolean {
  if (args.length !== 2) {
    throw Test262Error("compareArray requires exactly two arguments");
  }
  const actual = args[0];
  const expected = args[1];
  if (actual.length !== expected.length) {
    return false;
  }
  for (let index = 0; index < actual.length; index = index + 1) {
    if (Object.is(actual[index], expected[index])) {
    } else {
      return false;
    }
  }
  return true;
}

function __t262CompareArray(...args: any[]): void {
  if (args.length !== 2) {
    if (args.length !== 3) {
      throw Test262Error("assert.compareArray requires two or three arguments");
    }
  }
  // Keep this loop inline: calling a boolean-returning prelude helper from an
  // if condition is outside the compiler's current lowering subset.
  const actual = args[0];
  const expected = args[1];
  if (actual.length !== expected.length) {
    throw Test262Error(args[2]);
  }
  for (let index = 0; index < actual.length; index = index + 1) {
    if (Object.is(actual[index], expected[index])) {
    } else {
      throw Test262Error(args[2]);
    }
  }
}

function verifyProperty(obj: any, name: any, desc: any, ...options: any[]): boolean {
  if (options.length !== 0) {
    throw Test262Error("verifyProperty options are unsupported");
  }
  const key = String(name);
  // A one-element box materializes generic object parameters as aggregate
  // references for the descriptor operations supported by the compiler.
  const objectBox = [obj];
  const target = objectBox[0];
  if (desc === undefined) {
    if (Object.hasOwn(target, key)) {
      throw Test262Error("Expected property descriptor to be undefined");
    }
    return true;
  }
  if (desc === null) {
    throw Test262Error("Descriptor must be an object or undefined");
  }
  if (Object.hasOwn(target, key)) {
  } else {
    throw Test262Error("Expected an own property");
  }
  const originalDesc = Object.getOwnPropertyDescriptor(target, key);
  if (Object.hasOwn(desc, "get")) {
    throw Test262Error("Unsupported descriptor field");
  }
  if (Object.hasOwn(desc, "set")) {
    throw Test262Error("Unsupported descriptor field");
  }
  const fields = Object.keys(desc);
  let expectedFields = 0;
  if (Object.hasOwn(desc, "value")) {
    expectedFields = expectedFields + 1;
  }
  if (Object.hasOwn(desc, "writable")) {
    expectedFields = expectedFields + 1;
  }
  if (Object.hasOwn(desc, "enumerable")) {
    expectedFields = expectedFields + 1;
  }
  if (Object.hasOwn(desc, "configurable")) {
    expectedFields = expectedFields + 1;
  }
  if (fields.length !== expectedFields) {
    throw Test262Error("Unsupported descriptor field");
  }
  if (Object.hasOwn(desc, "value")) {
    if (Object.is(desc.value, originalDesc.value)) {
    } else {
      throw Test262Error("Unexpected descriptor value");
    }
    if (Object.is(desc.value, target[key])) {
    } else {
      throw Test262Error("Unexpected property value");
    }
  }
  if (Object.hasOwn(desc, "writable")) {
    if (desc.writable !== undefined) {
      if (desc.writable === originalDesc.writable) {
      } else {
        throw Test262Error("Unexpected writable descriptor attribute");
      }
      if (desc.writable === true) {
        // Snapshot before mutation; a direct binding may be re-read after the
        // write by the current lowering slice instead of retaining the value.
        const originalValueBox = [target[key]];
        const newValue: any = 42;
        target[key] = newValue;
        if (Object.is(target[key], newValue)) {
        } else {
          throw Test262Error("Unexpected writable property behavior");
        }
        target[key] = originalValueBox[0];
      }
    }
  }
  if (Object.hasOwn(desc, "enumerable")) {
    if (desc.enumerable !== undefined) {
      if (desc.enumerable === originalDesc.enumerable) {
      } else {
        throw Test262Error("Unexpected enumerable descriptor attribute");
      }
      // Upstream propertyHelper.js isEnumerable() probes enumerability
      // behaviorally: a for...in traversal plus an own propertyIsEnumerable
      // check. Generic object parameters are boxed values, which for...in and
      // propertyIsEnumerable do not lower over, so the own enumerable entries
      // are materialized into a runtime object first; the traversal then
      // checks the same own-enumerable set upstream's probe checks.
      const enumerableEntries = Object.entries(target);
      const enumerableTarget = Object.fromEntries(enumerableEntries);
      let enumerable = false;
      for (const forInKey in enumerableTarget) {
        if (forInKey === key) {
          enumerable = true;
        }
      }
      if (enumerable === true) {
        if (enumerableTarget.propertyIsEnumerable(key)) {
        } else {
          enumerable = false;
        }
      }
      if (desc.enumerable === enumerable) {
      } else {
        throw Test262Error("Unexpected enumerable property behavior");
      }
    }
  }
  if (Object.hasOwn(desc, "configurable")) {
    if (desc.configurable !== undefined) {
      if (desc.configurable === originalDesc.configurable) {
      } else {
        throw Test262Error("Unexpected configurable descriptor attribute");
      }
      if (desc.configurable === true) {
        delete target[key];
        if (Object.hasOwn(target, key)) {
          throw Test262Error("Unexpected configurable property behavior");
        }
      }
    }
  }
  return true;
}

function verifyEqualTo(obj: any, name: any, value: any): void {
  const key = String(name);
  if (Object.is(obj[key], value)) {
  } else {
    throw Test262Error("Unexpected property value");
  }
}

function verifyWritable(obj: any, name: any): void {
  const key = String(name);
  const objectBox = [obj];
  const target = objectBox[0];
  const originalValueBox = [target[key]];
  const newValue: any = 42;
  target[key] = newValue;
  if (Object.is(target[key], newValue)) {
  } else {
    throw Test262Error("Expected a writable property");
  }
  target[key] = originalValueBox[0];
}

function verifyNotWritable(obj: any, name: any): void {
  const key = String(name);
  const descriptor = Object.getOwnPropertyDescriptor(obj, key);
  if (descriptor.writable === true) {
    throw Test262Error("Expected a non-writable property descriptor");
  }
}

function verifyEnumerable(obj: any, name: any): void {
  const key = String(name);
  const descriptor = Object.getOwnPropertyDescriptor(obj, key);
  if (descriptor.enumerable === true) {
  } else {
    throw Test262Error("Expected an enumerable property descriptor");
  }
  const enumerableKeys = Object.keys(obj);
  if (enumerableKeys.includes(key) === true) {
  } else {
    throw Test262Error("Expected an enumerable property");
  }
}

function verifyNotEnumerable(obj: any, name: any): void {
  const key = String(name);
  const descriptor = Object.getOwnPropertyDescriptor(obj, key);
  if (descriptor.enumerable === true) {
    throw Test262Error("Expected a non-enumerable property descriptor");
  }
  const enumerableKeys = Object.keys(obj);
  if (enumerableKeys.includes(key) === true) {
    throw Test262Error("Expected a non-enumerable property");
  }
}

function verifyConfigurable(obj: any, name: any): void {
  const key = String(name);
  const objectBox = [obj];
  const target = objectBox[0];
  delete target[key];
  if (Object.hasOwn(target, key)) {
    throw Test262Error("Expected a configurable property");
  }
}

function verifyNotConfigurable(obj: any, name: any): void {
  const key = String(name);
  const descriptor = Object.getOwnPropertyDescriptor(obj, key);
  if (descriptor.configurable === true) {
    throw Test262Error("Expected a non-configurable property descriptor");
  }
}
`;

const assertionMethodNames = new Map([
  ["sameValue", "__t262SameValue"],
  ["notSameValue", "__t262NotSameValue"],
  ["throws", "__t262Throws"],
  ["compareArray", "__t262CompareArray"]
]);

interface SourceReplacement {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

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

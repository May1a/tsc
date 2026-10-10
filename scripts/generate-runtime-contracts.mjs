import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const scalarTypes = new Set(["void", "i1", "i8", "i32", "i64", "double", "ptr"]);
// i64 also carries JSValue. Only these audited symbols return an unboxed integer.
const scalarWordFunctions = new Set([
  "valueArrayLength", "arrayLength", "arrayIndexOf", "arrayLastIndexOf", "arrayFindIndex", "arrayPush", "arrayUnshift",
  "collectionSize", "collectionFind", "strtol", "strlen", "gcRootSave", "gcStatsLiveBytes", "gcStatsCollections",
  "jsonHex4", "regexAtomEnd", "regexDecodeUtf8", "regexAtomStep", "regexCaptureIndex", "regexGroupEnd",
  "regexMatchHere", "regexMatchAlternatives", "regexByteOffset", "regexFind", "stringTrimStartIndex", "stringTrimEndIndex",
  "stringUtf16Length", "valueStringLength", "valueLength", "propertyKeyIndex", "numberToIndex"
]);
const externalPointerFunctions = new Set(["malloc", "memcpy", "getenv", "indexToString", "strConcat", "arrayJoin"]);
const borrowedPointerFunctions = new Set([
  "valueArrayPtr", "valueObjectPtr", "valueFunctionPtr", "valueStringPtr", "objectGetPrototype", "arrayGetPrototype"
]);
// These foreign functions cannot enter the compiler's collector. Unknown declarations may.
const nonGcForeignFunctions = new Set([
  "malloc", "memcpy", "memcmp", "sprintf", "getenv", "strtol", "free", "strtod", "strlen",
  "llvm.fabs.f64", "llvm.floor.f64", "llvm.ceil.f64", "llvm.trunc.f64", "llvm.round.f64",
  "llvm.sqrt.f64", "llvm.pow.f64", "llvm.exp.f64", "llvm.log.f64", "llvm.log2.f64",
  "llvm.log10.f64", "llvm.sin.f64", "llvm.cos.f64", "llvm.ctlz.i32",
  "valueBoxNumber", "valueBoxObject", "valueNumber", "puts", "printf", "exit"
]);

/** @typedef {{ file: string, name: string, returns: string, parameters: string[], variadic: boolean, callees: string[], allocates: boolean, collects: boolean }} RuntimeFunction */

/** @param {string} type */
function typeExpression(type) {
  const normalized = type.trim();
  if (scalarTypes.has(normalized)) {
    return `llvm.${normalized}`;
  }
  if (normalized.startsWith("{") && normalized.endsWith("}")) {
    return `llvm.struct([${normalized.slice(1, -1).split(",").map(typeExpression).join(", ")}])`;
  }
  throw new Error(`Unsupported runtime ABI type ${type}`);
}

/** @param {Record<string, string>} sources */
export function analyzeRuntime(sources) {
  /** @type {Map<string, RuntimeFunction>} */
  const functions = new Map();
  for (const [file, text] of Object.entries(sources)) {
    for (const fn of parseRuntimeSource(file, text)) {
      if (functions.has(fn.name)) {
        throw new Error(`Duplicate runtime symbol ${fn.name}`);
      }
      functions.set(fn.name, fn);
    }
  }
  verifyRuntimeCallees(functions);
  propagateGcEffects(functions);
  return functions;
}

/** @param {string} file @param {string} text */
function parseRuntimeSource(file, text) {
  const headers = [...text.matchAll(/^(?:define|declare) /gm)];
  const functions = [...text.matchAll(/^(define|declare) (.+?) @([\w.$]+)\(([^\n]*?)\)(?: \{)?$/gm)]
    .map((match) => parseRuntimeFunction(file, text, match));
  if (functions.length !== headers.length) {
    throw new Error(`Cannot derive every runtime signature in ${file}. Extend the contract generator for the new syntax.`);
  }
  return functions;
}

/** @param {string} file @param {string} text @param {RegExpExecArray} match @returns {RuntimeFunction} */
function parseRuntimeFunction(file, text, match) {
  const [, form, returns, name, arguments_] = match;
  const end = form === "define" ? text.indexOf("\n}", match.index) : match.index;
  if (end === -1) {
    throw new Error(`Unterminated runtime definition ${name}`);
  }
  const body = text.slice(match.index + match[0].length, end);
  const argumentsList = arguments_.trim().length === 0 ? [] : arguments_.split(",").map((argument) => argument.trim());
  const parameters = argumentsList.filter((argument) => argument !== "...").map((argument) => argument.split(/\s+/)[0]);
  const callees = [...body.matchAll(/\bcall\b[^\n@]*@([\w.$]+)\(/g)].map((call) => call[1]);
  const indirect = /\bcall\b[^\n@]*%[\w.$]+\(/.test(body);
  const unknownForeign = form === "declare" && !nonGcForeignFunctions.has(name);
  return { file, name, returns, parameters, variadic: argumentsList.includes("..."), callees,
    allocates: name === "gcAlloc" || indirect || unknownForeign,
    collects: name === "gcCollect" || name === "gcSafepoint" || indirect || unknownForeign };
}

/** @param {Map<string, RuntimeFunction>} functions */
function verifyRuntimeCallees(functions) {
  for (const fn of functions.values()) {
    for (const callee of fn.callees) {
      if (!functions.has(callee) && !nonGcForeignFunctions.has(callee)) {
        throw new Error(`Runtime function ${fn.name} calls ${callee} without a contract or declaration.`);
      }
    }
  }
}

/** @param {Map<string, RuntimeFunction>} functions */
function propagateGcEffects(functions) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const fn of functions.values()) {
      const allocates = fn.allocates || fn.callees.some((callee) => functions.get(callee)?.allocates === true);
      const collects = fn.collects || fn.callees.some((callee) => functions.get(callee)?.collects === true);
      if (allocates !== fn.allocates || collects !== fn.collects) {
        Object.assign(fn, { allocates, collects });
        changed = true;
      }
    }
  }
}

/** @param {RuntimeFunction} fn */
function functionEntry(fn) {
  const parameterTypes = fn.parameters.map(typeExpression).join(", ");
  const completion = fn.returns.replaceAll(/\s/g, "") === "{i64,i1}" ? "explicit" : "none";
  return [
    `  ${JSON.stringify(fn.name)}: {`,
    `    resultKind: ${JSON.stringify(resultKind(fn))},`,
    `    pointerResult: ${pointerResult(fn)},`,
    '    origin: "staticRuntime",',
    `    name: ${JSON.stringify(fn.name)}, parameters: [${parameterTypes}], returns: ${typeExpression(fn.returns)}, variadic: ${fn.variadic},`,
    `    effects: { allocates: ${fn.allocates}, collects: ${fn.collects}, completion: ${JSON.stringify(completion)} }`,
    "  },"
  ].join("\n");
}

/** @param {RuntimeFunction} fn */
function resultKind(fn) {
  const type = fn.returns.replaceAll(/\s/g, "");
  if (type === "{i64,i1}") return "completion";
  if (type === "{ptr,i64}") return "string";
  if (type === "i64") return scalarWordFunctions.has(fn.name) ? "scalar" : "boxed";
  if (type === "ptr") return "pointer";
  if (type === "void") return "void";
  return type.startsWith("{") ? "aggregate" : "scalar";
}

/** @param {RuntimeFunction} fn */
function pointerResult(fn) {
  if (fn.returns.trim() !== "ptr") return '{ kind: "none" }';
  if (externalPointerFunctions.has(fn.name)) return '{ kind: "external" }';
  if (borrowedPointerFunctions.has(fn.name)) return '{ kind: "borrowed", parameter: 0 }';
  return '{ kind: "heap" }';
}

/** @param {Record<string, string>} sources */
export function generatedContracts(sources) {
  const functions = analyzeRuntime(sources);
  const outputs = new Map();
  const domains = Object.keys(sources).map((file) => path.basename(file, ".ll")).toSorted((left, right) => left.localeCompare(right));
  const imports = [];
  const spreads = [];
  const calleeImports = [];
  const calleeSpreads = [];
  for (const domain of domains) {
    const entries = [...functions.values()].filter((fn) => path.basename(fn.file, ".ll") === domain);
    if (entries.length === 0) {
      continue;
    }
    const identifier = `${domain}Contracts`;
    const calleeFactory = `create${domain[0].toUpperCase()}${domain.slice(1)}Callees`;
    calleeImports.push(`import { ${calleeFactory} } from "./${domain}.js";`);
    calleeSpreads.push(`    ...${calleeFactory}(module),`);
    outputs.set(`callables/${domain}.ts`, [
      "// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.",
      'import type { LlvmModuleBuilder } from "../../llvm-ir/index.js";',
      `import { ${identifier} } from "../${domain}.js";`,
      'import { type RuntimeCalleeTable, registerRuntimeContract } from "../register.js";',
      "", `export function ${calleeFactory}(module: LlvmModuleBuilder): RuntimeCalleeTable<typeof ${identifier}> {`, "  return {",
      ...entries.map((fn) => {
        const access = /^[A-Za-z_$][\w$]*$/.test(fn.name) ? `.${fn.name}` : `[${JSON.stringify(fn.name)}]`;
        return `    ${JSON.stringify(fn.name)}: registerRuntimeContract(module, ${identifier}${access}),`;
      }),
      "  };", "}", ""
    ].join("\n"));
    imports.push(`import { ${identifier} } from "./${domain}.js";`);
    spreads.push(`  ...${identifier},`);
    outputs.set(`${domain}.ts`, [
      "// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.",
      'import { llvm } from "../llvm-ir/index.js";',
      'import type { RuntimeCallContract } from "./types.js";',
      "", `export const ${identifier} = {`, ...entries.map(functionEntry),
      "} as const satisfies Readonly<Record<string, RuntimeCallContract>>;", ""
    ].join("\n"));
  }
  outputs.set("index.ts", [
    "// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.",
    ...imports, 'import { entryRuntimeContracts, structuredRuntimeContracts } from "./structured.js";',
    "", "export const runtimeContracts = {", ...spreads, "  ...structuredRuntimeContracts,", "  ...entryRuntimeContracts,", "} as const;", "",
    'export type RuntimeSymbol = keyof typeof runtimeContracts;', ""
  ].join("\n"));
  outputs.set("callables/index.ts", [
    "// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.",
    'import type { LlvmModuleBuilder } from "../../llvm-ir/index.js";',
    'import { entryRuntimeContracts, structuredRuntimeContracts } from "../structured.js";',
    'import { type RuntimeCalleeTable, registerRuntimeContract } from "../register.js";',
    'import type { runtimeContracts } from "../index.js";',
    ...calleeImports, "", "export function createRuntimeCallees(module: LlvmModuleBuilder): RuntimeCallees {", "  return {",
    ...calleeSpreads,
    ...["valueBoxObject", "valueBoxNumber", "valueNumber"].map((name) =>
      `    ${name}: registerRuntimeContract(module, structuredRuntimeContracts.${name}),`),
    ...["puts", "printf", "exit"].map((name) => `    ${name}: registerRuntimeContract(module, entryRuntimeContracts.${name}),`),
    "  };", "}", "", "export type RuntimeCallees = RuntimeCalleeTable<typeof runtimeContracts>;", ""
  ].join("\n"));
  return outputs;
}

function run() {
  const directory = path.join(root, "src/compiler/runtime");
  const sources = Object.fromEntries(readdirSync(directory).filter((file) => file.endsWith(".ll"))
    .map((file) => [file, readFileSync(path.join(directory, file), "utf8")]));
  const outputs = generatedContracts(sources);
  const check = process.argv.includes("--check");
  const outdated = [];
  for (const [file, text] of outputs) {
    const destination = path.join(root, "src/compiler/runtime-contracts", file);
    if (!check) {
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, text);
      continue;
    }
    try {
      if (readFileSync(destination, "utf8") !== text) {
        outdated.push(file);
      }
    } catch {
      outdated.push(file);
    }
  }
  if (outdated.length > 0) {
    console.error(`Runtime contracts are stale: ${outdated.join(", ")}. Run npm run runtime:contracts.`);
    process.exitCode = 1;
  } else {
    console.log(`Runtime contracts ${check ? "checked" : "generated"} for ${analyzeRuntime(sources).size} symbols.`);
  }
}

const entryPoint = process.argv.slice(1, 2).at(0);
if (entryPoint !== undefined && pathToFileURL(path.resolve(entryPoint)).href === import.meta.url) {
  run();
}

import { type LlvmGlobalSpec, assertLlvmConstantFitsType, encodeLlvmByteString, freezeLlvmConstant } from "./constants.js";
import type { BuiltLlvmFunction, BuiltLlvmModule } from "./built.js";
import { FunctionBuilder } from "./function-builder.js";
import type { LlvmModuleOptions, StaticRuntimeFragment } from "./static-runtime.js";
import { type RenderedLlvmModule, plainLine, renderLlvmFunctionBody, traceRangesOf } from "./render-module.js";
import type { RenderLine } from "./render.js";
import {
  type LlvmGlobalItem,
  type LlvmGlobalReference,
  type LlvmTypeDefinition,
  renderLlvmFunctionDeclaration,
  renderLlvmGlobal,
  renderLlvmTypeDefinition
} from "./module-items.js";
import {
  type LlvmFunctionSpec,
  type LlvmOwnedCallable,
  callSignatureOf,
  sameLlvmFunctionSpec
} from "./signatures.js";
import { type LlvmValueType, freezeLlvmType } from "./types.js";

/** Module-owned typed symbols and definitions. Static runtime registration emits no declarations. */
export interface LlvmModuleBuilder {
  /** Emits an external declaration, retaining the spec's precise return and parameter types. */
  declareFunction<S extends LlvmFunctionSpec>(spec: S): S;
  /** Registers a static runtime function without emitting another declaration. Equivalent registrations are idempotent. */
  registerStaticRuntimeFunction<S extends LlvmFunctionSpec>(spec: S): S;
  /** Registers an addressable static runtime global without emitting a definition. */
  registerStaticRuntimeGlobal(name: string, type: LlvmValueType): LlvmGlobalReference;
  defineFunction<S extends LlvmFunctionSpec>(spec: S, build: (fn: FunctionBuilder) => void): S;
  /** Returns an owned, verified definition without sealing the module. */
  finishedFunction(spec: LlvmFunctionSpec): BuiltLlvmFunction;
  defineType(name: string, elements: readonly LlvmValueType[]): LlvmTypeDefinition;
  defineGlobal(spec: LlvmGlobalSpec): LlvmGlobalReference;
  declareGlobal(name: string, type: LlvmValueType): LlvmGlobalReference;
  stringConstant(text: string): LlvmGlobalReference;
  /** Caches the verified module as frozen data and refuses subsequent mutations. */
  build(): BuiltLlvmModule;
  render(): RenderedLlvmModule;
}

const llvmNamePattern = /^[A-Za-z$._][\w$.-]*$/;

/** Function specs resolve through module-owned identities. LLVM values have separate function identities. */
export class ModuleBuilder implements LlvmModuleBuilder {
  readonly #types: LlvmTypeDefinition[] = [];
  readonly #globals = new Map<string, LlvmGlobalItem>();
  readonly #declarations = new Map<string, LlvmFunctionSpec>();
  /** Symbols the static runtime blob already defines; recorded for lookup, never rendered. */
  readonly #staticFunctions = new Map<string, LlvmFunctionSpec>();
  /** Globals the static runtime blob already defines, with the type a body checks an address against. */
  readonly #staticGlobals = new Map<string, LlvmValueType>();
  readonly #definitions = new Set<string>();
  readonly #pendingFunctions = new Set<string>();
  readonly #functions: BuiltLlvmFunction[] = [];
  readonly #staticRuntime: readonly StaticRuntimeFragment[];
  readonly #stringConstants = new Map<string, string>();
  readonly #callableSpecs = new WeakMap<object, LlvmOwnedCallable & { readonly owner: symbol }>();
  readonly #owner = Symbol("llvm-module");
  /** The snapshot `build` produced, or `undefined` while the module is still open. */
  #built: BuiltLlvmModule | undefined;

  public constructor(options: LlvmModuleOptions) {
    this.#staticRuntime = Object.freeze(options.staticRuntime.map((fragment) => {
      if (fragment.origin.length === 0) throw llvmError("static runtime fragment requires an origin");
      return Object.freeze({ origin: fragment.origin, text: fragment.text });
    }));
  }

  public declareFunction<S extends LlvmFunctionSpec>(spec: S): S {
    this.#assertOpen();
    const accepted = this.#acceptSpec(spec);
    const existing = this.#declarations.get(accepted.name);
    if (existing !== undefined && !sameLlvmFunctionSpec(existing, accepted)) {
      throw llvmError(`conflicting LLVM declaration ${accepted.name}`);
    }
    if (this.#definitions.has(accepted.name)) {
      throw llvmError(`LLVM symbol ${accepted.name} is already defined`);
    }
    this.#assertSymbolAvailable(accepted.name, true);
    this.#declarations.set(accepted.name, accepted);
    this.#callableSpecs.set(spec, { owner: this.#owner, name: accepted.name, signature: callSignatureOf(accepted) });
    return spec;
  }

  /** Records a static runtime function and removes any matching external declaration. */
  public registerStaticRuntimeFunction<S extends LlvmFunctionSpec>(spec: S): S {
    this.#assertOpen();
    const accepted = this.#acceptSpec(spec);
    const existing = this.#staticFunctions.get(accepted.name);
    if (existing !== undefined) {
      if (!sameLlvmFunctionSpec(existing, accepted)) {
        throw llvmError(`conflicting static runtime registration for ${accepted.name}`);
      }
      this.#callableSpecs.set(spec, { owner: this.#owner, name: existing.name, signature: callSignatureOf(existing) });
      return spec;
    }
    this.#assertSymbolAvailable(accepted.name, true);
    const declaration = this.#declarations.get(accepted.name);
    if (declaration !== undefined && !sameLlvmFunctionSpec(declaration, accepted)) {
      throw llvmError(`static runtime symbol ${accepted.name} conflicts with its declaration`);
    }
    this.#declarations.delete(accepted.name);
    this.#staticFunctions.set(accepted.name, accepted);
    this.#callableSpecs.set(spec, { owner: this.#owner, name: accepted.name, signature: callSignatureOf(accepted) });
    return spec;
  }

  public registerStaticRuntimeGlobal(name: string, type: LlvmValueType): LlvmGlobalReference {
    this.#assertOpen();
    assertLlvmName(name, "global");
    if (this.#staticGlobals.has(name)) {
      throw llvmError(`duplicate static runtime global ${name}`);
    }
    this.#assertSymbolAvailable(name);
    this.#staticGlobals.set(name, freezeLlvmType(type));
    return Object.freeze({ name, moduleOwner: this.#owner });
  }

  public defineFunction<S extends LlvmFunctionSpec>(spec: S, build: (fn: FunctionBuilder) => void): S {
    this.#assertOpen();
    const accepted = this.#acceptSpec(spec);
    this.#assertSymbolAvailable(accepted.name, true);
    const declaration = this.#declarations.get(accepted.name);
    if (declaration !== undefined && !sameLlvmFunctionSpec(declaration, accepted)) {
      throw llvmError(`LLVM definition conflicts with declaration ${accepted.name}`);
    }
    const fn = new FunctionBuilder(accepted, {
      callee: this.#calleeName(),
      functionName: this.#resolveFunctionName,
      globalName: this.#resolveGlobal
    });
    let built: BuiltLlvmFunction;
    this.#pendingFunctions.add(accepted.name);
    try {
      build(fn);
      // Every block exists, every edge resolves, and every operand is dominated by its definition.
      // Rendering comes later and reads `built`, not the builders.
      built = fn.finish();
    } catch (error) {
      fn.abort();
      throw error;
    } finally {
      this.#pendingFunctions.delete(accepted.name);
    }
    this.#definitions.add(accepted.name);
    this.#callableSpecs.set(spec, { owner: this.#owner, name: accepted.name, signature: callSignatureOf(accepted) });
    this.#functions.push(built);
    return spec;
  }

  public finishedFunction(spec: LlvmFunctionSpec): BuiltLlvmFunction {
    const owned = this.#ownedCallable(spec);
    if (owned === undefined) {
      throw llvmError(`LLVM finished function references unowned function ${spec.name}`);
    }
    const definition = this.#functions.find((function_) => function_.spec.name === owned.name);
    if (definition === undefined) {
      throw llvmError(`LLVM function ${owned.name} has no finished definition`);
    }
    return definition;
  }

  /** `%name = type { ... }`, so one known-shape object layout is spelled once and named thereafter. */
  public defineType(name: string, elements: readonly LlvmValueType[]): LlvmTypeDefinition {
    this.#assertOpen();
    assertLlvmName(name, "type name");
    if (this.#types.some((existing) => existing.name === name)) {
      throw llvmError(`duplicate LLVM type name ${name}`);
    }
    const definition: LlvmTypeDefinition = Object.freeze({
      name,
      type: freezeLlvmType({ kind: "struct", name, elements: [...elements] })
    });
    this.#types.push(definition);
    return definition;
  }

  public defineGlobal(spec: LlvmGlobalSpec): LlvmGlobalReference {
    this.#assertOpen();
    assertLlvmName(spec.name, "global");
    this.#assertSymbolAvailable(spec.name);
    // Checked against the declared type here rather than at render time: a global whose spelling
    // disagrees with its type is the caller's mistake, and this is the last point that can name it.
    assertLlvmConstantFitsType(spec.initializer, spec.type, `LLVM global ${spec.name}`);
    const accepted: LlvmGlobalSpec = Object.freeze({
      name: spec.name,
      type: freezeLlvmType(spec.type),
      linkage: spec.linkage,
      constant: spec.constant,
      unnamedAddress: spec.unnamedAddress,
      initializer: freezeLlvmConstant(spec.initializer)
    });
    this.#globals.set(accepted.name, Object.freeze({ kind: "definition", spec: accepted }));
    return Object.freeze({ name: accepted.name, moduleOwner: this.#owner });
  }

  /** `@name = external global <type>`: a symbol another translation unit or the runtime provides. */
  public declareGlobal(name: string, type: LlvmValueType): LlvmGlobalReference {
    this.#assertOpen();
    assertLlvmName(name, "global");
    this.#assertSymbolAvailable(name);
    this.#globals.set(name, Object.freeze({ kind: "declaration", name, type: freezeLlvmType(type) }));
    return Object.freeze({ name, moduleOwner: this.#owner });
  }

  /** Interns UTF-8 string constants by text and returns an owned global reference. */
  public stringConstant(text: string): LlvmGlobalReference {
    this.#assertOpen();
    const interned = this.#stringConstants.get(text);
    if (interned !== undefined) {
      return Object.freeze({ name: interned, moduleOwner: this.#owner });
    }
    const { content, length } = encodeLlvmByteString(text);
    const reference = this.defineGlobal({
      name: `.str.${this.#stringConstants.size}`,
      type: { kind: "array", element: { kind: "integer", bits: 8 }, length },
      linkage: "private",
      constant: true,
      unnamedAddress: true,
      initializer: { kind: "byteString", length, content }
    });
    this.#stringConstants.set(text, reference.name);
    return reference;
  }

  /** Validates forward global initializer references before sealing the module. */
  public build(): BuiltLlvmModule {
    const sealed = this.#built;
    if (sealed !== undefined) {
      return sealed;
    }
    if (this.#pendingFunctions.size > 0) {
      throw llvmError("cannot seal LLVM module while a function is being built");
    }
    this.#assertInitializersResolve();
    this.#built = Object.freeze({
      types: Object.freeze([...this.#types]),
      globals: Object.freeze([...this.#globals.values()]),
      declarations: Object.freeze([...this.#declarations.values()].filter((declaration) => !this.#definitions.has(declaration.name))),
      functions: Object.freeze([...this.#functions]),
      staticRuntime: this.#staticRuntime
    });
    return this.#built;
  }

  /** Renders the cached module: types, globals, declarations, static runtime, then typed functions. */
  public render(): RenderedLlvmModule {
    const built = this.build();
    const lines: readonly RenderLine[] = [
      ...built.types.map((definition) => plainLine(renderLlvmTypeDefinition(definition))),
      ...built.globals.map((global) => plainLine(renderLlvmGlobal(global))),
      ...built.declarations.map((declaration) => plainLine(renderLlvmFunctionDeclaration(declaration))),
      ...built.staticRuntime.flatMap(staticRuntimeLines),
      ...built.functions.flatMap((function_) => renderLlvmFunctionBody(function_))
    ];
    return { text: `${lines.map((line) => line.text).join("\n")}\n`, traceRanges: traceRangesOf(lines) };
  }

  /** Global initializers may refer to generated globals or registered static runtime globals. */
  #assertInitializersResolve(): void {
    for (const global of this.#globals.values()) {
      if (global.kind !== "definition" || global.spec.initializer.kind !== "globalReference") {
        continue;
      }
      if (!this.#hasGlobal(global.spec.initializer.name)) {
        throw llvmError(`LLVM global ${global.spec.name} initializes from undeclared global ${global.spec.initializer.name}`);
      }
    }
  }

  /** Whether `name` is a global this module defines, declares, or inherits from the static runtime. */
  #hasGlobal(name: string): boolean {
    return this.#globals.has(name) || this.#staticGlobals.has(name);
  }

  /** Functions and globals share the LLVM symbol namespace. */
  #assertSymbolAvailable(name: string, allowDeclaration = false): void {
    if (this.#definitions.has(name) || this.#pendingFunctions.has(name)) {
      throw llvmError(`duplicate LLVM symbol ${name}`);
    }
    if (!allowDeclaration && this.#declarations.has(name)) {
      throw llvmError(`duplicate LLVM symbol ${name}`);
    }
    if (this.#globals.has(name)) {
      throw llvmError(`duplicate LLVM symbol ${name}`);
    }
    if (this.#staticFunctions.has(name)) {
      throw llvmError(`LLVM symbol ${name} is already defined by the static runtime`);
    }
    if (this.#staticGlobals.has(name)) {
      throw llvmError(`LLVM symbol ${name} is already defined by the static runtime`);
    }
  }

  #assertOpen(): void {
    if (this.#built !== undefined) {
      throw llvmError(`LLVM module was sealed by build; ${this.#built.functions.length} verified function(s) are the only ones that may be rendered`);
    }
  }

  /** Calls use the name and signature recorded at registration, even if the caller mutates its spec. */
  #calleeName(): (spec: LlvmFunctionSpec) => LlvmOwnedCallable {
    return (spec) => {
      const declared = this.#ownedCallable(spec);
      if (declared === undefined) {
        throw llvmError(`LLVM call references unowned function ${spec.name}`);
      }
      return declared;
    };
  }

  /** Function addresses use the same owned registry as calls. */
  readonly #resolveFunctionName = (spec: LlvmFunctionSpec): string => {
    const declared = this.#ownedCallable(spec);
    if (declared === undefined) {
      throw llvmError(`LLVM body takes the address of unowned function ${spec.name}`);
    }
    return declared.name;
  };

  /** What the module recorded for `spec`, or `undefined` for a foreign or unregistered one. */
  #ownedCallable(spec: LlvmFunctionSpec): LlvmOwnedCallable | undefined {
    const recorded = this.#callableSpecs.get(spec);
    return recorded?.owner === this.#owner ? { name: recorded.name, signature: recorded.signature } : undefined;
  }

  /** Resolves a global reference, refusing one from another module or one this module never provided. */
  readonly #resolveGlobal = (reference: LlvmGlobalReference): string => {
    if (reference.moduleOwner !== this.#owner || !this.#hasGlobal(reference.name)) {
      throw llvmError(`LLVM body references unowned global ${reference.name}`);
    }
    return reference.name;
  };

  #acceptSpec(spec: LlvmFunctionSpec): LlvmFunctionSpec {
    assertLlvmName(spec.name, "symbol");
    const names = new Set<string>();
    const parameters = spec.parameters.map((parameter) => {
      assertLlvmName(parameter.name, "parameter name");
      if (names.has(parameter.name)) {
        throw llvmError(`duplicate LLVM parameter name ${parameter.name}`);
      }
      names.add(parameter.name);
      return Object.freeze({ name: parameter.name, type: freezeLlvmType(parameter.type) });
    });
    return Object.freeze({
      name: spec.name,
      parameters: Object.freeze(parameters),
      returns: freezeLlvmType(spec.returns),
      variadic: spec.variadic
    });
  }
}

export function createLlvmModule(options: LlvmModuleOptions): LlvmModuleBuilder {
  return new ModuleBuilder(options);
}

function staticRuntimeLines(fragment: StaticRuntimeFragment): readonly RenderLine[] {
  const text = fragment.text.endsWith("\n") ? fragment.text.slice(0, -1) : fragment.text;
  return text.split("\n").map(plainLine);
}

function assertLlvmName(name: string, description: string): void {
  if (!llvmNamePattern.test(name)) {
    throw llvmError(`invalid LLVM ${description} ${name}`);
  }
}

function llvmError(message: string): Error {
  return new Error(`Internal compiler error: ${message}`);
}

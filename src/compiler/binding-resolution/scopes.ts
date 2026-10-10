import type { BindingKind, BindingRef, BindingRegistry, BindingRepresentation, FunctionId, LexicalOwner } from "./binding-id.js";
import type { JsIrOperation } from "../ir/types.js";
import type { JsIrFunctionObjectDefinition } from "../ir/bindings.js";
import type { ResolvedFunctionObject } from "./resolved-types.js";

/** Why a scope exists. It decides nothing about resolution; it is recorded so diagnostics can say where a name came from. */
export type ScopeKind = "module" | "function" | "block" | "loop" | "catch";

interface Scope {
  readonly kind: ScopeKind;
  readonly parent: Scope | undefined;
  readonly names: Map<string, BindingRef>;
  readonly declarations: WeakMap<object, BindingRef>;
}

/** The trace id of the operation being resolved, which an unresolved reference is reported against. */
export type TraceId = string | undefined;

export class UnresolvedBindingError extends Error {
  public readonly bindingName: string;
  public readonly operationTraceId: TraceId;
  public readonly scopeChain: readonly ScopeKind[];

  public constructor(bindingName: string, operationTraceId: TraceId, scopeChain: readonly ScopeKind[]) {
    super(
      `Unresolved binding '${bindingName}'. Visible scopes: ${scopeChain.length === 0 ? "(none)" : scopeChain.join(" > ")}.`
    );
    this.name = "UnresolvedBindingError";
    this.bindingName = bindingName;
    this.operationTraceId = operationTraceId;
    this.scopeChain = scopeChain;
  }
}

export class Resolution {
  readonly #registry: BindingRegistry;
  readonly #functionObjects = new Map<string, ResolvedFunctionObject>();
  readonly #closureFunctions = new Map<string, FunctionId>();
  #definitions: ReadonlyMap<string, JsIrFunctionObjectDefinition> = new Map();
  readonly #modules = new Map<string, Scope>();
  readonly #moduleFunctions = new Map<string, BindingRef>();
  #scope: Scope | undefined;
  /** The function body being resolved, or `undefined` at module level. */
  #function: FunctionId | undefined;
  /** The trace id of the operation being resolved, so a handler need not pass it down. */
  #traceId: TraceId;

  public constructor(registry: BindingRegistry) {
    this.#registry = registry;
  }

  public openModule(fileName: string, definitions: readonly JsIrFunctionObjectDefinition[] = []): void {
    const scope = this.#modules.get(fileName) ?? {
      kind: "module", parent: undefined, names: new Map(), declarations: new WeakMap()
    } satisfies Scope;
    this.#modules.set(fileName, scope);
    this.#scope = scope;
    this.#function = undefined;
    this.#traceId = undefined;
    this.#functionObjects.clear();
    this.#closureFunctions.clear();
    this.#definitions = new Map(definitions.map((definition) => [definition.codeName, definition]));
  }

  public functionDefinition(definition: JsIrFunctionObjectDefinition): JsIrFunctionObjectDefinition {
    return this.#definitions.get(definition.codeName) ?? definition;
  }

  public publishFunctions(operations: readonly JsIrOperation[]): void {
    for (const operation of operations) {
      if (operation.kind === "bindingGroup") {
        this.publishFunctions(operation.operations);
      } else if (operation.kind === "function") {
        const binding = this.hoisted(operation.name);
        const existing = this.#moduleFunctions.get(operation.name);
        if (existing !== undefined && existing.binding !== binding.binding) {
          throw new Error(`Ambiguous module function '${operation.name}'`);
        }
        this.#moduleFunctions.set(operation.name, binding);
      }
    }
  }

  /** Runs `body` in a fresh scope nested in the current one. */
  public inScope<K>(kind: ScopeKind, body: () => K): K {
    const previous = this.#scope;
    this.#scope = { kind, parent: previous, names: new Map(), declarations: new WeakMap() };
    try {
      return body();
    } finally {
      this.#scope = previous;
    }
  }

  public inFunction<K>(body: (functionId: FunctionId) => K): K {
    const previousFunction = this.#function;
    this.#function = this.#registry.mintFunction();
    try {
      return this.inScope("function", () => body(this.#requireFunction()));
    } finally {
      this.#function = previousFunction;
    }
  }

  public inOperation<K>(traceId: TraceId, body: () => K): K {
    const previous = this.#traceId;
    this.#traceId = traceId;
    try {
      return body();
    } finally {
      this.#traceId = previous;
    }
  }

  /** Declares `name` in the current scope and returns its identity. */
  public declare(name: string, kind: BindingKind, representation: BindingRepresentation): BindingRef {
    const reference = this.#registry.mint(name, kind, representation, this.#owner());
    this.#requireInnermost().set(name, reference);
    return reference;
  }

  public declareSite(site: object, name: string, kind: BindingKind, representation: BindingRepresentation): BindingRef {
    const scope = this.#scope;
    if (scope === undefined) {
      throw new Error("Binding resolution used a scope before openModule()");
    }
    const declared = scope.declarations.get(site);
    if (declared !== undefined) {
      return declared;
    }
    const reference = this.declare(name, kind, representation);
    scope.declarations.set(site, reference);
    return reference;
  }

  public hoisted(name: string): BindingRef {
    const reference = this.#requireInnermost().get(name);
    if (reference === undefined) {
      throw new Error(`Internal compiler error: function '${name}' was not hoisted before it was resolved`);
    }
    return reference;
  }

  public reference(name: string): BindingRef {
    for (let scope = this.#scope; scope !== undefined; scope = scope.parent) {
      const reference = scope.names.get(name);
      if (reference !== undefined) {
        this.#markCapture(reference);
        return reference;
      }
    }
    const moduleFunction = this.#moduleFunctions.get(name);
    if (moduleFunction !== undefined) {
      this.#markCapture(moduleFunction);
      return moduleFunction;
    }
    throw new UnresolvedBindingError(name, this.#traceId, this.scopeChain());
  }

  /** The scope chain, innermost first. A diagnostic reports where a name was looked for. */
  public scopeChain(): readonly ScopeKind[] {
    const kinds: ScopeKind[] = [];
    for (let scope = this.#scope; scope !== undefined; scope = scope.parent) {
      kinds.push(scope.kind);
    }
    return kinds;
  }

  public recordClosureFunction(symbol: string, identity: FunctionId): void {
    if (this.#closureFunctions.has(symbol)) { throw new Error(`Generated closure symbol ${symbol} is repeated within a source module`); }
    this.#closureFunctions.set(symbol, identity);
  }

  public closureFunction(symbol: string): FunctionId {
    const identity = this.#closureFunctions.get(symbol);
    if (identity === undefined) { throw new Error(`Generated closure ${symbol} has no resolved function identity`); }
    return identity;
  }

  /** Records a resolved function-object definition, keyed by its generated code name. */
  public recordFunctionObject(definition: ResolvedFunctionObject): void {
    if (!this.#functionObjects.has(definition.codeName)) {
      this.#functionObjects.set(definition.codeName, definition);
    }
  }

  /** The source module's function-object definitions, in the order their sites were resolved. */
  public functionObjects(): readonly ResolvedFunctionObject[] {
    return [...this.#functionObjects.values()];
  }

  public capture(reference: BindingRef): void {
    this.#markCapture(reference);
  }

  #requireFunction(): FunctionId {
    if (this.#function === undefined) {
      throw new Error("Binding resolution used a function before inFunction()");
    }
    return this.#function;
  }

  #owner(): LexicalOwner {
    const current = this.#function;
    return current === undefined ? { kind: "module" } : { kind: "function", function: current };
  }

  #markCapture(reference: BindingRef): void {
    const current = this.#function;
    if (current === undefined) {
      return;
    }
    const owner = this.#registry.ownerOf(reference);
    if (owner.kind === "function" && owner.function.ordinal === current.ordinal) {
      return;
    }
    this.#registry.markCaptured(reference);
  }

  #requireInnermost(): Map<string, BindingRef> {
    const scope = this.#scope;
    if (scope === undefined) {
      throw new Error("Binding resolution used a scope before openModule()");
    }
    return scope.names;
  }
}

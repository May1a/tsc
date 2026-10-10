import type { ResolvedOperation } from "../binding-resolution/index.js";
import { type LlvmBlockLabel, type LlvmValue, llvm } from "../llvm-ir/index.js";
import type { FunctionCapabilities } from "./function-owner.js";
import type { OperationContext } from "./operation-context.js";
import type { ExceptionTarget } from "./completion.js";
import type { BoxedValue } from "./value-boundary.js";

type Node<K extends ResolvedOperation["kind"]> = Extract<ResolvedOperation, { readonly kind: K }>;
type Completion =
  | { readonly kind: "return" | "throw"; readonly value: BoxedValue }
  | { readonly kind: "jump"; readonly block: LlvmBlockLabel };

interface Handler { readonly target: ExceptionTarget; readonly depth: number }
interface Cleanup { run(completion?: Completion): void }
interface Jump { readonly block: LlvmBlockLabel; readonly depth: number }
interface Loop { readonly breakTarget: Jump; readonly continueTarget?: Jump }
interface State { readonly cleanups: readonly Cleanup[]; readonly handlers: readonly Handler[]; readonly loops: readonly Loop[] }

export interface FlowCapability {
  exceptionTarget(): ExceptionTarget;
  returnValue(value: BoxedValue): void;
  throwValue(value: BoxedValue): void;
  branch(operation: Node<"if">, context: OperationContext): void;
  tryCatch(operation: Node<"tryCatch">, context: OperationContext): void;
  switch(operation: Node<"switch">, context: OperationContext): void;
  loop(operation: Node<"while" | "doWhile" | "for">, context: OperationContext): void;
  jump(operation: Node<"break" | "continue">): void;
  withCleanup<A>(cleanup: Cleanup, build: () => A): A;
  withLoop<A>(loop: Loop, build: () => A): A;
  readonly cleanupDepth: number;
  finish(): void;
}

export class ControlFlow implements FlowCapability {
  readonly #capabilities: FunctionCapabilities;
  readonly #payload: LlvmValue<typeof llvm.ptr>;
  readonly #return: (value: BoxedValue, threw: boolean) => void;
  readonly #pending: { readonly target: ExceptionTarget; readonly state: State }[] = [];
  #cleanups: Cleanup[] = [];
  #handlers: Handler[] = [];
  #loops: Loop[] = [];

  public constructor(capabilities: FunctionCapabilities, finish: (value: BoxedValue, threw: boolean) => void) {
    this.#capabilities = capabilities;
    this.#return = finish;
    this.#payload = capabilities.cursor.currentBlock().alloca(llvm.i64, "exception.payload");
  }

  public get cleanupDepth(): number { return this.#cleanups.length; }

  public exceptionTarget(): ExceptionTarget {
    const target = { block: this.#capabilities.cursor.reserveBlock("exception.route"), payloadSlot: this.#payload };
    this.#pending.push({ target, state: this.#state() });
    return target;
  }

  public returnValue(value: BoxedValue): void { this.#abrupt({ kind: "return", value }, 0); }
  public throwValue(value: BoxedValue): void {
    const handler = this.#handlers.at(-1);
    if (handler === undefined) { this.#abrupt({ kind: "throw", value }, 0); return; }
    this.#within(this.#state(), () => {
      this.#unwind({ kind: "throw", value }, handler.depth);
      const block = this.#capabilities.cursor.currentBlock();
      if (!block.terminated) { block.store(value, handler.target.payloadSlot); block.br(handler.target.block); }
    });
  }

  public withCleanup<A>(cleanup: Cleanup, build: () => A): A {
    this.#cleanups.push(cleanup);
    try { return build(); } finally { this.#cleanups.pop(); }
  }

  public withLoop<A>(loop: Loop, build: () => A): A {
    this.#loops.push(loop);
    try { return build(); } finally { this.#loops.pop(); }
  }

  public jump(operation: Node<"break" | "continue">): void {
    const loops = operation.kind === "continue" ? this.#loops.filter((loop) => loop.continueTarget !== undefined) : this.#loops;
    const loop = loops.at(-1 - (operation.targetDepth ?? 0));
    const target = operation.kind === "continue" ? loop?.continueTarget : loop?.breakTarget;
    if (target === undefined) { throw new Error(`${operation.kind} has no resolved loop target`); }
    this.#abrupt({ kind: "jump", block: target.block }, target.depth);
  }

  public branch(operation: Node<"if">, context: OperationContext): void {
    const { cursor } = this.#capabilities;
    const condition = context.expressions.condition(operation.condition);
    const then = cursor.reserveBlock("if.then");
    const alternate = cursor.reserveBlock("if.else");
    const join = cursor.reserveBlock("if.end");
    cursor.currentBlock().condBr(condition, then, alternate);
    cursor.openBlock(then);
    context.operations.operations(operation.thenOperations);
    const thenLive = this.#join(join);
    cursor.openBlock(alternate);
    context.operations.operations(operation.elseOperations);
    const elseLive = this.#join(join);
    cursor.openBlock(join);
    if (!thenLive && !elseLive) { cursor.currentBlock().unreachable(); }
  }

  public tryCatch(operation: Node<"tryCatch">, context: OperationContext): void {
    const { cursor, roots, values } = this.#capabilities;
    const outer = this.#state();
    const caught = { block: cursor.reserveBlock("try.catch"), payloadSlot: this.#payload };
    const normal = cursor.reserveBlock("try.normal");
    const finalOperations = operation.finallyOperations ?? [];
    const finalizer: Cleanup = { run: () => this.#within(outer, () => context.operations.operations(finalOperations)) };
    this.#cleanups.push(finalizer);
    if (operation.hasCatch) { this.#handlers.push({ target: caught, depth: this.cleanupDepth }); }
    context.operations.operations(operation.tryOperations);
    const tryLive = this.#join(normal);
    if (operation.hasCatch) { this.#handlers.pop(); }
    cursor.openBlock(caught.block);
    if (operation.hasCatch) {
      const payload = values.forBlock(cursor.currentBlock()).fromBoundary(cursor.currentBlock().load(llvm.i64, this.#payload, cursor.uniqueName("caught.value")));
      roots.push(payload);
      if (operation.catchVariable !== undefined) { context.writes.storeValue(operation.catchVariable, payload); }
      context.operations.operations(operation.catchOperations);
    } else { cursor.currentBlock().unreachable(); }
    const catchLive = this.#join(normal);
    this.#cleanups.pop();
    cursor.openBlock(normal);
    if (!tryLive && !catchLive) { cursor.currentBlock().unreachable(); return; }
    finalizer.run();
  }

  public switch(operation: Node<"switch">, context: OperationContext): void {
    const { cursor, runtime, roots } = this.#capabilities;
    const value = context.expressions.value(operation.expression);
    roots.push(value);
    const done = cursor.reserveBlock("switch.end");
    const clauses = operation.clauses.map((clause) => ({ clause, block: cursor.reserveBlock("switch.case") }));
    const fallback = clauses.find((entry) => entry.clause.test === undefined)?.block ?? done;
    for (const entry of clauses) {
      if (entry.clause.test === undefined) { continue; }
      const test = context.expressions.value(entry.clause.test);
      const equal = runtime.call("valueStrictEquals", [value, test], cursor.uniqueName("switch.equal"));
      const next = cursor.reserveBlock("switch.test");
      cursor.currentBlock().condBr(equal, entry.block, next);
      cursor.openBlock(next);
    }
    cursor.currentBlock().br(fallback);
    this.withLoop({ breakTarget: { block: done, depth: this.cleanupDepth } }, () => {
      for (const [index, entry] of clauses.entries()) {
        cursor.openBlock(entry.block);
        context.operations.operations(entry.clause.operations);
        this.#join(clauses.at(index + 1)?.block ?? done);
      }
    });
    cursor.openBlock(done);
  }

  public loop(operation: Node<"while" | "doWhile" | "for">, context: OperationContext): void {
    const { cursor, roots, runtime } = this.#capabilities;
    if (operation.kind === "for") { context.operations.operations(operation.initializer); }
    const header = cursor.reserveBlock("loop.header");
    const body = cursor.reserveBlock("loop.body");
    const step = cursor.reserveBlock("loop.step");
    const exhausted = cursor.reserveBlock("loop.exhausted");
    const done = cursor.reserveBlock("loop.end");
    const depth = this.cleanupDepth;
    cursor.currentBlock().br(header);
    cursor.openBlock(header);
    const frame = roots.save();
    const cleanup: Cleanup = { run: (completion) => {
      roots.restore(frame);
      if (completion?.kind === "return" || completion?.kind === "throw") { roots.push(completion.value); }
    } };
    this.withCleanup(cleanup, () => {
      if (operation.kind === "doWhile") { cursor.currentBlock().br(body); }
      else {
        const condition = context.expressions.condition(operation.condition);
        cursor.currentBlock().condBr(condition, body, exhausted);
      }
      cursor.openBlock(body);
      this.withLoop({ breakTarget: { block: done, depth }, continueTarget: { block: step, depth: depth + 1 } },
        () => context.operations.operations(operation.body));
      this.#join(step);
      cursor.openBlock(step);
      if (operation.kind === "for") { context.operations.operation(operation.increment); }
      const condition = operation.kind === "doWhile" ? context.expressions.condition(operation.condition) : undefined;
      runtime.callVoid("gcSafepoint", []);
      roots.restore(frame);
      if (condition === undefined) { cursor.currentBlock().br(header); }
      else { cursor.currentBlock().condBr(condition, header, done); }
      cursor.openBlock(exhausted);
      roots.restore(frame);
      cursor.currentBlock().br(done);
    });
    cursor.openBlock(done);
  }

  public finish(): void {
    const { cursor, values } = this.#capabilities;
    for (const entry of this.#pending) {
      cursor.openBlock(entry.target.block);
      const value = values.forBlock(cursor.currentBlock()).fromBoundary(cursor.currentBlock().load(llvm.i64, entry.target.payloadSlot, cursor.uniqueName("thrown.value")));
      this.#within(entry.state, () => this.throwValue(value));
    }
  }

  #join(target: LlvmBlockLabel): boolean {
    const block = this.#capabilities.cursor.currentBlock();
    if (block.terminated) { return false; }
    block.br(target);
    return true;
  }

  #abrupt(completion: Completion, depth: number): void {
    this.#within(this.#state(), () => {
      this.#unwind(completion, depth);
      const block = this.#capabilities.cursor.currentBlock();
      if (block.terminated) { return; }
      if (completion.kind === "jump") { block.br(completion.block); }
      else { this.#return(completion.value, completion.kind === "throw"); }
    });
  }

  #unwind(completion: Completion, depth: number): void {
    if (completion.kind !== "jump") { this.#capabilities.roots.push(completion.value); }
    while (this.#cleanups.length > depth) {
      const cleanup = this.#cleanups.pop();
      if (cleanup === undefined) { throw new Error("Cleanup stack ended before its destination"); }
      cleanup.run(completion);
      if (this.#capabilities.cursor.currentBlock().terminated) { return; }
    }
  }

  #state(): State { return { cleanups: [...this.#cleanups], handlers: [...this.#handlers], loops: [...this.#loops] }; }

  #within<A>(state: State, build: () => A): A {
    const previous = this.#state();
    this.#cleanups = [...state.cleanups]; this.#handlers = [...state.handlers]; this.#loops = [...state.loops];
    try { return build(); }
    finally { this.#cleanups = [...previous.cleanups]; this.#handlers = [...previous.handlers]; this.#loops = [...previous.loops]; }
  }
}

const traceIdPattern = /^[A-Za-z0-9_.:$-]+$/;

const noEnclosingRegions: readonly string[] = [];

/** Nested trace regions. An id may be open once across function and block scopes. */
export class TraceStack {
  readonly #ids: string[] = [];

  /** The open ids, outermost first. Read-only: a builder only ever consults it. */
  public active(): readonly string[] {
    return this.#ids;
  }

  /** Opens a region for the duration of `build`, then closes it even if `build` throws. */
  public run<A>(traceId: string, enclosing: readonly string[], build: () => A): A {
    if (!traceIdPattern.test(traceId) || this.#ids.includes(traceId) || enclosing.includes(traceId)) {
      throw llvmError(`invalid or repeated LLVM trace ID ${traceId}`);
    }
    this.#ids.push(traceId);
    try {
      return build();
    } finally {
      this.#ids.pop();
    }
  }

  /** `run` with nothing enclosing, for the function's own outermost level. */
  public runOutermost<A>(traceId: string, build: () => A): A {
    return this.run(traceId, noEnclosingRegions, build);
  }
}

function llvmError(message: string): Error {
  return new Error(`Internal compiler error: ${message}`);
}
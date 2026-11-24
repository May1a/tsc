/** Hands out names within one namespace: a hint, or the hint with its lowest unused numeric suffix. */
export class NameAllocator {
  readonly #used = new Set<string>();
  /** Names are never released, so the suffixes below a hint's next one stay taken. */
  readonly #nextSuffix = new Map<string, number>();

  public claim(name: string): void {
    this.#used.add(name);
  }

  public allocate(hint: string): string {
    let suffix = this.#nextSuffix.get(hint) ?? 0;
    let candidate = suffix === 0 ? hint : `${hint}.${suffix}`;
    while (this.#used.has(candidate)) {
      suffix += 1;
      candidate = `${hint}.${suffix}`;
    }
    this.#nextSuffix.set(hint, suffix + 1);
    this.#used.add(candidate);
    return candidate;
  }
}

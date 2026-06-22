// Phase C drop-and-reuse fixture: a function returns a string derived from
// allocating two distinct objects back to back inside a single helper and
// reading a field from each. Between the two reads, the first object is no
// longer reachable from any program-visible binding; a correctly
// instrumented GC reclaims it on the next collection rather than pinning
// it indefinitely via a stale root-stack entry. The fixture concatenates
// the two reads so the trace has an observable end state.
declare function print(value: unknown): void;

class Message {
  greeting: string;
  constructor(greeting: string) {
    this.greeting = greeting;
  }
}

function combine(): string {
  return new Message("alpha").greeting + new Message("beta").greeting;
}

print(combine());
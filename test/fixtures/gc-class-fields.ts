// Phase C class-field fixture: a class with two string fields, a constructor
// that initializes them through objectSet, and an instance method that reads
// them back through objectGet. Exercises:
//   - objectNew -> gcAlloc(GC_TAG_OBJECT)
//   - objectSet -> the entries grow path (allocates a new entries buffer)
//   - valueBoxString -> gcAlloc(GC_TAG_STRING)
//   - the gcRootPush/gcRootPop bracketing around newInstance and around the
//     constructor's first objectSet (which allocates the entries buffer)
//   - objectGet -> the unbox-side accessor path
//   - the user-function prologue/epilogue push/pop on the value-typed
//     `this` parameter
//   - the instance method call path (which pushes the receiver across the
//     call and pops after)
declare function print(value: unknown): void;

class Greeter {
  greeting: string;
  target: string;

  constructor(greeting: string, target: string) {
    this.greeting = greeting;
    this.target = target;
  }

  greet(): string {
    return this.greeting + " " + this.target;
  }
}

function build(): string {
  return new Greeter("hello", "gc").greet();
}

print(build());
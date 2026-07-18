declare function print(value: unknown): void;

// Mirrors Test262 language/statements/try/12.14-10.js: catch-scope lookup
// resolves the nested function parameter, not the caught value.
function f(o: unknown): unknown {
  function innerf(o: unknown, x: unknown): unknown {
    try {
      throw o;
    } catch (e) {
      return x;
    }
  }
  return innerf(o, 42);
}

print(f({}));

// Nested declaration inside a try block (called within that try).
function g(value: unknown): unknown {
  try {
    function fromTry(x: unknown): unknown {
      return x;
    }
    return fromTry(value);
  } catch (e) {
    return e;
  }
}

print(g(7));

// Nested declaration in the enclosing function, called from a catch block.
function h(value: unknown): unknown {
  function fromOuter(x: unknown): unknown {
    return x;
  }
  try {
    throw value;
  } catch (e) {
    return fromOuter(e);
  }
}

print(h("ok"));

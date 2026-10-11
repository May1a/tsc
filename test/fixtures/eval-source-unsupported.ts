declare function print(value: unknown): void;

// `eval` takes source text, which the number-argument path for unbound callees never accepts: the
// refusal names the callee rather than the argument.
eval("1 + 1");
print(1);

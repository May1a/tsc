// Mirrors Test262 language/statements/try/early-catch-function.js: a catch
// parameter cannot be redeclared by a directly nested function declaration.
function f(): void {
  try {
  } catch (e) {
    function e() {}
  }
}

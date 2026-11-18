declare function print(value: unknown): void;

// Throwing from a finally block when there is both a catch and a finally.
// The throw in finally supersedes the pending caught error.
function test(): void {
  try {
    try {
      throw "inner";
    } catch (_e) {
      print("caught");
    } finally {
      throw "from-finally";
    }
  } catch (e) {
    print(e);
  }
}

test(); // caught, from-finally

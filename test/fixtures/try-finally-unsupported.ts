declare function print(value: unknown): void;
try { throw "message"; } finally { print("cleanup"); }

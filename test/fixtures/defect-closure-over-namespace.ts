declare function print(value: unknown): void;

// Namespace globals remain readable from generated functions.
namespace Config {
  export const limit = 7;
}

function readLimit(): number {
  return Config.limit;
}

print(readLimit());

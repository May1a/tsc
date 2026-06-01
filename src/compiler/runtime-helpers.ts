export type RuntimeHelper = "malloc" | "memcpy" | "memcmp" | "strConcat" | "strEquals";

export type RuntimeHelperEmitter = {
  readonly used: Set<RuntimeHelper>;
};

export const createRuntimeHelperEmitter = (): RuntimeHelperEmitter => ({ used: new Set() });

export function useRuntimeHelper(runtime: RuntimeHelperEmitter, helper: RuntimeHelper): void {
  runtime.used.add(helper);
  if (helper === "strConcat") {
    runtime.used.add("malloc");
    runtime.used.add("memcpy");
  }
  if (helper === "strEquals") {
    runtime.used.add("memcmp");
  }
}

export function emitRuntimeDeclarations(runtime: RuntimeHelperEmitter): string[] {
  const declarations: string[] = [];
  const declarationByHelper = new Map<RuntimeHelper, string>([
    ["malloc", "declare ptr @malloc(i64)"],
    ["memcpy", "declare ptr @memcpy(ptr, ptr, i64)"],
    ["memcmp", "declare i32 @memcmp(ptr, ptr, i64)"]
  ]);

  for (const helper of ["malloc", "memcpy", "memcmp"] as const) {
    if (runtime.used.has(helper)) {
      const declaration = declarationByHelper.get(helper);
      if (declaration !== undefined) {
        declarations.push(declaration);
      }
    }
  }

  return declarations;
}

export function emitRuntimeDefinitions(runtime: RuntimeHelperEmitter): string[] {
  const definitions: string[] = [];
  if (runtime.used.has("strConcat")) {
    definitions.push(`define ptr @strConcat(i64 %left.len, ptr %left.ptr, i64 %right.len, ptr %right.ptr) {
entry:
  %total = add i64 %left.len, %right.len
  %alloc.size = add i64 %total, 1
  %out = call ptr @malloc(i64 %alloc.size)
  call ptr @memcpy(ptr %out, ptr %left.ptr, i64 %left.len)
  %right.dst = getelementptr i8, ptr %out, i64 %left.len
  call ptr @memcpy(ptr %right.dst, ptr %right.ptr, i64 %right.len)
  %nul.ptr = getelementptr i8, ptr %out, i64 %total
  store i8 0, ptr %nul.ptr
  ret ptr %out
}
`);
  }
  if (runtime.used.has("strEquals")) {
    definitions.push(`define i1 @strEquals(i64 %left.len, ptr %left.ptr, i64 %right.len, ptr %right.ptr) {
entry:
  %same.len = icmp eq i64 %left.len, %right.len
  br i1 %same.len, label %compare, label %not.equal
compare:
  %cmp = call i32 @memcmp(ptr %left.ptr, ptr %right.ptr, i64 %left.len)
  %same.bytes = icmp eq i32 %cmp, 0
  br i1 %same.bytes, label %equal, label %not.equal
equal:
  ret i1 true
not.equal:
  ret i1 false
}
`);
  }
  return definitions;
}

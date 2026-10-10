define { i64, i1 } @testMap(i64 %argc, ptr %argv, ptr %env, i64 %this) {
entry:
  call void @gcCollect()
  %value = load i64, ptr %argv
  %number = call double @valueNumber(i64 %value)
  %receiver = call double @valueNumber(i64 %this)
  %sum = fadd double %number, %receiver
  %boxed = call i64 @valueBoxNumber(double %sum)
  %result = insertvalue { i64, i1 } zeroinitializer, i64 %boxed, 0
  ret { i64, i1 } %result
}
define { i64, i1 } @testPredicate(i64 %argc, ptr %argv, ptr %env, i64 %this) {
entry:
  call void @gcCollect()
  %value = load i64, ptr %argv
  %number = call double @valueNumber(i64 %value)
  %matches = fcmp ogt double %number, 1.0
  %boxed = select i1 %matches, i64 9222246136947933186, i64 9222246136947933185
  %result = insertvalue { i64, i1 } zeroinitializer, i64 %boxed, 0
  ret { i64, i1 } %result
}
define { i64, i1 } @testFlatMap(i64 %argc, ptr %argv, ptr %env, i64 %this) {
entry:
  call void @gcCollect()
  %value = load i64, ptr %argv
  %array = call ptr @arrayNew(i64 2)
  call void @arraySet(ptr %array, i64 0, i64 %value)
  call void @arraySet(ptr %array, i64 1, i64 %value)
  %boxed = call i64 @valueBoxArray(ptr %array)
  %result = insertvalue { i64, i1 } zeroinitializer, i64 %boxed, 0
  ret { i64, i1 } %result
}
define { i64, i1 } @testThrow(i64 %argc, ptr %argv, ptr %env, i64 %this) {
entry:
  call void @gcCollect()
  %boxed = call i64 @valueBoxNumber(double 42.0)
  %payload = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %result = insertvalue { i64, i1 } %payload, i1 true, 1
  ret { i64, i1 } %result
}
define { i64, i1 } @testReduce(i64 %argc, ptr %argv, ptr %env, i64 %this) {
entry:
  call void @gcCollect()
  %accumulator = load i64, ptr %argv
  %element.slot = getelementptr i64, ptr %argv, i64 1
  %element = load i64, ptr %element.slot
  %left = call double @valueNumber(i64 %accumulator)
  %right = call double @valueNumber(i64 %element)
  %sum = fadd double %left, %right
  %boxed = call i64 @valueBoxNumber(double %sum)
  %result = insertvalue { i64, i1 } zeroinitializer, i64 %boxed, 0
  ret { i64, i1 } %result
}
define void @printCallbackResult({ i64, i1 } %result) {
entry:
  %value = extractvalue { i64, i1 } %result, 0
  %threw = extractvalue { i64, i1 } %result, 1
  %flag = select i1 %threw, i64 9222246136947933186, i64 9222246136947933185
  call void @valuePrint(i64 %flag)
  %is.array = call i1 @valueIsArray(i64 %value)
  br i1 %is.array, label %array, label %scalar
scalar:
  call void @valuePrint(i64 %value)
  ret void
array:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %value)
  %pointer = call ptr @valueArrayPtr(i64 %value)
  %length = call i64 @arrayLength(ptr %pointer)
  %number = uitofp i64 %length to double
  %boxed.length = call i64 @valueBoxNumber(double %number)
  call void @valuePrint(i64 %boxed.length)
  br label %loop
loop:
  %i = phi i64 [ 0, %array ], [ %next, %body ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %exit, label %body
body:
  %element = call i64 @arrayGet(ptr %pointer, i64 %i)
  call void @valuePrint(i64 %element)
  %next = add i64 %i, 1
  br label %loop
exit:
  call void @gcRootRestore(i64 %frame)
  ret void
}
define void @runCallback(ptr %callback.code, ptr %method) {
entry:
  %frame = call i64 @gcRootSave()
  %array = call ptr @arrayNew(i64 3)
  %source = call i64 @valueBoxArray(ptr %array)
  call void @gcRootPush(i64 %source)
  %one = call i64 @valueBoxNumber(double 1.0)
  %two = call i64 @valueBoxNumber(double 2.0)
  %three = call i64 @valueBoxNumber(double 3.0)
  call void @arraySet(ptr %array, i64 0, i64 %one)
  call void @arraySet(ptr %array, i64 1, i64 %two)
  call void @arraySet(ptr %array, i64 2, i64 %three)
  %callback = call i64 @functionObjectNew(ptr %callback.code, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 3)
  %this = call i64 @valueBoxNumber(double 7.0)
  %result = call { i64, i1 } %method(i64 %source, i64 %callback, i64 %this)
  call void @printCallbackResult({ i64, i1 } %result)
  call void @gcRootRestore(i64 %frame)
  ret void
}
define void @runReduction(i64 %length, i1 %has.initial, i1 %reverse) {
entry:
  %frame = call i64 @gcRootSave()
  %array = call ptr @arrayNew(i64 %length)
  %source = call i64 @valueBoxArray(ptr %array)
  call void @gcRootPush(i64 %source)
  %empty = icmp eq i64 %length, 0
  br i1 %empty, label %invoke, label %fill
fill:
  %one = call i64 @valueBoxNumber(double 1.0)
  %two = call i64 @valueBoxNumber(double 2.0)
  %three = call i64 @valueBoxNumber(double 3.0)
  call void @arraySet(ptr %array, i64 0, i64 %one)
  call void @arraySet(ptr %array, i64 1, i64 %two)
  call void @arraySet(ptr %array, i64 2, i64 %three)
  br label %invoke
invoke:
  %callback = call i64 @functionObjectNew(ptr @testReduce, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 4)
  %initial = call i64 @valueBoxNumber(double 7.0)
  %result = call { i64, i1 } @arrayFoldCallback(i64 %source, i64 %callback, i64 %initial, i1 %has.initial, i1 %reverse)
  call void @printCallbackResult({ i64, i1 } %result)
  call void @gcRootRestore(i64 %frame)
  ret void
}
define i32 @main() {
entry:
  call void @gcInit()
  call void @runCallback(ptr @testMap, ptr @arrayMapCallback)
  call void @runCallback(ptr @testPredicate, ptr @arrayFilterCallback)
  call void @runCallback(ptr @testFlatMap, ptr @arrayFlatMapCallback)
  call void @runCallback(ptr @testMap, ptr @arrayForEachCallback)
  call void @runCallback(ptr @testPredicate, ptr @arrayFindCallback)
  call void @runCallback(ptr @testPredicate, ptr @arrayFindIndexCallback)
  call void @runCallback(ptr @testThrow, ptr @arrayMapCallback)
  call void @runReduction(i64 3, i1 true, i1 false)
  call void @runReduction(i64 3, i1 false, i1 false)
  call void @runReduction(i64 3, i1 true, i1 true)
  call void @runReduction(i64 3, i1 false, i1 true)
  call void @runReduction(i64 0, i1 true, i1 false)
  call void @runReduction(i64 0, i1 false, i1 false)
  ret i32 0
}

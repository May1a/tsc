; Method ids: map=0, filter=1, flatMap=2, forEach=3, find=4, findIndex=5.
define { i64, i1 } @arraySortCallback(i64 %source, i64 %callback) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %source)
  call void @gcRootPush(i64 %callback)
  %array = call ptr @valueArrayPtr(i64 %source)
  %length = call i64 @arrayLength(ptr %array)
  %argv = alloca i64, i64 2
  %right.slot = getelementptr i64, ptr %argv, i64 1
  br label %outer
outer:
  %i = phi i64 [ 0, %entry ], [ %next.i, %outer.advance ]
  %outer.done = icmp uge i64 %i, %length
  br i1 %outer.done, label %success, label %inner.start
inner.start:
  %limit = sub i64 %length, 1
  br label %inner
inner:
  %j = phi i64 [ 0, %inner.start ], [ %next.j, %advance ]
  %inner.done = icmp uge i64 %j, %limit
  br i1 %inner.done, label %outer.advance, label %compare
compare:
  %iteration.frame = call i64 @gcRootSave()
  call void @gcSafepoint()
  %next.j = add i64 %j, 1
  %left = call i64 @arrayGet(ptr %array, i64 %j)
  %right = call i64 @arrayGet(ptr %array, i64 %next.j)
  call void @gcRootPush(i64 %left)
  call void @gcRootPush(i64 %right)
  store i64 %left, ptr %argv
  store i64 %right, ptr %right.slot
  %comparison = call { i64, i1 } @jsCall(i64 %callback, i64 2, ptr %argv, i64 9222246136947933184)
  %value = extractvalue { i64, i1 } %comparison, 0
  %threw = extractvalue { i64, i1 } %comparison, 1
  br i1 %threw, label %failure, label %check.swap
check.swap:
  %number = call double @valueToNumber(i64 %value)
  %swap = fcmp ogt double %number, 0.0
  br i1 %swap, label %swap.values, label %advance
swap.values:
  call void @arraySet(ptr %array, i64 %j, i64 %right)
  call void @arraySet(ptr %array, i64 %next.j, i64 %left)
  br label %advance
advance:
  call void @gcRootRestore(i64 %iteration.frame)
  br label %inner
outer.advance:
  %next.i = add i64 %i, 1
  br label %outer
success:
  %ok.value = insertvalue { i64, i1 } undef, i64 %source, 0
  %ok = insertvalue { i64, i1 } %ok.value, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok
failure:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %comparison
}

define { i64, i1 } @arrayVisitCallback(i64 %source, i64 %callback, i64 %this.arg, i8 %method) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %source)
  call void @gcRootPush(i64 %callback)
  call void @gcRootPush(i64 %this.arg)
  %callable = call i1 @valueIsFunction(i64 %callback)
  br i1 %callable, label %prepare, label %invalid.callback
invalid.callback:
  %message = call i64 @iteratorNotCallableMessage(i64 %callback)
  %error = call { i64, i1 } @iteratorTypeError(i64 %message)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %error
prepare:
  %array = call ptr @valueArrayPtr(i64 %source)
  %length = call i64 @arrayLength(ptr %array)
  %produces.array = icmp ule i8 %method, 2
  br i1 %produces.array, label %create.output, label %without.output
create.output:
  %is.map = icmp eq i8 %method, 0
  %output.length = select i1 %is.map, i64 %length, i64 0
  %output = call ptr @arrayNew(i64 %output.length)
  %boxed.output = call i64 @valueBoxArray(ptr %output)
  call void @gcRootPush(i64 %boxed.output)
  br label %ready
without.output:
  br label %ready
ready:
  %result.array = phi ptr [ %output, %create.output ], [ null, %without.output ]
  %array.value = phi i64 [ %boxed.output, %create.output ], [ 9222246136947933184, %without.output ]
  %argv = alloca [3 x i64]
  %arg0 = getelementptr [3 x i64], ptr %argv, i64 0, i64 0
  %arg1 = getelementptr [3 x i64], ptr %argv, i64 0, i64 1
  %arg2 = getelementptr [3 x i64], ptr %argv, i64 0, i64 2
  store i64 %source, ptr %arg2
  %loop.frame = call i64 @gcRootSave()
  br label %loop
loop:
  %index = phi i64 [ 0, %ready ], [ %next, %advance ]
  call void @gcRootRestore(i64 %loop.frame)
  %done = icmp uge i64 %index, %length
  br i1 %done, label %finish, label %invoke
invoke:
  %element = call i64 @arrayGet(ptr %array, i64 %index)
  call void @gcRootPush(i64 %element)
  %index.number = uitofp i64 %index to double
  %index.value = call i64 @valueBoxNumber(double %index.number)
  store i64 %element, ptr %arg0
  store i64 %index.value, ptr %arg1
  %call = call { i64, i1 } @jsCall(i64 %callback, i64 3, ptr %argv, i64 %this.arg)
  %mapped = extractvalue { i64, i1 } %call, 0
  %threw = extractvalue { i64, i1 } %call, 1
  br i1 %threw, label %fail, label %dispatch
fail:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %call
dispatch:
  call void @gcRootPush(i64 %mapped)
  switch i8 %method, label %advance [
    i8 0, label %map
    i8 1, label %filter
    i8 2, label %flatmap
    i8 4, label %find
    i8 5, label %find
  ]
map:
  call void @arraySet(ptr %result.array, i64 %index, i64 %mapped)
  br label %advance
filter:
  %keep = call i1 @valueTruthy(i64 %mapped)
  br i1 %keep, label %append.element, label %advance
append.element:
  call i64 @arrayPush(ptr %result.array, i64 %element)
  br label %advance
flatmap:
  %is.array = call i1 @valueIsArray(i64 %mapped)
  br i1 %is.array, label %append.array, label %append.scalar
append.array:
  %inner = call ptr @valueArrayPtr(i64 %mapped)
  call void @arrayAppendElements(ptr %result.array, ptr %inner)
  br label %advance
append.scalar:
  call i64 @arrayPush(ptr %result.array, i64 %mapped)
  br label %advance
find:
  %matches = call i1 @valueTruthy(i64 %mapped)
  br i1 %matches, label %found, label %advance
found:
  %is.index = icmp eq i8 %method, 5
  %found.value = select i1 %is.index, i64 %index.value, i64 %element
  br label %success
advance:
  %next = add i64 %index, 1
  br label %loop
finish:
  %is.find.index = icmp eq i8 %method, 5
  %missing.index = call i64 @valueBoxNumber(double -1.0)
  %finished.value = select i1 %is.find.index, i64 %missing.index, i64 %array.value
  br label %success
success:
  %value = phi i64 [ %found.value, %found ], [ %finished.value, %finish ]
  %ok.payload = insertvalue { i64, i1 } undef, i64 %value, 0
  %ok = insertvalue { i64, i1 } %ok.payload, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok
}

define { i64, i1 } @arrayMapCallback(i64 %source, i64 %callback, i64 %this.arg) {
entry:
  %result = call { i64, i1 } @arrayVisitCallback(i64 %source, i64 %callback, i64 %this.arg, i8 0)
  ret { i64, i1 } %result
}
define { i64, i1 } @arrayFilterCallback(i64 %source, i64 %callback, i64 %this.arg) {
entry:
  %result = call { i64, i1 } @arrayVisitCallback(i64 %source, i64 %callback, i64 %this.arg, i8 1)
  ret { i64, i1 } %result
}
define { i64, i1 } @arrayFlatMapCallback(i64 %source, i64 %callback, i64 %this.arg) {
entry:
  %result = call { i64, i1 } @arrayVisitCallback(i64 %source, i64 %callback, i64 %this.arg, i8 2)
  ret { i64, i1 } %result
}
define { i64, i1 } @arrayForEachCallback(i64 %source, i64 %callback, i64 %this.arg) {
entry:
  %result = call { i64, i1 } @arrayVisitCallback(i64 %source, i64 %callback, i64 %this.arg, i8 3)
  ret { i64, i1 } %result
}
define { i64, i1 } @arrayFindCallback(i64 %source, i64 %callback, i64 %this.arg) {
entry:
  %result = call { i64, i1 } @arrayVisitCallback(i64 %source, i64 %callback, i64 %this.arg, i8 4)
  ret { i64, i1 } %result
}
define { i64, i1 } @arrayFindIndexCallback(i64 %source, i64 %callback, i64 %this.arg) {
entry:
  %result = call { i64, i1 } @arrayVisitCallback(i64 %source, i64 %callback, i64 %this.arg, i8 5)
  ret { i64, i1 } %result
}

@.callback.reduce.empty = private unnamed_addr constant [44 x i8] c"Reduce of empty array with no initial value\00"
define { i64, i1 } @arrayFoldCallback(i64 %source, i64 %callback, i64 %initial, i1 %has.initial, i1 %reverse) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %source)
  call void @gcRootPush(i64 %callback)
  call void @gcRootPush(i64 %initial)
  %callable = call i1 @valueIsFunction(i64 %callback)
  br i1 %callable, label %prepare, label %invalid.callback
invalid.callback:
  %message = call i64 @iteratorNotCallableMessage(i64 %callback)
  %error = call { i64, i1 } @iteratorTypeError(i64 %message)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %error
prepare:
  %array = call ptr @valueArrayPtr(i64 %source)
  %length = call i64 @arrayLength(ptr %array)
  %last = sub i64 %length, 1
  %start = select i1 %reverse, i64 %last, i64 0
  %step = select i1 %reverse, i64 -1, i64 1
  %empty = icmp eq i64 %length, 0
  %no.initial = xor i1 %has.initial, true
  %invalid.empty = and i1 %empty, %no.initial
  br i1 %invalid.empty, label %empty.error, label %choose.initial
empty.error:
  %empty.message = call i64 @valueBoxString(ptr @.callback.reduce.empty, i64 43)
  %empty.result = call { i64, i1 } @iteratorTypeError(i64 %empty.message)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %empty.result
choose.initial:
  br i1 %has.initial, label %provided.initial, label %first.element
provided.initial:
  br label %ready
first.element:
  %first = call i64 @arrayGet(ptr %array, i64 %start)
  %after.first = add i64 %start, %step
  br label %ready
ready:
  %initial.value = phi i64 [ %initial, %provided.initial ], [ %first, %first.element ]
  %initial.index = phi i64 [ %start, %provided.initial ], [ %after.first, %first.element ]
  %argv = alloca [4 x i64]
  %arg0 = getelementptr [4 x i64], ptr %argv, i64 0, i64 0
  %arg1 = getelementptr [4 x i64], ptr %argv, i64 0, i64 1
  %arg2 = getelementptr [4 x i64], ptr %argv, i64 0, i64 2
  %arg3 = getelementptr [4 x i64], ptr %argv, i64 0, i64 3
  store i64 %source, ptr %arg3
  %loop.frame = call i64 @gcRootSave()
  br label %loop
loop:
  %index = phi i64 [ %initial.index, %ready ], [ %next, %advance ]
  %accumulator = phi i64 [ %initial.value, %ready ], [ %mapped, %advance ]
  call void @gcRootRestore(i64 %loop.frame)
  call void @gcRootPush(i64 %accumulator)
  %done = icmp uge i64 %index, %length
  br i1 %done, label %success, label %invoke
invoke:
  %element = call i64 @arrayGet(ptr %array, i64 %index)
  call void @gcRootPush(i64 %element)
  %index.number = uitofp i64 %index to double
  %index.value = call i64 @valueBoxNumber(double %index.number)
  store i64 %accumulator, ptr %arg0
  store i64 %element, ptr %arg1
  store i64 %index.value, ptr %arg2
  %call = call { i64, i1 } @jsCall(i64 %callback, i64 4, ptr %argv, i64 9222246136947933184)
  %mapped = extractvalue { i64, i1 } %call, 0
  %threw = extractvalue { i64, i1 } %call, 1
  br i1 %threw, label %fail, label %advance
advance:
  %next = add i64 %index, %step
  br label %loop
fail:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %call
success:
  %payload = insertvalue { i64, i1 } undef, i64 %accumulator, 0
  %result = insertvalue { i64, i1 } %payload, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %result
}
define { i64, i1 } @arrayReduceCallback(i64 %source, i64 %callback, i64 %initial, i1 %has.initial) {
entry:
  %result = call { i64, i1 } @arrayFoldCallback(i64 %source, i64 %callback, i64 %initial, i1 %has.initial, i1 false)
  ret { i64, i1 } %result
}
define { i64, i1 } @arrayReduceRightCallback(i64 %source, i64 %callback, i64 %initial, i1 %has.initial) {
entry:
  %result = call { i64, i1 } @arrayFoldCallback(i64 %source, i64 %callback, i64 %initial, i1 %has.initial, i1 true)
  ret { i64, i1 } %result
}

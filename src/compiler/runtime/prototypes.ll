; Array.prototype methods as functions of the uniform ABI. A property read on an array that finds no
; own property looks its key up in @arrayPrototypeMethods, and the result is an ordinary function
; object, so a dynamic call such as `row.join("-")` on a boxed array runs the method with the array
; as `this`. Each method converts its arguments as ECMA-262 specifies and reuses the array helpers
; that statically lowered calls use.
@.array.method.not.array = private unnamed_addr constant [54 x i8] c"Array.prototype method called on a value not an array\00"
@.array.method.comma = private unnamed_addr constant [2 x i8] c",\00"

@.array.method.name.at = private unnamed_addr constant [3 x i8] c"at\00"
@.array.method.name.concat = private unnamed_addr constant [7 x i8] c"concat\00"
@.array.method.name.copyWithin = private unnamed_addr constant [11 x i8] c"copyWithin\00"
@.array.method.name.entries = private unnamed_addr constant [8 x i8] c"entries\00"
@.array.method.name.fill = private unnamed_addr constant [5 x i8] c"fill\00"
@.array.method.name.filter = private unnamed_addr constant [7 x i8] c"filter\00"
@.array.method.name.find = private unnamed_addr constant [5 x i8] c"find\00"
@.array.method.name.findIndex = private unnamed_addr constant [10 x i8] c"findIndex\00"
@.array.method.name.flat = private unnamed_addr constant [5 x i8] c"flat\00"
@.array.method.name.flatMap = private unnamed_addr constant [8 x i8] c"flatMap\00"
@.array.method.name.forEach = private unnamed_addr constant [8 x i8] c"forEach\00"
@.array.method.name.includes = private unnamed_addr constant [9 x i8] c"includes\00"
@.array.method.name.indexOf = private unnamed_addr constant [8 x i8] c"indexOf\00"
@.array.method.name.join = private unnamed_addr constant [5 x i8] c"join\00"
@.array.method.name.keys = private unnamed_addr constant [5 x i8] c"keys\00"
@.array.method.name.lastIndexOf = private unnamed_addr constant [12 x i8] c"lastIndexOf\00"
@.array.method.name.map = private unnamed_addr constant [4 x i8] c"map\00"
@.array.method.name.pop = private unnamed_addr constant [4 x i8] c"pop\00"
@.array.method.name.push = private unnamed_addr constant [5 x i8] c"push\00"
@.array.method.name.reduce = private unnamed_addr constant [7 x i8] c"reduce\00"
@.array.method.name.reduceRight = private unnamed_addr constant [12 x i8] c"reduceRight\00"
@.array.method.name.reverse = private unnamed_addr constant [8 x i8] c"reverse\00"
@.array.method.name.shift = private unnamed_addr constant [6 x i8] c"shift\00"
@.array.method.name.slice = private unnamed_addr constant [6 x i8] c"slice\00"
@.array.method.name.sort = private unnamed_addr constant [5 x i8] c"sort\00"
@.array.method.name.splice = private unnamed_addr constant [7 x i8] c"splice\00"
@.array.method.name.toString = private unnamed_addr constant [9 x i8] c"toString\00"
@.array.method.name.unshift = private unnamed_addr constant [8 x i8] c"unshift\00"
@.array.method.name.values = private unnamed_addr constant [7 x i8] c"values\00"
@.array.method.name.every = private unnamed_addr constant [6 x i8] c"every\00"
@.array.method.name.some = private unnamed_addr constant [5 x i8] c"some\00"
@.array.method.name.findLast = private unnamed_addr constant [9 x i8] c"findLast\00"
@.array.method.name.findLastIndex = private unnamed_addr constant [14 x i8] c"findLastIndex\00"
@.array.method.name.toReversed = private unnamed_addr constant [11 x i8] c"toReversed\00"
@.array.method.name.toSorted = private unnamed_addr constant [9 x i8] c"toSorted\00"
@.array.method.name.toSpliced = private unnamed_addr constant [10 x i8] c"toSpliced\00"
@.array.method.name.with = private unnamed_addr constant [5 x i8] c"with\00"
@.array.range.error.name = private unnamed_addr constant [11 x i8] c"RangeError\00"
@.array.invalid.index = private unnamed_addr constant [14 x i8] c"Invalid index\00"

; { key length, key bytes, method, arity } for every method a property read on an array can return.
@arrayPrototypeMethods = private unnamed_addr constant [38 x { i64, ptr, ptr, i64 }] [
  { i64, ptr, ptr, i64 } { i64 2, ptr @.array.method.name.at, ptr @arrayAtMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 6, ptr @.array.method.name.concat, ptr @arrayConcatMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 10, ptr @.array.method.name.copyWithin, ptr @arrayCopyWithinMethod, i64 2 },
  { i64, ptr, ptr, i64 } { i64 7, ptr @.array.method.name.entries, ptr @arrayEntriesMethod, i64 0 },
  { i64, ptr, ptr, i64 } { i64 4, ptr @.array.method.name.fill, ptr @arrayFillMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 6, ptr @.array.method.name.filter, ptr @arrayFilterMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 4, ptr @.array.method.name.find, ptr @arrayFindMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 9, ptr @.array.method.name.findIndex, ptr @arrayFindIndexMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 4, ptr @.array.method.name.flat, ptr @arrayFlatMethod, i64 0 },
  { i64, ptr, ptr, i64 } { i64 7, ptr @.array.method.name.flatMap, ptr @arrayFlatMapMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 7, ptr @.array.method.name.forEach, ptr @arrayForEachMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 8, ptr @.array.method.name.includes, ptr @arrayIncludesMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 7, ptr @.array.method.name.indexOf, ptr @arrayIndexOfMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 4, ptr @.array.method.name.join, ptr @arrayJoinMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 4, ptr @.array.method.name.keys, ptr @arrayKeysMethod, i64 0 },
  { i64, ptr, ptr, i64 } { i64 11, ptr @.array.method.name.lastIndexOf, ptr @arrayLastIndexOfMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 3, ptr @.array.method.name.map, ptr @arrayMapMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 3, ptr @.array.method.name.pop, ptr @arrayPopMethod, i64 0 },
  { i64, ptr, ptr, i64 } { i64 4, ptr @.array.method.name.push, ptr @arrayPushMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 6, ptr @.array.method.name.reduce, ptr @arrayReduceMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 11, ptr @.array.method.name.reduceRight, ptr @arrayReduceRightMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 7, ptr @.array.method.name.reverse, ptr @arrayReverseMethod, i64 0 },
  { i64, ptr, ptr, i64 } { i64 5, ptr @.array.method.name.shift, ptr @arrayShiftMethod, i64 0 },
  { i64, ptr, ptr, i64 } { i64 5, ptr @.array.method.name.slice, ptr @arraySliceMethod, i64 2 },
  { i64, ptr, ptr, i64 } { i64 4, ptr @.array.method.name.sort, ptr @arraySortMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 6, ptr @.array.method.name.splice, ptr @arraySpliceMethod, i64 2 },
  { i64, ptr, ptr, i64 } { i64 8, ptr @.array.method.name.toString, ptr @arrayToStringMethod, i64 0 },
  { i64, ptr, ptr, i64 } { i64 7, ptr @.array.method.name.unshift, ptr @arrayUnshiftMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 6, ptr @.array.method.name.values, ptr @arrayValuesMethod, i64 0 },
  { i64, ptr, ptr, i64 } { i64 5, ptr @.array.method.name.every, ptr @arrayEveryMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 4, ptr @.array.method.name.some, ptr @arraySomeMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 8, ptr @.array.method.name.findLast, ptr @arrayFindLastMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 13, ptr @.array.method.name.findLastIndex, ptr @arrayFindLastIndexMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 10, ptr @.array.method.name.toReversed, ptr @arrayToReversedMethod, i64 0 },
  { i64, ptr, ptr, i64 } { i64 8, ptr @.array.method.name.toSorted, ptr @arrayToSortedMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 9, ptr @.array.method.name.toSpliced, ptr @arrayToSplicedMethod, i64 2 },
  { i64, ptr, ptr, i64 } { i64 4, ptr @.array.method.name.with, ptr @arrayWithMethod, i64 2 },
  { i64, ptr, ptr, i64 } { i64 18, ptr @.symbol.iterator.key, ptr @arrayIteratorMethod, i64 0 }
]

; Cache slots are GC roots for the runtime lifetime, independent of any receiver or caller.
; Zero means the lazy function object has not been allocated yet.
@arrayPrototypeFunctions = private global [37 x i64] zeroinitializer

define void @arrayPrototypeInit() {
entry:
  br label %loop
loop:
  %index = phi i64 [ 0, %entry ], [ %next, %body ]
  %done = icmp eq i64 %index, 37
  br i1 %done, label %finish, label %body
body:
  %slot = getelementptr [37 x i64], ptr @arrayPrototypeFunctions, i64 0, i64 %index
  store i64 0, ptr %slot
  call void @gcRegisterGlobalRoot(ptr %slot)
  %next = add i64 %index, 1
  br label %loop
finish:
  ret void
}

; The shared function named by the key, or undefined when no builtin matches.
define i64 @arrayPrototypeMethod(i64 %key.len, ptr %key.ptr) {
entry:
  br label %scan
scan:
  %index = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %index, 38
  br i1 %done, label %missing, label %check.length
check.length:
  %length.slot = getelementptr [38 x { i64, ptr, ptr, i64 }], ptr @arrayPrototypeMethods, i64 0, i64 %index, i32 0
  %length = load i64, ptr %length.slot
  %same.length = icmp eq i64 %length, %key.len
  br i1 %same.length, label %check.name, label %advance
check.name:
  %name.slot = getelementptr [38 x { i64, ptr, ptr, i64 }], ptr @arrayPrototypeMethods, i64 0, i64 %index, i32 1
  %name = load ptr, ptr %name.slot
  %comparison = call i32 @memcmp(ptr %key.ptr, ptr %name, i64 %key.len)
  %same.name = icmp eq i32 %comparison, 0
  br i1 %same.name, label %found, label %advance
found:
  ; Array.prototype[Symbol.iterator] is the same function as Array.prototype.values.
  %is.iterator = icmp eq i64 %index, 37
  %canonical = select i1 %is.iterator, i64 28, i64 %index
  %cache.slot = getelementptr [37 x i64], ptr @arrayPrototypeFunctions, i64 0, i64 %canonical
  %cached = load i64, ptr %cache.slot
  %uninitialized = icmp eq i64 %cached, 0
  br i1 %uninitialized, label %create, label %reuse
reuse:
  ret i64 %cached
create:
  %method.slot = getelementptr [38 x { i64, ptr, ptr, i64 }], ptr @arrayPrototypeMethods, i64 0, i64 %canonical, i32 2
  %method = load ptr, ptr %method.slot
  %arity.slot = getelementptr [38 x { i64, ptr, ptr, i64 }], ptr @arrayPrototypeMethods, i64 0, i64 %canonical, i32 3
  %arity = load i64, ptr %arity.slot
  %canonical.name.slot = getelementptr [38 x { i64, ptr, ptr, i64 }], ptr @arrayPrototypeMethods, i64 0, i64 %canonical, i32 1
  %canonical.name = load ptr, ptr %canonical.name.slot
  %canonical.length.slot = getelementptr [38 x { i64, ptr, ptr, i64 }], ptr @arrayPrototypeMethods, i64 0, i64 %canonical, i32 0
  %canonical.length = load i64, ptr %canonical.length.slot
  %name.value = call i64 @valueBoxString(ptr %canonical.name, i64 %canonical.length)
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %name.value)
  %function = call i64 @functionObjectNew(ptr %method, ptr null, i64 9222246136947933184, i64 %name.value, i64 %arity)
  store i64 %function, ptr %cache.slot
  call void @gcRootRestore(i64 %frame)
  ret i64 %function
advance:
  %next = add i64 %index, 1
  br label %scan
missing:
  ret i64 9222246136947933184
}

; The TypeError for a method whose `this` is not an array, for example after `.call(other)`.
define { i64, i1 } @arrayMethodReceiverError() {
entry:
  %message = call i64 @valueBoxString(ptr @.array.method.not.array, i64 53)
  %error = call { i64, i1 } @iteratorTypeError(i64 %message)
  ret { i64, i1 } %error
}

define { i64, i1 } @arrayMethodResult(i64 %value) {
entry:
  %result.0 = insertvalue { i64, i1 } undef, i64 %value, 0
  %result.1 = insertvalue { i64, i1 } %result.0, i1 false, 1
  ret { i64, i1 } %result.1
}

; Argument `index`, or undefined when the call passed fewer arguments.
define i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 %index) {
entry:
  %present = icmp ult i64 %index, %argc
  br i1 %present, label %load, label %absent
load:
  %slot = getelementptr i64, ptr %argv, i64 %index
  %value = load i64, ptr %slot
  ret i64 %value
absent:
  ret i64 9222246136947933184
}

; Argument `index` as ToIntegerOrInfinity, or `default` when it is undefined or absent. Negative
; positions stay negative; each helper resolves them against the length.
define i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 %index, i64 %default) {
entry:
  %value = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 %index)
  %undefined = icmp eq i64 %value, 9222246136947933184
  br i1 %undefined, label %fallback, label %convert
fallback:
  ret i64 %default
convert:
  %number = call double @valueToNumber(i64 %value)
  %position = call i64 @numberToIndex(double %number)
  ret i64 %position
}

define { i64, i1 } @arrayJoinMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %separator, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
separator:
  %argument = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %default = icmp eq i64 %argument, 9222246136947933184
  br i1 %default, label %comma, label %convert
comma:
  br label %join
convert:
  %converted = call { ptr, i64 } @valueToString(i64 %argument)
  %converted.ptr = extractvalue { ptr, i64 } %converted, 0
  %converted.len = extractvalue { ptr, i64 } %converted, 1
  br label %join
join:
  %separator.ptr = phi ptr [ @.array.method.comma, %comma ], [ %converted.ptr, %convert ]
  %separator.len = phi i64 [ 1, %comma ], [ %converted.len, %convert ]
  %array = call ptr @valueArrayPtr(i64 %this.value)
  %bytes = call ptr @arrayJoin(ptr %array, i64 %separator.len, ptr %separator.ptr)
  %length = call i64 @strlen(ptr %bytes)
  %string = call i64 @valueBoxString(ptr %bytes, i64 %length)
  %result = call { i64, i1 } @arrayMethodResult(i64 %string)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayToStringMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %result = call { i64, i1 } @arrayJoinMethod(i64 0, ptr null, ptr %env, i64 %this.value)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayPushMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %push, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
push:
  %array = call ptr @valueArrayPtr(i64 %this.value)
  br label %loop
loop:
  %index = phi i64 [ 0, %push ], [ %next, %body ]
  %done = icmp uge i64 %index, %argc
  br i1 %done, label %finish, label %body
body:
  %slot = getelementptr i64, ptr %argv, i64 %index
  %value = load i64, ptr %slot
  call i64 @arrayPush(ptr %array, i64 %value)
  %next = add i64 %index, 1
  br label %loop
finish:
  %length = call i64 @arrayLength(ptr %array)
  %length.number = uitofp i64 %length to double
  %length.value = call i64 @valueBoxNumber(double %length.number)
  %result = call { i64, i1 } @arrayMethodResult(i64 %length.value)
  ret { i64, i1 } %result
}

; Inserts from the last argument to the first, so the arguments keep their order at the front.
define { i64, i1 } @arrayUnshiftMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %unshift, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
unshift:
  %array = call ptr @valueArrayPtr(i64 %this.value)
  br label %loop
loop:
  %remaining = phi i64 [ %argc, %unshift ], [ %index, %body ]
  %done = icmp eq i64 %remaining, 0
  br i1 %done, label %finish, label %body
body:
  %index = sub i64 %remaining, 1
  %slot = getelementptr i64, ptr %argv, i64 %index
  %value = load i64, ptr %slot
  call i64 @arrayUnshift(ptr %array, i64 %value)
  br label %loop
finish:
  %length = call i64 @arrayLength(ptr %array)
  %length.number = uitofp i64 %length to double
  %length.value = call i64 @valueBoxNumber(double %length.number)
  %result = call { i64, i1 } @arrayMethodResult(i64 %length.value)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayPopMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %pop, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
pop:
  %array = call ptr @valueArrayPtr(i64 %this.value)
  %value = call i64 @arrayPop(ptr %array)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayShiftMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %shift, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
shift:
  %array = call ptr @valueArrayPtr(i64 %this.value)
  %value = call i64 @arrayShift(ptr %array)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayReverseMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %reverse, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
reverse:
  %array = call ptr @valueArrayPtr(i64 %this.value)
  call void @arrayReverse(ptr %array)
  %result = call { i64, i1 } @arrayMethodResult(i64 %this.value)
  ret { i64, i1 } %result
}

define { i64, i1 } @arraySliceMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %slice, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
slice:
  %array = call ptr @valueArrayPtr(i64 %this.value)
  %length = call i64 @arrayLength(ptr %array)
  %start = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 0)
  %end = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 1, i64 %length)
  %sliced = call ptr @arraySlice(ptr %array, i64 %start, i64 %end)
  %sliced.value = call i64 @valueBoxArray(ptr %sliced)
  %result = call { i64, i1 } @arrayMethodResult(i64 %sliced.value)
  ret { i64, i1 } %result
}

; With no arguments nothing is deleted; with only a start everything from it is. An explicit
; undefined delete count is 0.
define { i64, i1 } @arraySpliceMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %splice, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
splice:
  %array = call ptr @valueArrayPtr(i64 %this.value)
  %length = call i64 @arrayLength(ptr %array)
  %start = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 0)
  %start.only = icmp eq i64 %argc, 1
  %delete.default = select i1 %start.only, i64 %length, i64 0
  %delete = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 1, i64 %delete.default)
  %items = call ptr @arrayFromArgv(i64 %argc, ptr %argv, i64 2)
  %item.count = call i64 @arrayLength(ptr %items)
  %removed = call ptr @arraySplice(ptr %array, i64 %start, i64 %delete, i64 %item.count, ptr %items)
  %removed.value = call i64 @valueBoxArray(ptr %removed)
  %result = call { i64, i1 } @arrayMethodResult(i64 %removed.value)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayConcatMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %concat, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
concat:
  %array = call ptr @valueArrayPtr(i64 %this.value)
  %arguments = call ptr @arrayFromArgv(i64 %argc, ptr %argv, i64 0)
  %joined = call ptr @arrayConcat(ptr %array, ptr %arguments)
  %joined.value = call i64 @valueBoxArray(ptr %joined)
  %result = call { i64, i1 } @arrayMethodResult(i64 %joined.value)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayFlatMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %flat, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
flat:
  %array = call ptr @valueArrayPtr(i64 %this.value)
  %depth = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 1)
  %flattened = call ptr @arrayFlat(ptr %array, i64 %depth)
  %flattened.value = call i64 @valueBoxArray(ptr %flattened)
  %result = call { i64, i1 } @arrayMethodResult(i64 %flattened.value)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayAtMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %at, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
at:
  %array = call ptr @valueArrayPtr(i64 %this.value)
  %index = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 0)
  %value = call i64 @arrayAt(ptr %array, i64 %index)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

; A start position searches the slice from it, which resolves a negative position like `includes`.
define { i64, i1 } @arrayIncludesMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %includes, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
includes:
  %array = call ptr @valueArrayPtr(i64 %this.value)
  %needle = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %from = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 1, i64 0)
  %whole = icmp eq i64 %from, 0
  br i1 %whole, label %search, label %narrow
narrow:
  %length = call i64 @arrayLength(ptr %array)
  %tail = call ptr @arraySlice(ptr %array, i64 %from, i64 %length)
  br label %search
search:
  %searched = phi ptr [ %array, %includes ], [ %tail, %narrow ]
  %found = call i1 @arrayIncludes(ptr %searched, i64 %needle)
  %found.value = select i1 %found, i64 9222246136947933186, i64 9222246136947933185
  %result = call { i64, i1 } @arrayMethodResult(i64 %found.value)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayIndexOfMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %search, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
search:
  %array = call ptr @valueArrayPtr(i64 %this.value)
  %needle = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %from = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 1, i64 0)
  %index = call i64 @arrayIndexOf(ptr %array, i64 %needle, i64 %from)
  %index.number = sitofp i64 %index to double
  %index.value = call i64 @valueBoxNumber(double %index.number)
  %result = call { i64, i1 } @arrayMethodResult(i64 %index.value)
  ret { i64, i1 } %result
}

; Without a start position the search begins at the last element; an explicit undefined is 0.
define { i64, i1 } @arrayLastIndexOfMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %search, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
search:
  %array = call ptr @valueArrayPtr(i64 %this.value)
  %needle = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %from.given = icmp uge i64 %argc, 2
  %from.default = select i1 %from.given, i64 0, i64 9223372036854775807
  %from = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 1, i64 %from.default)
  %index = call i64 @arrayLastIndexOf(ptr %array, i64 %needle, i64 %from)
  %index.number = sitofp i64 %index to double
  %index.value = call i64 @valueBoxNumber(double %index.number)
  %result = call { i64, i1 } @arrayMethodResult(i64 %index.value)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayFillMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %fill, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
fill:
  %array = call ptr @valueArrayPtr(i64 %this.value)
  %length = call i64 @arrayLength(ptr %array)
  %value = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %start = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 1, i64 0)
  %end = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 2, i64 %length)
  call void @arrayFill(ptr %array, i64 %value, i64 %start, i64 %end)
  %result = call { i64, i1 } @arrayMethodResult(i64 %this.value)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayCopyWithinMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %copy, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
copy:
  %array = call ptr @valueArrayPtr(i64 %this.value)
  %length = call i64 @arrayLength(ptr %array)
  %target = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 0)
  %start = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 1, i64 0)
  %end = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 2, i64 %length)
  call void @arrayCopyWithin(ptr %array, i64 %target, i64 %start, i64 %end)
  %result = call { i64, i1 } @arrayMethodResult(i64 %this.value)
  ret { i64, i1 } %result
}

; The callback helpers check the callback and root their operands across calls.
define { i64, i1 } @arrayMapMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %visit, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
visit:
  %callback = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %this.arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %result = call { i64, i1 } @arrayMapCallback(i64 %this.value, i64 %callback, i64 %this.arg)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayFilterMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %visit, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
visit:
  %callback = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %this.arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %result = call { i64, i1 } @arrayFilterCallback(i64 %this.value, i64 %callback, i64 %this.arg)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayFlatMapMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %visit, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
visit:
  %callback = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %this.arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %result = call { i64, i1 } @arrayFlatMapCallback(i64 %this.value, i64 %callback, i64 %this.arg)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayForEachMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %visit, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
visit:
  %callback = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %this.arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %result = call { i64, i1 } @arrayForEachCallback(i64 %this.value, i64 %callback, i64 %this.arg)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayFindMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %visit, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
visit:
  %callback = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %this.arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %result = call { i64, i1 } @arrayFindCallback(i64 %this.value, i64 %callback, i64 %this.arg)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayFindIndexMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %visit, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
visit:
  %callback = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %this.arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %result = call { i64, i1 } @arrayFindIndexCallback(i64 %this.value, i64 %callback, i64 %this.arg)
  ret { i64, i1 } %result
}

; An initial value is present whenever the call passes a second argument, even undefined.
define { i64, i1 } @arrayReduceMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %fold, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
fold:
  %callback = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %initial = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %has.initial = icmp uge i64 %argc, 2
  %result = call { i64, i1 } @arrayReduceCallback(i64 %this.value, i64 %callback, i64 %initial, i1 %has.initial)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayReduceRightMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %fold, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
fold:
  %callback = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %initial = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %has.initial = icmp uge i64 %argc, 2
  %result = call { i64, i1 } @arrayReduceRightCallback(i64 %this.value, i64 %callback, i64 %initial, i1 %has.initial)
  ret { i64, i1 } %result
}

; A comparator must be a function or undefined.
define { i64, i1 } @arraySortMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %comparator, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
comparator:
  %compare = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %default = icmp eq i64 %compare, 9222246136947933184
  br i1 %default, label %sort.default, label %check.callable
sort.default:
  %array = call ptr @valueArrayPtr(i64 %this.value)
  call void @arraySortDefault(ptr %array)
  %sorted = call { i64, i1 } @arrayMethodResult(i64 %this.value)
  ret { i64, i1 } %sorted
check.callable:
  %callable = call i1 @valueIsFunction(i64 %compare)
  br i1 %callable, label %sort.callback, label %invalid
invalid:
  %message = call i64 @iteratorNotCallableMessage(i64 %compare)
  %invalid.error = call { i64, i1 } @iteratorTypeError(i64 %message)
  ret { i64, i1 } %invalid.error
sort.callback:
  %result = call { i64, i1 } @arraySortCallback(i64 %this.value, i64 %compare)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayEveryMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %visit, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
visit:
  %callback = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %this.arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %result = call { i64, i1 } @arrayEveryCallback(i64 %this.value, i64 %callback, i64 %this.arg)
  ret { i64, i1 } %result
}

define { i64, i1 } @arraySomeMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %visit, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
visit:
  %callback = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %this.arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %result = call { i64, i1 } @arraySomeCallback(i64 %this.value, i64 %callback, i64 %this.arg)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayFindLastMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %visit, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
visit:
  %callback = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %this.arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %result = call { i64, i1 } @arrayFindLastCallback(i64 %this.value, i64 %callback, i64 %this.arg)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayFindLastIndexMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %visit, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
visit:
  %callback = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %this.arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %result = call { i64, i1 } @arrayFindLastIndexCallback(i64 %this.value, i64 %callback, i64 %this.arg)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayToReversedMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %copy, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  ret { i64, i1 } %error
copy:
  %array = call ptr @valueArrayPtr(i64 %this.value)
  %length = call i64 @arrayLength(ptr %array)
  %copied = call ptr @arraySlice(ptr %array, i64 0, i64 %length)
  call void @arrayReverse(ptr %copied)
  %copied.value = call i64 @valueBoxArray(ptr %copied)
  %result = call { i64, i1 } @arrayMethodResult(i64 %copied.value)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayToSortedMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %this.value)
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %comparator, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %error
comparator:
  %compare = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  call void @gcRootPush(i64 %compare)
  %default = icmp eq i64 %compare, 9222246136947933184
  br i1 %default, label %sort.default, label %check.callable
check.callable:
  %callable = call i1 @valueIsFunction(i64 %compare)
  br i1 %callable, label %sort.callback, label %invalid
invalid:
  %message = call i64 @iteratorNotCallableMessage(i64 %compare)
  %invalid.error = call { i64, i1 } @iteratorTypeError(i64 %message)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %invalid.error
sort.default:
  %array.d = call ptr @valueArrayPtr(i64 %this.value)
  %length.d = call i64 @arrayLength(ptr %array.d)
  %copy.d = call ptr @arraySlice(ptr %array.d, i64 0, i64 %length.d)
  call void @arraySortDefault(ptr %copy.d)
  %copy.d.val = call i64 @valueBoxArray(ptr %copy.d)
  %sorted = call { i64, i1 } @arrayMethodResult(i64 %copy.d.val)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %sorted
sort.callback:
  %array.c = call ptr @valueArrayPtr(i64 %this.value)
  %length.c = call i64 @arrayLength(ptr %array.c)
  %copy.c = call ptr @arraySlice(ptr %array.c, i64 0, i64 %length.c)
  %copy.c.val = call i64 @valueBoxArray(ptr %copy.c)
  call void @gcRootPush(i64 %copy.c.val)
  %result = call { i64, i1 } @arraySortCallback(i64 %copy.c.val, i64 %compare)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayToSplicedMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %this.value)
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %splice, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %error
splice:
  %array = call ptr @valueArrayPtr(i64 %this.value)
  %length = call i64 @arrayLength(ptr %array)
  %start = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 0)
  %start.only = icmp eq i64 %argc, 1
  %delete.default = select i1 %start.only, i64 %length, i64 0
  %delete = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 1, i64 %delete.default)
  %copy = call ptr @arraySlice(ptr %array, i64 0, i64 %length)
  %copy.value = call i64 @valueBoxArray(ptr %copy)
  call void @gcRootPush(i64 %copy.value)
  %items = call ptr @arrayFromArgv(i64 %argc, ptr %argv, i64 2)
  %items.value = call i64 @valueBoxArray(ptr %items)
  call void @gcRootPush(i64 %items.value)
  %item.count = call i64 @arrayLength(ptr %items)
  call ptr @arraySplice(ptr %copy, i64 %start, i64 %delete, i64 %item.count, ptr %items)
  %result = call { i64, i1 } @arrayMethodResult(i64 %copy.value)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %result
}

define { i64, i1 } @arrayWithMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %this.value)
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %prepare, label %not.array
not.array:
  %error = call { i64, i1 } @arrayMethodReceiverError()
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %error
prepare:
  %array = call ptr @valueArrayPtr(i64 %this.value)
  %length = call i64 @arrayLength(ptr %array)
  %raw.index = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 0)
  %new.value = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  call void @gcRootPush(i64 %new.value)
  %is.neg = icmp slt i64 %raw.index, 0
  %adjusted = add i64 %length, %raw.index
  %actual = select i1 %is.neg, i64 %adjusted, i64 %raw.index
  %too.low = icmp slt i64 %actual, 0
  %too.high = icmp sge i64 %actual, %length
  %oob = or i1 %too.low, %too.high
  br i1 %oob, label %range.error, label %copy
range.error:
  %msg = call i64 @valueBoxString(ptr @.array.invalid.index, i64 13)
  %err.obj = call ptr @errorNew(i64 3, i64 10, ptr @.array.range.error.name, i64 %msg)
  %err.val = call i64 @valueBoxObject(ptr %err.obj)
  %t0 = insertvalue { i64, i1 } undef, i64 %err.val, 0
  %t1 = insertvalue { i64, i1 } %t0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %t1
copy:
  %copied = call ptr @arraySlice(ptr %array, i64 0, i64 %length)
  call void @arraySet(ptr %copied, i64 %actual, i64 %new.value)
  %copied.value = call i64 @valueBoxArray(ptr %copied)
  %result = call { i64, i1 } @arrayMethodResult(i64 %copied.value)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %result
}

; First-class Map / Set / WeakMap / WeakSet prototype methods and `.size` lookup.
@.col.method.not.col = private unnamed_addr constant [50 x i8] c"Collection method called on incompatible receiver\00"
@.col.key.size = private unnamed_addr constant [5 x i8] c"size\00"
@.col.name.get = private unnamed_addr constant [4 x i8] c"get\00"
@.col.name.set = private unnamed_addr constant [4 x i8] c"set\00"
@.col.name.add = private unnamed_addr constant [4 x i8] c"add\00"
@.col.name.has = private unnamed_addr constant [4 x i8] c"has\00"
@.col.name.delete = private unnamed_addr constant [7 x i8] c"delete\00"
@.col.name.clear = private unnamed_addr constant [6 x i8] c"clear\00"
@.col.name.keys = private unnamed_addr constant [5 x i8] c"keys\00"
@.col.name.values = private unnamed_addr constant [7 x i8] c"values\00"
@.col.name.entries = private unnamed_addr constant [8 x i8] c"entries\00"
@.col.name.forEach = private unnamed_addr constant [8 x i8] c"forEach\00"

; { keyLen, keyPtr, methodPtr, arity, kindMask (bit0=Map, bit1=Set, bit2=WeakMap, bit3=WeakSet) }
@collectionPrototypeMethods = private unnamed_addr constant [14 x { i64, ptr, ptr, i64, i64 }] [
  { i64, ptr, ptr, i64, i64 } { i64 3, ptr @.col.name.get, ptr @collectionGetMethod, i64 1, i64 5 },
  { i64, ptr, ptr, i64, i64 } { i64 3, ptr @.col.name.set, ptr @collectionSetMethod, i64 2, i64 5 },
  { i64, ptr, ptr, i64, i64 } { i64 3, ptr @.col.name.add, ptr @collectionAddMethod, i64 1, i64 10 },
  { i64, ptr, ptr, i64, i64 } { i64 3, ptr @.col.name.has, ptr @collectionHasMethod, i64 1, i64 15 },
  { i64, ptr, ptr, i64, i64 } { i64 6, ptr @.col.name.delete, ptr @collectionDeleteMethod, i64 1, i64 15 },
  { i64, ptr, ptr, i64, i64 } { i64 5, ptr @.col.name.clear, ptr @collectionClearMethod, i64 0, i64 3 },
  { i64, ptr, ptr, i64, i64 } { i64 4, ptr @.col.name.keys, ptr @mapKeysMethod, i64 0, i64 1 },
  { i64, ptr, ptr, i64, i64 } { i64 6, ptr @.col.name.values, ptr @mapValuesMethod, i64 0, i64 1 },
  { i64, ptr, ptr, i64, i64 } { i64 7, ptr @.col.name.entries, ptr @mapEntriesMethod, i64 0, i64 1 },
  { i64, ptr, ptr, i64, i64 } { i64 7, ptr @.col.name.forEach, ptr @mapForEachMethod, i64 1, i64 1 },
  { i64, ptr, ptr, i64, i64 } { i64 4, ptr @.col.name.keys, ptr @setKeysMethod, i64 0, i64 2 },
  { i64, ptr, ptr, i64, i64 } { i64 6, ptr @.col.name.values, ptr @setValuesMethod, i64 0, i64 2 },
  { i64, ptr, ptr, i64, i64 } { i64 7, ptr @.col.name.entries, ptr @setEntriesMethod, i64 0, i64 2 },
  { i64, ptr, ptr, i64, i64 } { i64 7, ptr @.col.name.forEach, ptr @setForEachMethod, i64 1, i64 2 }
]

@collectionPrototypeFunctions = private global [14 x i64] zeroinitializer

define void @collectionPrototypeInit() {
entry:
  br label %loop
loop:
  %index = phi i64 [ 0, %entry ], [ %next, %body ]
  %done = icmp eq i64 %index, 14
  br i1 %done, label %finish, label %body
body:
  %slot = getelementptr [14 x i64], ptr @collectionPrototypeFunctions, i64 0, i64 %index
  store i64 0, ptr %slot
  call void @gcRegisterGlobalRoot(ptr %slot)
  %next = add i64 %index, 1
  br label %loop
finish:
  ret void
}

define i64 @collectionCachedMethod(i64 %index) {
entry:
  %cache.slot = getelementptr [14 x i64], ptr @collectionPrototypeFunctions, i64 0, i64 %index
  %cached = load i64, ptr %cache.slot
  %uninit = icmp eq i64 %cached, 0
  br i1 %uninit, label %create, label %reuse
reuse:
  ret i64 %cached
create:
  %name.len.slot = getelementptr [14 x { i64, ptr, ptr, i64, i64 }], ptr @collectionPrototypeMethods, i64 0, i64 %index, i32 0
  %name.len = load i64, ptr %name.len.slot
  %name.ptr.slot = getelementptr [14 x { i64, ptr, ptr, i64, i64 }], ptr @collectionPrototypeMethods, i64 0, i64 %index, i32 1
  %name.ptr = load ptr, ptr %name.ptr.slot
  %fn.ptr.slot = getelementptr [14 x { i64, ptr, ptr, i64, i64 }], ptr @collectionPrototypeMethods, i64 0, i64 %index, i32 2
  %fn.ptr = load ptr, ptr %fn.ptr.slot
  %arity.slot = getelementptr [14 x { i64, ptr, ptr, i64, i64 }], ptr @collectionPrototypeMethods, i64 0, i64 %index, i32 3
  %arity = load i64, ptr %arity.slot
  %name.val = call i64 @valueBoxString(ptr %name.ptr, i64 %name.len)
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %name.val)
  %fn = call i64 @functionObjectNew(ptr %fn.ptr, ptr null, i64 9222246136947933184, i64 %name.val, i64 %arity)
  store i64 %fn, ptr %cache.slot
  call void @gcRootRestore(i64 %frame)
  ret i64 %fn
}

@.col.key.toString = private unnamed_addr constant [9 x i8] c"toString\00"
@.col.tag.map = private unnamed_addr constant [13 x i8] c"[object Map]\00"
@.col.tag.set = private unnamed_addr constant [13 x i8] c"[object Set]\00"
@.col.tag.weakmap = private unnamed_addr constant [17 x i8] c"[object WeakMap]\00"
@.col.tag.weakset = private unnamed_addr constant [17 x i8] c"[object WeakSet]\00"
@collectionTags = private unnamed_addr constant [4 x { i64, ptr }] [
  { i64, ptr } { i64 12, ptr @.col.tag.map },
  { i64, ptr } { i64 12, ptr @.col.tag.set },
  { i64, ptr } { i64 16, ptr @.col.tag.weakmap },
  { i64, ptr } { i64 16, ptr @.col.tag.weakset }
]

; Object.prototype.toString for a collection, named by its kind.
define { i64, i1 } @collectionToStringMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.collection = call i1 @valueIsCollection(i64 %this.value)
  br i1 %is.collection, label %name, label %refuse
refuse:
  %error = call { i64, i1 } @collectionMethodReceiverError()
  ret { i64, i1 } %error
name:
  %collection = call ptr @valueObjectPtr(i64 %this.value)
  %kind = call i64 @collectionKind(ptr %collection)
  %entry.slot = getelementptr [4 x { i64, ptr }], ptr @collectionTags, i64 0, i64 %kind
  %length = load i64, ptr %entry.slot
  %bytes.slot = getelementptr { i64, ptr }, ptr %entry.slot, i64 0, i32 1
  %bytes = load ptr, ptr %bytes.slot
  %text = call i64 @valueBoxString(ptr %bytes, i64 %length)
  %result = call { i64, i1 } @arrayMethodResult(i64 %text)
  ret { i64, i1 } %result
}

define i64 @collectionPropertyGet(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %col = call ptr @valueObjectPtr(i64 %value)
  %kind = call i64 @collectionKind(ptr %col)
  %kind.bit = shl i64 1, %kind
  %is.sized = icmp ult i64 %kind, 2
  %is.size.len = icmp eq i64 %key.len, 4
  %check.size = and i1 %is.sized, %is.size.len
  br i1 %check.size, label %size.cmp, label %check.iter
size.cmp:
  %scmp = call i32 @memcmp(ptr %key.ptr, ptr @.col.key.size, i64 4)
  %is.size = icmp eq i32 %scmp, 0
  br i1 %is.size, label %ret.size, label %check.iter
ret.size:
  %sz = call i64 @collectionSize(ptr %col)
  %sz.d = uitofp i64 %sz to double
  %sz.v = call i64 @valueBoxNumber(double %sz.d)
  ret i64 %sz.v
check.iter:
  %is.iter.len = icmp eq i64 %key.len, 18
  br i1 %is.iter.len, label %iter.cmp, label %scan.start
iter.cmp:
  %icmp = call i32 @memcmp(ptr %key.ptr, ptr @.symbol.iterator.key, i64 18)
  %is.iter = icmp eq i32 %icmp, 0
  br i1 %is.iter, label %iter.lookup, label %scan.start
iter.lookup:
  %override.slot = getelementptr i8, ptr %col, i64 32
  %override = load i64, ptr %override.slot
  %has.override = icmp ne i64 %override, 9222246136947933184
  br i1 %has.override, label %iter.override, label %iter.default
iter.override:
  ret i64 %override
iter.default:
  %is.map = icmp eq i64 %kind, 0
  br i1 %is.map, label %iter.map, label %iter.check.set
iter.map:
  %map.iter = call i64 @collectionCachedMethod(i64 8)
  ret i64 %map.iter
iter.check.set:
  %is.set = icmp eq i64 %kind, 1
  br i1 %is.set, label %iter.set, label %missing
iter.set:
  %set.iter = call i64 @collectionCachedMethod(i64 11)
  ret i64 %set.iter
scan.start:
  br label %scan
scan:
  %index = phi i64 [ 0, %scan.start ], [ %next, %advance ]
  %done = icmp eq i64 %index, 14
  br i1 %done, label %missing, label %check.mask
check.mask:
  %mask.slot = getelementptr [14 x { i64, ptr, ptr, i64, i64 }], ptr @collectionPrototypeMethods, i64 0, i64 %index, i32 4
  %mask = load i64, ptr %mask.slot
  %masked = and i64 %mask, %kind.bit
  %kind.ok = icmp ne i64 %masked, 0
  br i1 %kind.ok, label %check.len, label %advance
check.len:
  %len.slot = getelementptr [14 x { i64, ptr, ptr, i64, i64 }], ptr @collectionPrototypeMethods, i64 0, i64 %index, i32 0
  %len = load i64, ptr %len.slot
  %same.len = icmp eq i64 %len, %key.len
  br i1 %same.len, label %check.name, label %advance
check.name:
  %name.slot = getelementptr [14 x { i64, ptr, ptr, i64, i64 }], ptr @collectionPrototypeMethods, i64 0, i64 %index, i32 1
  %name = load ptr, ptr %name.slot
  %cmp = call i32 @memcmp(ptr %key.ptr, ptr %name, i64 %key.len)
  %same.name = icmp eq i32 %cmp, 0
  br i1 %same.name, label %found, label %advance
found:
  %method = call i64 @collectionCachedMethod(i64 %index)
  ret i64 %method
advance:
  %next = add i64 %index, 1
  br label %scan
missing:
  %is.tostring.length = icmp eq i64 %key.len, 8
  br i1 %is.tostring.length, label %compare.tostring, label %inherited
compare.tostring:
  %tostring.comparison = call i32 @memcmp(ptr %key.ptr, ptr @.col.key.toString, i64 8)
  %is.tostring = icmp eq i32 %tostring.comparison, 0
  br i1 %is.tostring, label %tostring, label %inherited
tostring:
  %tostring.method = call i64 @functionObjectNew(ptr @collectionToStringMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  ret i64 %tostring.method
inherited:
  %object.prototype = call ptr @objectDefaultPrototype()
  %inherited.value = call i64 @objectGet(ptr %object.prototype, i64 %key.len, ptr %key.ptr)
  ret i64 %inherited.value
}

define { i64, i1 } @collectionMethodReceiverError() {
entry:
  %msg = call i64 @valueBoxString(ptr @.col.method.not.col, i64 49)
  %err = call { i64, i1 } @iteratorTypeError(i64 %msg)
  ret { i64, i1 } %err
}

define { i64, i1 } @collectionGetMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %ok = call i1 @valueIsCollection(i64 %this.value)
  br i1 %ok, label %run, label %bad
bad:
  %err = call { i64, i1 } @collectionMethodReceiverError()
  ret { i64, i1 } %err
run:
  %col = call ptr @valueObjectPtr(i64 %this.value)
  %key = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %val = call i64 @collectionGet(ptr %col, i64 %key)
  %res = call { i64, i1 } @arrayMethodResult(i64 %val)
  ret { i64, i1 } %res
}

define { i64, i1 } @collectionSetMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %ok = call i1 @valueIsCollection(i64 %this.value)
  br i1 %ok, label %run, label %bad
bad:
  %err = call { i64, i1 } @collectionMethodReceiverError()
  ret { i64, i1 } %err
run:
  %col = call ptr @valueObjectPtr(i64 %this.value)
  %key = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %val = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  call void @collectionSet(ptr %col, i64 %key, i64 %val)
  %res = call { i64, i1 } @arrayMethodResult(i64 %this.value)
  ret { i64, i1 } %res
}

define { i64, i1 } @collectionAddMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %ok = call i1 @valueIsCollection(i64 %this.value)
  br i1 %ok, label %run, label %bad
bad:
  %err = call { i64, i1 } @collectionMethodReceiverError()
  ret { i64, i1 } %err
run:
  %col = call ptr @valueObjectPtr(i64 %this.value)
  %val = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  call void @collectionSet(ptr %col, i64 %val, i64 9222246136947933186)
  %res = call { i64, i1 } @arrayMethodResult(i64 %this.value)
  ret { i64, i1 } %res
}

define { i64, i1 } @collectionHasMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %ok = call i1 @valueIsCollection(i64 %this.value)
  br i1 %ok, label %run, label %bad
bad:
  %err = call { i64, i1 } @collectionMethodReceiverError()
  ret { i64, i1 } %err
run:
  %col = call ptr @valueObjectPtr(i64 %this.value)
  %key = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %has = call i1 @collectionHas(ptr %col, i64 %key)
  %boxed = select i1 %has, i64 9222246136947933186, i64 9222246136947933185
  %res = call { i64, i1 } @arrayMethodResult(i64 %boxed)
  ret { i64, i1 } %res
}

define { i64, i1 } @collectionDeleteMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %ok = call i1 @valueIsCollection(i64 %this.value)
  br i1 %ok, label %run, label %bad
bad:
  %err = call { i64, i1 } @collectionMethodReceiverError()
  ret { i64, i1 } %err
run:
  %col = call ptr @valueObjectPtr(i64 %this.value)
  %key = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %deleted = call i1 @collectionDelete(ptr %col, i64 %key)
  %boxed = select i1 %deleted, i64 9222246136947933186, i64 9222246136947933185
  %res = call { i64, i1 } @arrayMethodResult(i64 %boxed)
  ret { i64, i1 } %res
}

define { i64, i1 } @collectionClearMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %ok = call i1 @valueIsCollection(i64 %this.value)
  br i1 %ok, label %run, label %bad
bad:
  %err = call { i64, i1 } @collectionMethodReceiverError()
  ret { i64, i1 } %err
run:
  %col = call ptr @valueObjectPtr(i64 %this.value)
  call void @collectionClear(ptr %col)
  %res = call { i64, i1 } @arrayMethodResult(i64 9222246136947933184)
  ret { i64, i1 } %res
}

define { i64, i1 } @mapKeysMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %ok = call i1 @valueIsCollection(i64 %this.value)
  br i1 %ok, label %run, label %bad
bad:
  %err = call { i64, i1 } @collectionMethodReceiverError()
  ret { i64, i1 } %err
run:
  %col = call ptr @valueObjectPtr(i64 %this.value)
  %it = call i64 @createCollectionIterator(ptr %col, i64 2, i64 0)
  %res = call { i64, i1 } @arrayMethodResult(i64 %it)
  ret { i64, i1 } %res
}

define { i64, i1 } @mapValuesMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %ok = call i1 @valueIsCollection(i64 %this.value)
  br i1 %ok, label %run, label %bad
bad:
  %err = call { i64, i1 } @collectionMethodReceiverError()
  ret { i64, i1 } %err
run:
  %col = call ptr @valueObjectPtr(i64 %this.value)
  %it = call i64 @createCollectionIterator(ptr %col, i64 2, i64 1)
  %res = call { i64, i1 } @arrayMethodResult(i64 %it)
  ret { i64, i1 } %res
}

define { i64, i1 } @mapEntriesMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %ok = call i1 @valueIsCollection(i64 %this.value)
  br i1 %ok, label %run, label %bad
bad:
  %err = call { i64, i1 } @collectionMethodReceiverError()
  ret { i64, i1 } %err
run:
  %col = call ptr @valueObjectPtr(i64 %this.value)
  %it = call i64 @createCollectionIterator(ptr %col, i64 2, i64 2)
  %res = call { i64, i1 } @arrayMethodResult(i64 %it)
  ret { i64, i1 } %res
}

define { i64, i1 } @setKeysMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %ok = call i1 @valueIsCollection(i64 %this.value)
  br i1 %ok, label %run, label %bad
bad:
  %err = call { i64, i1 } @collectionMethodReceiverError()
  ret { i64, i1 } %err
run:
  %col = call ptr @valueObjectPtr(i64 %this.value)
  %it = call i64 @createCollectionIterator(ptr %col, i64 3, i64 0)
  %res = call { i64, i1 } @arrayMethodResult(i64 %it)
  ret { i64, i1 } %res
}

define { i64, i1 } @setValuesMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %ok = call i1 @valueIsCollection(i64 %this.value)
  br i1 %ok, label %run, label %bad
bad:
  %err = call { i64, i1 } @collectionMethodReceiverError()
  ret { i64, i1 } %err
run:
  %col = call ptr @valueObjectPtr(i64 %this.value)
  %it = call i64 @createCollectionIterator(ptr %col, i64 3, i64 1)
  %res = call { i64, i1 } @arrayMethodResult(i64 %it)
  ret { i64, i1 } %res
}

define { i64, i1 } @setEntriesMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %ok = call i1 @valueIsCollection(i64 %this.value)
  br i1 %ok, label %run, label %bad
bad:
  %err = call { i64, i1 } @collectionMethodReceiverError()
  ret { i64, i1 } %err
run:
  %col = call ptr @valueObjectPtr(i64 %this.value)
  %it = call i64 @createCollectionIterator(ptr %col, i64 3, i64 2)
  %res = call { i64, i1 } @arrayMethodResult(i64 %it)
  ret { i64, i1 } %res
}

define { i64, i1 } @mapForEachMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %ok = call i1 @valueIsCollection(i64 %this.value)
  br i1 %ok, label %run, label %bad
bad:
  %err = call { i64, i1 } @collectionMethodReceiverError()
  ret { i64, i1 } %err
run:
  %col = call ptr @valueObjectPtr(i64 %this.value)
  %cb = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %this.arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %res = call { i64, i1 } @collectionForEach(ptr %col, i1 true, i64 %cb, i64 %this.arg)
  ret { i64, i1 } %res
}

define { i64, i1 } @setForEachMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %ok = call i1 @valueIsCollection(i64 %this.value)
  br i1 %ok, label %run, label %bad
bad:
  %err = call { i64, i1 } @collectionMethodReceiverError()
  ret { i64, i1 } %err
run:
  %col = call ptr @valueObjectPtr(i64 %this.value)
  %cb = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %this.arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %res = call { i64, i1 } @collectionForEach(ptr %col, i1 false, i64 %cb, i64 %this.arg)
  ret { i64, i1 } %res
}

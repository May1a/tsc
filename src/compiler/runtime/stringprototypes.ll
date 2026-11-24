; String.prototype methods as functions of the uniform ABI. A property read on a string that names no
; character or length looks its key up in @stringPrototypeMethods, so a dynamic call such as
; `value.includes("x")` runs the method with the string as `this`. Each method converts its arguments
; as ECMA-262 specifies and reuses the helpers that statically lowered calls use.
@.string.method.not.string = private unnamed_addr constant [55 x i8] c"String.prototype method called on a value not a string\00"
@.string.method.callback = private unnamed_addr constant [48 x i8] c"A replacer callback needs a static string type.\00"
@.string.method.space = private unnamed_addr constant [2 x i8] c" \00"
@.string.method.empty = private unnamed_addr constant [1 x i8] c"\00"

@.string.method.name.at = private unnamed_addr constant [3 x i8] c"at\00"
@.string.method.name.charAt = private unnamed_addr constant [7 x i8] c"charAt\00"
@.string.method.name.charCodeAt = private unnamed_addr constant [11 x i8] c"charCodeAt\00"
@.string.method.name.concat = private unnamed_addr constant [7 x i8] c"concat\00"
@.string.method.name.endsWith = private unnamed_addr constant [9 x i8] c"endsWith\00"
@.string.method.name.includes = private unnamed_addr constant [9 x i8] c"includes\00"
@.string.method.name.indexOf = private unnamed_addr constant [8 x i8] c"indexOf\00"
@.string.method.name.lastIndexOf = private unnamed_addr constant [12 x i8] c"lastIndexOf\00"
@.string.method.name.localeCompare = private unnamed_addr constant [14 x i8] c"localeCompare\00"
@.string.method.name.match = private unnamed_addr constant [6 x i8] c"match\00"
@.string.method.name.normalize = private unnamed_addr constant [10 x i8] c"normalize\00"
@.string.method.name.padEnd = private unnamed_addr constant [7 x i8] c"padEnd\00"
@.string.method.name.padStart = private unnamed_addr constant [9 x i8] c"padStart\00"
@.string.method.name.repeat = private unnamed_addr constant [7 x i8] c"repeat\00"
@.string.method.name.replace = private unnamed_addr constant [8 x i8] c"replace\00"
@.string.method.name.replaceAll = private unnamed_addr constant [11 x i8] c"replaceAll\00"
@.string.method.name.search = private unnamed_addr constant [7 x i8] c"search\00"
@.string.method.name.slice = private unnamed_addr constant [6 x i8] c"slice\00"
@.string.method.name.split = private unnamed_addr constant [6 x i8] c"split\00"
@.string.method.name.startsWith = private unnamed_addr constant [11 x i8] c"startsWith\00"
@.string.method.name.substr = private unnamed_addr constant [7 x i8] c"substr\00"
@.string.method.name.substring = private unnamed_addr constant [10 x i8] c"substring\00"
@.string.method.name.toLowerCase = private unnamed_addr constant [12 x i8] c"toLowerCase\00"
@.string.method.name.toString = private unnamed_addr constant [9 x i8] c"toString\00"
@.string.method.name.toUpperCase = private unnamed_addr constant [12 x i8] c"toUpperCase\00"
@.string.method.name.trim = private unnamed_addr constant [5 x i8] c"trim\00"
@.string.method.name.trimEnd = private unnamed_addr constant [8 x i8] c"trimEnd\00"
@.string.method.name.trimStart = private unnamed_addr constant [10 x i8] c"trimStart\00"
@.string.method.name.valueOf = private unnamed_addr constant [8 x i8] c"valueOf\00"

; { key length, key bytes, method, arity } for every method a property read on a string can return.
@stringPrototypeMethods = private unnamed_addr constant [29 x { i64, ptr, ptr, i64 }] [
  { i64, ptr, ptr, i64 } { i64 2, ptr @.string.method.name.at, ptr @stringAtMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 6, ptr @.string.method.name.charAt, ptr @stringCharAtMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 10, ptr @.string.method.name.charCodeAt, ptr @stringCharCodeAtMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 6, ptr @.string.method.name.concat, ptr @stringConcatMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 8, ptr @.string.method.name.endsWith, ptr @stringEndsWithMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 8, ptr @.string.method.name.includes, ptr @stringIncludesMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 7, ptr @.string.method.name.indexOf, ptr @stringIndexOfMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 11, ptr @.string.method.name.lastIndexOf, ptr @stringLastIndexOfMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 13, ptr @.string.method.name.localeCompare, ptr @stringLocaleCompareMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 5, ptr @.string.method.name.match, ptr @stringMatchMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 9, ptr @.string.method.name.normalize, ptr @stringNormalizeMethod, i64 0 },
  { i64, ptr, ptr, i64 } { i64 6, ptr @.string.method.name.padEnd, ptr @stringPadEndMethod, i64 2 },
  { i64, ptr, ptr, i64 } { i64 8, ptr @.string.method.name.padStart, ptr @stringPadStartMethod, i64 2 },
  { i64, ptr, ptr, i64 } { i64 6, ptr @.string.method.name.repeat, ptr @stringRepeatMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 7, ptr @.string.method.name.replace, ptr @stringReplaceMethod, i64 2 },
  { i64, ptr, ptr, i64 } { i64 10, ptr @.string.method.name.replaceAll, ptr @stringReplaceAllMethod, i64 2 },
  { i64, ptr, ptr, i64 } { i64 6, ptr @.string.method.name.search, ptr @stringSearchMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 5, ptr @.string.method.name.slice, ptr @stringSliceMethod, i64 2 },
  { i64, ptr, ptr, i64 } { i64 5, ptr @.string.method.name.split, ptr @stringSplitMethod, i64 2 },
  { i64, ptr, ptr, i64 } { i64 10, ptr @.string.method.name.startsWith, ptr @stringStartsWithMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 6, ptr @.string.method.name.substr, ptr @stringSubstrMethod, i64 2 },
  { i64, ptr, ptr, i64 } { i64 9, ptr @.string.method.name.substring, ptr @stringSubstringMethod, i64 2 },
  { i64, ptr, ptr, i64 } { i64 11, ptr @.string.method.name.toLowerCase, ptr @stringToLowerCaseMethod, i64 0 },
  { i64, ptr, ptr, i64 } { i64 8, ptr @.string.method.name.toString, ptr @stringToStringMethod, i64 0 },
  { i64, ptr, ptr, i64 } { i64 11, ptr @.string.method.name.toUpperCase, ptr @stringToUpperCaseMethod, i64 0 },
  { i64, ptr, ptr, i64 } { i64 4, ptr @.string.method.name.trim, ptr @stringTrimMethod, i64 0 },
  { i64, ptr, ptr, i64 } { i64 7, ptr @.string.method.name.trimEnd, ptr @stringTrimEndMethod, i64 0 },
  { i64, ptr, ptr, i64 } { i64 9, ptr @.string.method.name.trimStart, ptr @stringTrimStartMethod, i64 0 },
  { i64, ptr, ptr, i64 } { i64 7, ptr @.string.method.name.valueOf, ptr @stringValueOfMethod, i64 0 }
]

; Cache slots are GC roots for the runtime lifetime, so a method keeps one identity across reads.
; Zero means the lazy function object has not been allocated yet.
@stringPrototypeFunctions = private global [29 x i64] zeroinitializer

define void @stringPrototypeInit() {
entry:
  call void @builtinCacheInit(ptr @stringPrototypeFunctions, i64 29)
  call void @builtinCacheInit(ptr @numberPrototypeFunctions, i64 5)
  call void @builtinCacheInit(ptr @booleanPrototypeFunctions, i64 2)
  ret void
}

define void @builtinCacheInit(ptr %cache, i64 %count) {
entry:
  br label %loop
loop:
  %index = phi i64 [ 0, %entry ], [ %next, %body ]
  %done = icmp eq i64 %index, %count
  br i1 %done, label %finish, label %body
body:
  %slot = getelementptr i64, ptr %cache, i64 %index
  store i64 0, ptr %slot
  call void @gcRegisterGlobalRoot(ptr %slot)
  %next = add i64 %index, 1
  br label %loop
finish:
  ret void
}

; The shared function named by the key, or undefined when no builtin matches.
define i64 @stringPrototypeMethod(i64 %key.len, ptr %key.ptr) {
entry:
  %method = call i64 @builtinMethod(ptr @stringPrototypeMethods, ptr @stringPrototypeFunctions, i64 29, i64 %key.len, ptr %key.ptr)
  ret i64 %method
}

; Finds the key among `count` table entries. The function object is allocated on first use and kept in
; the matching cache slot, which its owner registers as a GC root.
define i64 @builtinMethod(ptr %table, ptr %cache, i64 %count, i64 %key.len, ptr %key.ptr) {
entry:
  br label %scan
scan:
  %index = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %index, %count
  br i1 %done, label %missing, label %check.length
check.length:
  %entry.slot = getelementptr { i64, ptr, ptr, i64 }, ptr %table, i64 %index
  %length = load i64, ptr %entry.slot
  %same.length = icmp eq i64 %length, %key.len
  br i1 %same.length, label %check.name, label %advance
check.name:
  %name.slot = getelementptr { i64, ptr, ptr, i64 }, ptr %entry.slot, i64 0, i32 1
  %name = load ptr, ptr %name.slot
  %comparison = call i32 @memcmp(ptr %key.ptr, ptr %name, i64 %key.len)
  %same.name = icmp eq i32 %comparison, 0
  br i1 %same.name, label %found, label %advance
found:
  %cache.slot = getelementptr i64, ptr %cache, i64 %index
  %cached = load i64, ptr %cache.slot
  %uninitialized = icmp eq i64 %cached, 0
  br i1 %uninitialized, label %create, label %reuse
reuse:
  ret i64 %cached
create:
  %method.slot = getelementptr { i64, ptr, ptr, i64 }, ptr %entry.slot, i64 0, i32 2
  %method = load ptr, ptr %method.slot
  %arity.slot = getelementptr { i64, ptr, ptr, i64 }, ptr %entry.slot, i64 0, i32 3
  %arity = load i64, ptr %arity.slot
  %name.value = call i64 @valueBoxString(ptr %name, i64 %length)
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

; Number.prototype and Boolean.prototype methods, found the same way.
@.primitive.method.toString = private unnamed_addr constant [9 x i8] c"toString\00"
@.primitive.method.valueOf = private unnamed_addr constant [8 x i8] c"valueOf\00"
@.primitive.method.toFixed = private unnamed_addr constant [8 x i8] c"toFixed\00"
@.primitive.method.toPrecision = private unnamed_addr constant [12 x i8] c"toPrecision\00"
@.primitive.method.toExponential = private unnamed_addr constant [14 x i8] c"toExponential\00"
@.primitive.method.receiver = private unnamed_addr constant [51 x i8] c"Primitive method called on a value of another type\00"

@numberPrototypeMethods = private unnamed_addr constant [5 x { i64, ptr, ptr, i64 }] [
  { i64, ptr, ptr, i64 } { i64 8, ptr @.primitive.method.toString, ptr @numberToStringMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 7, ptr @.primitive.method.valueOf, ptr @numberValueOfMethod, i64 0 },
  { i64, ptr, ptr, i64 } { i64 7, ptr @.primitive.method.toFixed, ptr @numberToFixedMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 11, ptr @.primitive.method.toPrecision, ptr @numberToPrecisionMethod, i64 1 },
  { i64, ptr, ptr, i64 } { i64 13, ptr @.primitive.method.toExponential, ptr @numberToExponentialMethod, i64 1 }
]
@booleanPrototypeMethods = private unnamed_addr constant [2 x { i64, ptr, ptr, i64 }] [
  { i64, ptr, ptr, i64 } { i64 8, ptr @.primitive.method.toString, ptr @booleanToStringMethod, i64 0 },
  { i64, ptr, ptr, i64 } { i64 7, ptr @.primitive.method.valueOf, ptr @booleanValueOfMethod, i64 0 }
]
@numberPrototypeFunctions = private global [5 x i64] zeroinitializer
@booleanPrototypeFunctions = private global [2 x i64] zeroinitializer

; The method a property read on a number or boolean finds, or undefined.
define i64 @scalarPropertyGet(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %is.boolean = call i1 @valueIsBoolean(i64 %value)
  br i1 %is.boolean, label %boolean, label %check.number
boolean:
  %boolean.method = call i64 @builtinMethod(ptr @booleanPrototypeMethods, ptr @booleanPrototypeFunctions, i64 2, i64 %key.len, ptr %key.ptr)
  ret i64 %boolean.method
check.number:
  %is.number = call i1 @valueIsNumberForSameValueZero(i64 %value)
  br i1 %is.number, label %number, label %missing
number:
  %number.method = call i64 @builtinMethod(ptr @numberPrototypeMethods, ptr @numberPrototypeFunctions, i64 5, i64 %key.len, ptr %key.ptr)
  ret i64 %number.method
missing:
  ret i64 9222246136947933184
}

define i1 @valueIsBoolean(i64 %value) {
entry:
  %is.false = icmp eq i64 %value, 9222246136947933185
  %is.true = icmp eq i64 %value, 9222246136947933186
  %is.boolean = or i1 %is.false, %is.true
  ret i1 %is.boolean
}

define { i64, i1 } @primitiveMethodReceiverError() {
entry:
  %message = call i64 @valueBoxString(ptr @.primitive.method.receiver, i64 50)
  %error = call { i64, i1 } @iteratorTypeError(i64 %message)
  ret { i64, i1 } %error
}
define { i64, i1 } @numberToFixedMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.number = call i1 @valueIsNumberForSameValueZero(i64 %this.value)
  br i1 %is.number, label %format, label %refuse
refuse:
  %error = call { i64, i1 } @primitiveMethodReceiverError()
  ret { i64, i1 } %error
format:
  %number = call double @valueNumber(i64 %this.value)
  %digits = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 0)
  %digits.number = sitofp i64 %digits to double
  %text = call { ptr, i64 } @numberToFixed(double %number, double %digits.number)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @numberToPrecisionMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.number = call i1 @valueIsNumberForSameValueZero(i64 %this.value)
  br i1 %is.number, label %format, label %refuse
refuse:
  %error = call { i64, i1 } @primitiveMethodReceiverError()
  ret { i64, i1 } %error
format:
  %number = call double @valueNumber(i64 %this.value)
  %digits = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 0)
  %digits.number = sitofp i64 %digits to double
  %text = call { ptr, i64 } @numberToPrecision(double %number, double %digits.number)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @numberToExponentialMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.number = call i1 @valueIsNumberForSameValueZero(i64 %this.value)
  br i1 %is.number, label %format, label %refuse
refuse:
  %error = call { i64, i1 } @primitiveMethodReceiverError()
  ret { i64, i1 } %error
format:
  %number = call double @valueNumber(i64 %this.value)
  %digits = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 0)
  %digits.number = sitofp i64 %digits to double
  %text = call { ptr, i64 } @numberToExponential(double %number, double %digits.number)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @numberToStringMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.number = call i1 @valueIsNumberForSameValueZero(i64 %this.value)
  br i1 %is.number, label %format, label %refuse
refuse:
  %error = call { i64, i1 } @primitiveMethodReceiverError()
  ret { i64, i1 } %error
format:
  %number = call double @valueNumber(i64 %this.value)
  %radix = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 10)
  %radix.number = sitofp i64 %radix to double
  %text = call { ptr, i64 } @numberToStringRadix(double %number, double %radix.number)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @numberValueOfMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.receiver = call i1 @valueIsNumberForSameValueZero(i64 %this.value)
  br i1 %is.receiver, label %answer, label %refuse
refuse:
  %error = call { i64, i1 } @primitiveMethodReceiverError()
  ret { i64, i1 } %error
answer:
  %result = call { i64, i1 } @arrayMethodResult(i64 %this.value)
  ret { i64, i1 } %result
}

define { i64, i1 } @booleanValueOfMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.receiver = call i1 @valueIsBoolean(i64 %this.value)
  br i1 %is.receiver, label %answer, label %refuse
refuse:
  %error = call { i64, i1 } @primitiveMethodReceiverError()
  ret { i64, i1 } %error
answer:
  %result = call { i64, i1 } @arrayMethodResult(i64 %this.value)
  ret { i64, i1 } %result
}

define { i64, i1 } @booleanToStringMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.receiver = call i1 @valueIsBoolean(i64 %this.value)
  br i1 %is.receiver, label %answer, label %refuse
refuse:
  %error = call { i64, i1 } @primitiveMethodReceiverError()
  ret { i64, i1 } %error
answer:
  %text = call { ptr, i64 } @valueToString(i64 %this.value)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}
; `this` as a string. A nullish receiver is a TypeError; any other value converts.
define { i64, i1 } @stringMethodReceiver(i64 %this.value) {
entry:
  %is.undefined = icmp eq i64 %this.value, 9222246136947933184
  %is.null = icmp eq i64 %this.value, 9222246136947933187
  %nullish = or i1 %is.undefined, %is.null
  br i1 %nullish, label %refuse, label %convert
convert:
  %completion = call { i64, i1 } @valueToStringObservable(i64 %this.value, i1 false)
  ret { i64, i1 } %completion
refuse:
  %message = call i64 @valueBoxString(ptr @.string.method.not.string, i64 54)
  %error = call { i64, i1 } @iteratorTypeError(i64 %message)
  ret { i64, i1 } %error
}

; Argument `index` as a string value. An absent argument converts as undefined.
define { i64, i1 } @stringMethodText(i64 %argc, ptr %argv, i64 %index) {
entry:
  %argument = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 %index)
  %completion = call { i64, i1 } @valueToStringObservable(i64 %argument, i1 false)
  ret { i64, i1 } %completion
}

define { i64, i1 } @stringAtMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringAtMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %index = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 0)
  %text = call { ptr, i64 } @stringAt(i64 %length, ptr %bytes, i64 %index)
  %missing.ptr = extractvalue { ptr, i64 } %text, 0
  %missing = icmp eq ptr %missing.ptr, null
  br i1 %missing, label %absent, label %present
absent:
  %undefined = call { i64, i1 } @arrayMethodResult(i64 9222246136947933184)
  ret { i64, i1 } %undefined
present:
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringCharAtMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringCharAtMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %index = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 0)
  %text = call { ptr, i64 } @stringCharAt(i64 %length, ptr %bytes, i64 %index)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringCharCodeAtMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringCharCodeAtMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %index = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 0)
  %number = call double @stringCharCodeAt(i64 %length, ptr %bytes, i64 %index)
  %value = call i64 @valueBoxNumber(double %number)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringConcatMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringConcatMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %accumulated.slot = alloca i64
  store i64 %this.value, ptr %accumulated.slot
  %frame = call i64 @gcRootSave()
  call void @gcRootPushSlot(ptr %accumulated.slot)
  br label %loop
loop:
  %index = phi i64 [ 0, %is.string.receiver ], [ %next, %append ]
  %done = icmp uge i64 %index, %argc
  br i1 %done, label %finish, label %convert
convert:
  %part.completion = call { i64, i1 } @stringMethodText(i64 %argc, ptr %argv, i64 %index)
  %part.threw = extractvalue { i64, i1 } %part.completion, 1
  br i1 %part.threw, label %failed, label %append
failed:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %part.completion
append:
  %part = extractvalue { i64, i1 } %part.completion, 0
  %part.ptr = call ptr @valueStringPtr(i64 %part)
  %part.len = call i64 @valueStringLength(i64 %part)
  %accumulated = load i64, ptr %accumulated.slot
  %accumulated.ptr = call ptr @valueStringPtr(i64 %accumulated)
  %accumulated.len = call i64 @valueStringLength(i64 %accumulated)
  %joined.ptr = call ptr @strConcat(i64 %accumulated.len, ptr %accumulated.ptr, i64 %part.len, ptr %part.ptr)
  %joined.len = add i64 %accumulated.len, %part.len
  %joined = call i64 @valueBoxString(ptr %joined.ptr, i64 %joined.len)
  store i64 %joined, ptr %accumulated.slot
  %next = add i64 %index, 1
  br label %loop
finish:
  %final = load i64, ptr %accumulated.slot
  call void @gcRootRestore(i64 %frame)
  %result = call { i64, i1 } @arrayMethodResult(i64 %final)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringEndsWithMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringEndsWithMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %search.completion = call { i64, i1 } @stringMethodText(i64 %argc, ptr %argv, i64 0)
  %search.threw = extractvalue { i64, i1 } %search.completion, 1
  br i1 %search.threw, label %search.failed, label %search.ready
search.failed:
  ret { i64, i1 } %search.completion
search.ready:
  %search.value = extractvalue { i64, i1 } %search.completion, 0
  %search.ptr = call ptr @valueStringPtr(i64 %search.value)
  %search.len = call i64 @valueStringLength(i64 %search.value)
  %answer = call i1 @stringEndsWith(i64 %length, ptr %bytes, i64 %search.len, ptr %search.ptr)
  %value = select i1 %answer, i64 9222246136947933186, i64 9222246136947933185
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringIncludesMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringIncludesMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %search.completion = call { i64, i1 } @stringMethodText(i64 %argc, ptr %argv, i64 0)
  %search.threw = extractvalue { i64, i1 } %search.completion, 1
  br i1 %search.threw, label %search.failed, label %search.ready
search.failed:
  ret { i64, i1 } %search.completion
search.ready:
  %search.value = extractvalue { i64, i1 } %search.completion, 0
  %search.ptr = call ptr @valueStringPtr(i64 %search.value)
  %search.len = call i64 @valueStringLength(i64 %search.value)
  %answer = call i1 @stringIncludes(i64 %length, ptr %bytes, i64 %search.len, ptr %search.ptr)
  %value = select i1 %answer, i64 9222246136947933186, i64 9222246136947933185
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringIndexOfMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringIndexOfMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %search.completion = call { i64, i1 } @stringMethodText(i64 %argc, ptr %argv, i64 0)
  %search.threw = extractvalue { i64, i1 } %search.completion, 1
  br i1 %search.threw, label %search.failed, label %search.ready
search.failed:
  ret { i64, i1 } %search.completion
search.ready:
  %search.value = extractvalue { i64, i1 } %search.completion, 0
  %search.ptr = call ptr @valueStringPtr(i64 %search.value)
  %search.len = call i64 @valueStringLength(i64 %search.value)
  %position = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 1, i64 0)
  %number = call double @stringIndexOf(i64 %length, ptr %bytes, i64 %search.len, ptr %search.ptr, i64 %position)
  %value = call i64 @valueBoxNumber(double %number)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringLastIndexOfMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringLastIndexOfMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %search.completion = call { i64, i1 } @stringMethodText(i64 %argc, ptr %argv, i64 0)
  %search.threw = extractvalue { i64, i1 } %search.completion, 1
  br i1 %search.threw, label %search.failed, label %search.ready
search.failed:
  ret { i64, i1 } %search.completion
search.ready:
  %search.value = extractvalue { i64, i1 } %search.completion, 0
  %search.ptr = call ptr @valueStringPtr(i64 %search.value)
  %search.len = call i64 @valueStringLength(i64 %search.value)
  %number = call double @stringLastIndexOf(i64 %length, ptr %bytes, i64 %search.len, ptr %search.ptr)
  %value = call i64 @valueBoxNumber(double %number)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringLocaleCompareMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringLocaleCompareMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %other.completion = call { i64, i1 } @stringMethodText(i64 %argc, ptr %argv, i64 0)
  %other.threw = extractvalue { i64, i1 } %other.completion, 1
  br i1 %other.threw, label %other.failed, label %other.ready
other.failed:
  ret { i64, i1 } %other.completion
other.ready:
  %other.value = extractvalue { i64, i1 } %other.completion, 0
  %other.ptr = call ptr @valueStringPtr(i64 %other.value)
  %other.len = call i64 @valueStringLength(i64 %other.value)
  %number = call double @stringLocaleCompare(i64 %length, ptr %bytes, i64 %other.len, ptr %other.ptr)
  %value = call i64 @valueBoxNumber(double %number)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringMatchMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringMatchMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %pattern = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %is.regex = call i1 @valueIsRegex(i64 %pattern)
  br i1 %is.regex, label %match, label %compile
compile:
  %source.completion = call { i64, i1 } @stringMethodText(i64 %argc, ptr %argv, i64 0)
  %source.threw = extractvalue { i64, i1 } %source.completion, 1
  br i1 %source.threw, label %source.failed, label %source.ready
source.failed:
  ret { i64, i1 } %source.completion
source.ready:
  %source = extractvalue { i64, i1 } %source.completion, 0
  %no.flags = call i64 @valueBoxString(ptr @.string.method.empty, i64 0)
  %compiled.completion = call { i64, i1 } @regexCompile(i64 %source, i64 %no.flags)
  %compiled.threw = extractvalue { i64, i1 } %compiled.completion, 1
  br i1 %compiled.threw, label %compiled.failed, label %compiled.ready
compiled.failed:
  ret { i64, i1 } %compiled.completion
compiled.ready:
  %compiled = extractvalue { i64, i1 } %compiled.completion, 0
  br label %match
match:
  %regex = phi i64 [ %pattern, %is.string.receiver ], [ %compiled, %compiled.ready ]
  %result = call { i64, i1 } @regexMatch(i64 %regex, i64 %this.value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringNormalizeMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringNormalizeMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %text = call { ptr, i64 } @stringNormalize(i64 %length, ptr %bytes)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringPadEndMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringPadEndMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %target = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 0)
  %pad.argument = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %pad.default = icmp eq i64 %pad.argument, 9222246136947933184
  br i1 %pad.default, label %default, label %convert
convert:
  %pad.completion = call { i64, i1 } @stringMethodText(i64 %argc, ptr %argv, i64 1)
  %pad.threw = extractvalue { i64, i1 } %pad.completion, 1
  br i1 %pad.threw, label %pad.failed, label %pad.ready
pad.failed:
  ret { i64, i1 } %pad.completion
pad.ready:
  %pad.value = extractvalue { i64, i1 } %pad.completion, 0
  %pad.ptr = call ptr @valueStringPtr(i64 %pad.value)
  %pad.len = call i64 @valueStringLength(i64 %pad.value)
  br label %join
default:
  br label %join
join:
  %fill.ptr = phi ptr [ @.string.method.space, %default ], [ %pad.ptr, %pad.ready ]
  %fill.len = phi i64 [ 1, %default ], [ %pad.len, %pad.ready ]
  %text = call { ptr, i64 } @stringPadEnd(i64 %length, ptr %bytes, i64 %target, i64 %fill.len, ptr %fill.ptr)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringPadStartMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringPadStartMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %target = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 0)
  %pad.argument = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %pad.default = icmp eq i64 %pad.argument, 9222246136947933184
  br i1 %pad.default, label %default, label %convert
convert:
  %pad.completion = call { i64, i1 } @stringMethodText(i64 %argc, ptr %argv, i64 1)
  %pad.threw = extractvalue { i64, i1 } %pad.completion, 1
  br i1 %pad.threw, label %pad.failed, label %pad.ready
pad.failed:
  ret { i64, i1 } %pad.completion
pad.ready:
  %pad.value = extractvalue { i64, i1 } %pad.completion, 0
  %pad.ptr = call ptr @valueStringPtr(i64 %pad.value)
  %pad.len = call i64 @valueStringLength(i64 %pad.value)
  br label %join
default:
  br label %join
join:
  %fill.ptr = phi ptr [ @.string.method.space, %default ], [ %pad.ptr, %pad.ready ]
  %fill.len = phi i64 [ 1, %default ], [ %pad.len, %pad.ready ]
  %text = call { ptr, i64 } @stringPadStart(i64 %length, ptr %bytes, i64 %target, i64 %fill.len, ptr %fill.ptr)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringRepeatMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringRepeatMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %count = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 0)
  %text = call { ptr, i64 } @stringRepeat(i64 %length, ptr %bytes, i64 %count)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringReplaceMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringReplaceMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %pattern = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %replacer = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %is.callback = call i1 @valueIsFunction(i64 %replacer)
  br i1 %is.callback, label %callback, label %replacement.text
callback:
  %callback.message = call i64 @valueBoxString(ptr @.string.method.callback, i64 47)
  %callback.error = call { i64, i1 } @iteratorTypeError(i64 %callback.message)
  ret { i64, i1 } %callback.error
replacement.text:
  %replacement.completion = call { i64, i1 } @stringMethodText(i64 %argc, ptr %argv, i64 1)
  %replacement.threw = extractvalue { i64, i1 } %replacement.completion, 1
  br i1 %replacement.threw, label %replacement.failed, label %replacement.ready
replacement.failed:
  ret { i64, i1 } %replacement.completion
replacement.ready:
  %replacement.value = extractvalue { i64, i1 } %replacement.completion, 0
  %replacement.ptr = call ptr @valueStringPtr(i64 %replacement.value)
  %replacement.len = call i64 @valueStringLength(i64 %replacement.value)
  %is.regex = call i1 @valueIsRegex(i64 %pattern)
  br i1 %is.regex, label %regex, label %text.pattern
regex:
  %regex.result = call { i64, i1 } @regexReplace(i64 %pattern, i64 %this.value, i64 %replacement.value)
  ret { i64, i1 } %regex.result
text.pattern:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %replacement.value)
  %search.completion = call { i64, i1 } @stringMethodText(i64 %argc, ptr %argv, i64 0)
  call void @gcRootRestore(i64 %frame)
  %search.threw = extractvalue { i64, i1 } %search.completion, 1
  br i1 %search.threw, label %search.failed, label %search.ready
search.failed:
  ret { i64, i1 } %search.completion
search.ready:
  %search.value = extractvalue { i64, i1 } %search.completion, 0
  %search.ptr = call ptr @valueStringPtr(i64 %search.value)
  %search.len = call i64 @valueStringLength(i64 %search.value)
  %text = call { ptr, i64 } @stringReplace(i64 %length, ptr %bytes, i64 %search.len, ptr %search.ptr, i64 %replacement.len, ptr %replacement.ptr)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringReplaceAllMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringReplaceAllMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %pattern = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %replacer = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %is.callback = call i1 @valueIsFunction(i64 %replacer)
  br i1 %is.callback, label %callback, label %replacement.text
callback:
  %callback.message = call i64 @valueBoxString(ptr @.string.method.callback, i64 47)
  %callback.error = call { i64, i1 } @iteratorTypeError(i64 %callback.message)
  ret { i64, i1 } %callback.error
replacement.text:
  %replacement.completion = call { i64, i1 } @stringMethodText(i64 %argc, ptr %argv, i64 1)
  %replacement.threw = extractvalue { i64, i1 } %replacement.completion, 1
  br i1 %replacement.threw, label %replacement.failed, label %replacement.ready
replacement.failed:
  ret { i64, i1 } %replacement.completion
replacement.ready:
  %replacement.value = extractvalue { i64, i1 } %replacement.completion, 0
  %replacement.ptr = call ptr @valueStringPtr(i64 %replacement.value)
  %replacement.len = call i64 @valueStringLength(i64 %replacement.value)
  %is.regex = call i1 @valueIsRegex(i64 %pattern)
  br i1 %is.regex, label %regex, label %text.pattern
regex:
  %regex.result = call { i64, i1 } @regexReplace(i64 %pattern, i64 %this.value, i64 %replacement.value)
  ret { i64, i1 } %regex.result
text.pattern:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %replacement.value)
  %search.completion = call { i64, i1 } @stringMethodText(i64 %argc, ptr %argv, i64 0)
  call void @gcRootRestore(i64 %frame)
  %search.threw = extractvalue { i64, i1 } %search.completion, 1
  br i1 %search.threw, label %search.failed, label %search.ready
search.failed:
  ret { i64, i1 } %search.completion
search.ready:
  %search.value = extractvalue { i64, i1 } %search.completion, 0
  %search.ptr = call ptr @valueStringPtr(i64 %search.value)
  %search.len = call i64 @valueStringLength(i64 %search.value)
  %text = call { ptr, i64 } @stringReplaceAll(i64 %length, ptr %bytes, i64 %search.len, ptr %search.ptr, i64 %replacement.len, ptr %replacement.ptr)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringSearchMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringSearchMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %pattern = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %is.regex = call i1 @valueIsRegex(i64 %pattern)
  br i1 %is.regex, label %match, label %compile
compile:
  %source.completion = call { i64, i1 } @stringMethodText(i64 %argc, ptr %argv, i64 0)
  %source.threw = extractvalue { i64, i1 } %source.completion, 1
  br i1 %source.threw, label %source.failed, label %source.ready
source.failed:
  ret { i64, i1 } %source.completion
source.ready:
  %source = extractvalue { i64, i1 } %source.completion, 0
  %no.flags = call i64 @valueBoxString(ptr @.string.method.empty, i64 0)
  %compiled.completion = call { i64, i1 } @regexCompile(i64 %source, i64 %no.flags)
  %compiled.threw = extractvalue { i64, i1 } %compiled.completion, 1
  br i1 %compiled.threw, label %compiled.failed, label %compiled.ready
compiled.failed:
  ret { i64, i1 } %compiled.completion
compiled.ready:
  %compiled = extractvalue { i64, i1 } %compiled.completion, 0
  br label %match
match:
  %regex = phi i64 [ %pattern, %is.string.receiver ], [ %compiled, %compiled.ready ]
  %result = call { i64, i1 } @regexSearch(i64 %regex, i64 %this.value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringSliceMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringSliceMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %start = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 0)
  %end = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 1, i64 %length)
  %text = call { ptr, i64 } @stringSlice(i64 %length, ptr %bytes, i64 %start, i64 %end)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringSplitMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringSplitMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %limit = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 1, i64 -1)
  %separator.argument = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %separator.missing = icmp eq i64 %separator.argument, 9222246136947933184
  br i1 %separator.missing, label %whole, label %check.regex
whole:
  %single = call ptr @arrayNew(i64 0)
  %single.length = call i64 @arrayPush(ptr %single, i64 %this.value)
  br label %answer
check.regex:
  %is.regex = call i1 @valueIsRegex(i64 %separator.argument)
  br i1 %is.regex, label %regex, label %text
regex:
  %regex.array = call ptr @regexSplit(i64 %separator.argument, i64 %this.value, i64 %limit)
  br label %answer
text:
  %separator.completion = call { i64, i1 } @stringMethodText(i64 %argc, ptr %argv, i64 0)
  %separator.threw = extractvalue { i64, i1 } %separator.completion, 1
  br i1 %separator.threw, label %separator.failed, label %separator.ready
separator.failed:
  ret { i64, i1 } %separator.completion
separator.ready:
  %separator.value = extractvalue { i64, i1 } %separator.completion, 0
  %separator.ptr = call ptr @valueStringPtr(i64 %separator.value)
  %separator.len = call i64 @valueStringLength(i64 %separator.value)
  %text.array = call ptr @stringSplit(i64 %length, ptr %bytes, i64 %separator.len, ptr %separator.ptr, i64 %limit)
  br label %answer
answer:
  %array = phi ptr [ %single, %whole ], [ %regex.array, %regex ], [ %text.array, %separator.ready ]
  %value = call i64 @valueBoxArray(ptr %array)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringStartsWithMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringStartsWithMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %search.completion = call { i64, i1 } @stringMethodText(i64 %argc, ptr %argv, i64 0)
  %search.threw = extractvalue { i64, i1 } %search.completion, 1
  br i1 %search.threw, label %search.failed, label %search.ready
search.failed:
  ret { i64, i1 } %search.completion
search.ready:
  %search.value = extractvalue { i64, i1 } %search.completion, 0
  %search.ptr = call ptr @valueStringPtr(i64 %search.value)
  %search.len = call i64 @valueStringLength(i64 %search.value)
  %position = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 1, i64 0)
  %answer = call i1 @stringStartsWithAt(i64 %length, ptr %bytes, i64 %search.len, ptr %search.ptr, i64 %position)
  %value = select i1 %answer, i64 9222246136947933186, i64 9222246136947933185
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringSubstrMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringSubstrMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %start = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 0)
  %end = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 1, i64 %length)
  %text = call { ptr, i64 } @stringSubstr(i64 %length, ptr %bytes, i64 %start, i64 %end)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringSubstringMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringSubstringMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %start = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 0, i64 0)
  %end = call i64 @arrayMethodPosition(i64 %argc, ptr %argv, i64 1, i64 %length)
  %text = call { ptr, i64 } @stringSubstring(i64 %length, ptr %bytes, i64 %start, i64 %end)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringToLowerCaseMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringToLowerCaseMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %text = call { ptr, i64 } @stringToLowerCase(i64 %length, ptr %bytes)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringToStringMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringToStringMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %result = call { i64, i1 } @arrayMethodResult(i64 %this.value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringToUpperCaseMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringToUpperCaseMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %text = call { ptr, i64 } @stringToUpperCase(i64 %length, ptr %bytes)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringTrimMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringTrimMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %text = call { ptr, i64 } @stringTrim(i64 %length, ptr %bytes)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringTrimEndMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringTrimEndMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %text = call { ptr, i64 } @stringTrimEnd(i64 %length, ptr %bytes)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringTrimStartMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringTrimStartMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %bytes = call ptr @valueStringPtr(i64 %this.value)
  %length = call i64 @valueStringLength(i64 %this.value)
  %text = call { ptr, i64 } @stringTrimStart(i64 %length, ptr %bytes)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %value = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  %result = call { i64, i1 } @arrayMethodResult(i64 %value)
  ret { i64, i1 } %result
}

define { i64, i1 } @stringValueOfMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %is.string.receiver, label %not.string
not.string:
  %receiver.completion = call { i64, i1 } @stringMethodReceiver(i64 %this.value)
  %receiver.threw = extractvalue { i64, i1 } %receiver.completion, 1
  br i1 %receiver.threw, label %receiver.failed, label %receiver.ready
receiver.failed:
  ret { i64, i1 } %receiver.completion
receiver.ready:
  %receiver = extractvalue { i64, i1 } %receiver.completion, 0
  %receiver.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %receiver)
  %receiver.result = call { i64, i1 } @stringValueOfMethod(i64 %argc, ptr %argv, ptr %env, i64 %receiver)
  call void @gcRootRestore(i64 %receiver.frame)
  ret { i64, i1 } %receiver.result
is.string.receiver:
  %result = call { i64, i1 } @arrayMethodResult(i64 %this.value)
  ret { i64, i1 } %result
}

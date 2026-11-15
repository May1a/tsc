@.test.at = private constant [3 x i8] c"at\00"
@.test.concat = private constant [7 x i8] c"concat\00"
@.test.copyWithin = private constant [11 x i8] c"copyWithin\00"
@.test.entries = private constant [8 x i8] c"entries\00"
@.test.fill = private constant [5 x i8] c"fill\00"
@.test.filter = private constant [7 x i8] c"filter\00"
@.test.find = private constant [5 x i8] c"find\00"
@.test.findIndex = private constant [10 x i8] c"findIndex\00"
@.test.flat = private constant [5 x i8] c"flat\00"
@.test.flatMap = private constant [8 x i8] c"flatMap\00"
@.test.forEach = private constant [8 x i8] c"forEach\00"
@.test.includes = private constant [9 x i8] c"includes\00"
@.test.indexOf = private constant [8 x i8] c"indexOf\00"
@.test.join = private constant [5 x i8] c"join\00"
@.test.keys = private constant [5 x i8] c"keys\00"
@.test.lastIndexOf = private constant [12 x i8] c"lastIndexOf\00"
@.test.map = private constant [4 x i8] c"map\00"
@.test.pop = private constant [4 x i8] c"pop\00"
@.test.push = private constant [5 x i8] c"push\00"
@.test.reduce = private constant [7 x i8] c"reduce\00"
@.test.reduceRight = private constant [12 x i8] c"reduceRight\00"
@.test.reverse = private constant [8 x i8] c"reverse\00"
@.test.shift = private constant [6 x i8] c"shift\00"
@.test.slice = private constant [6 x i8] c"slice\00"
@.test.sort = private constant [5 x i8] c"sort\00"
@.test.splice = private constant [7 x i8] c"splice\00"
@.test.toString = private constant [9 x i8] c"toString\00"
@.test.unshift = private constant [8 x i8] c"unshift\00"
@.test.values = private constant [7 x i8] c"values\00"
@.test.length = private constant [7 x i8] c"length\00"
@.test.name = private constant [5 x i8] c"name\00"
@.test.iterator = private constant [19 x i8] c"\EF\A3\BFSymbol.iterator\00"
@.test.missing = private constant [8 x i8] c"missing\00"
@testMethods = private constant [29 x { i64, ptr }] [
  { i64, ptr } { i64 2, ptr @.test.at },
  { i64, ptr } { i64 6, ptr @.test.concat },
  { i64, ptr } { i64 10, ptr @.test.copyWithin },
  { i64, ptr } { i64 7, ptr @.test.entries },
  { i64, ptr } { i64 4, ptr @.test.fill },
  { i64, ptr } { i64 6, ptr @.test.filter },
  { i64, ptr } { i64 4, ptr @.test.find },
  { i64, ptr } { i64 9, ptr @.test.findIndex },
  { i64, ptr } { i64 4, ptr @.test.flat },
  { i64, ptr } { i64 7, ptr @.test.flatMap },
  { i64, ptr } { i64 7, ptr @.test.forEach },
  { i64, ptr } { i64 8, ptr @.test.includes },
  { i64, ptr } { i64 7, ptr @.test.indexOf },
  { i64, ptr } { i64 4, ptr @.test.join },
  { i64, ptr } { i64 4, ptr @.test.keys },
  { i64, ptr } { i64 11, ptr @.test.lastIndexOf },
  { i64, ptr } { i64 3, ptr @.test.map },
  { i64, ptr } { i64 3, ptr @.test.pop },
  { i64, ptr } { i64 4, ptr @.test.push },
  { i64, ptr } { i64 6, ptr @.test.reduce },
  { i64, ptr } { i64 11, ptr @.test.reduceRight },
  { i64, ptr } { i64 7, ptr @.test.reverse },
  { i64, ptr } { i64 5, ptr @.test.shift },
  { i64, ptr } { i64 5, ptr @.test.slice },
  { i64, ptr } { i64 4, ptr @.test.sort },
  { i64, ptr } { i64 6, ptr @.test.splice },
  { i64, ptr } { i64 8, ptr @.test.toString },
  { i64, ptr } { i64 7, ptr @.test.unshift },
  { i64, ptr } { i64 6, ptr @.test.values }
]

define i32 @main() {
entry:
  call void @gcInit()
  ; The symbol alias may be the first read of the shared values function.
  %alias.first = call i64 @arrayPrototypeMethod(i64 18, ptr @.test.iterator)
  call void @gcCollect()
  %alias.name = call i64 @valuePropertyGet(i64 %alias.first, i64 4, ptr @.test.name)
  call void @valuePrint(i64 %alias.name)
  %alias.arity = call i64 @valuePropertyGet(i64 %alias.first, i64 6, ptr @.test.length)
  call void @valuePrint(i64 %alias.arity)
  %a = call ptr @arrayNew(i64 0)
  %a.value = call i64 @valueBoxArray(ptr %a)
  call void @gcRootPush(i64 %a.value)
  %b = call ptr @arrayNew(i64 0)
  %b.value = call i64 @valueBoxArray(ptr %b)
  call void @gcRootPush(i64 %b.value)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %body ]
  %done = icmp eq i64 %i, 29
  br i1 %done, label %finish, label %body
body:
  %key.len.slot = getelementptr [29 x { i64, ptr }], ptr @testMethods, i64 0, i64 %i, i32 0
  %key.ptr.slot = getelementptr [29 x { i64, ptr }], ptr @testMethods, i64 0, i64 %i, i32 1
  %key.len = load i64, ptr %key.len.slot
  %key.ptr = load ptr, ptr %key.ptr.slot
  %first = call i64 @valuePropertyGet(i64 %a.value, i64 %key.len, ptr %key.ptr)
  %second = call i64 @valuePropertyGet(i64 %a.value, i64 %key.len, ptr %key.ptr)
  %same = call i1 @valueStrictEquals(i64 %first, i64 %second)
  call void @testPrintBool(i1 %same)
  %other = call i64 @valuePropertyGet(i64 %b.value, i64 %key.len, ptr %key.ptr)
  %shared = call i1 @valueStrictEquals(i64 %first, i64 %other)
  call void @testPrintBool(i1 %shared)
  ; No caller roots protect these functions. The cache must retain them and their names.
  call void @gcCollect()
  %after = call i64 @valuePropertyGet(i64 %b.value, i64 %key.len, ptr %key.ptr)
  %retained = call i1 @valueStrictEquals(i64 %first, i64 %after)
  call void @testPrintBool(i1 %retained)
  %name = call i64 @valuePropertyGet(i64 %after, i64 4, ptr @.test.name)
  call void @valuePrint(i64 %name)
  %arity = call i64 @valuePropertyGet(i64 %after, i64 6, ptr @.test.length)
  call void @valuePrint(i64 %arity)
  %next = add i64 %i, 1
  br label %loop
finish:
  %values = call i64 @valuePropertyGet(i64 %a.value, i64 6, ptr @.test.values)
  %iterator = call i64 @valuePropertyGet(i64 %b.value, i64 18, ptr @.test.iterator)
  %alias = call i1 @valueStrictEquals(i64 %values, i64 %iterator)
  call void @testPrintBool(i1 %alias)
  %missing = call i64 @valuePropertyGet(i64 %a.value, i64 7, ptr @.test.missing)
  call void @valuePrint(i64 %missing)
  ; An own property still shadows the shared builtin.
  %own = call i64 @valueBoxNumber(double 42.0)
  call void @arraySetNamed(ptr %a, i64 3, ptr @.test.map, i64 %own)
  %shadowed = call i64 @valuePropertyGet(i64 %a.value, i64 3, ptr @.test.map)
  call void @valuePrint(i64 %shadowed)
  %unshadowed = call i64 @valuePropertyGet(i64 %b.value, i64 3, ptr @.test.map)
  %unshadowed.name = call i64 @valuePropertyGet(i64 %unshadowed, i64 4, ptr @.test.name)
  call void @valuePrint(i64 %unshadowed.name)
  ; A shared method remains callable after collection and uses the supplied receiver.
  %push = call i64 @valuePropertyGet(i64 %a.value, i64 4, ptr @.test.push)
  %argument = alloca i64
  store i64 %own, ptr %argument
  %pushed = call { i64, i1 } @jsCall(i64 %push, i64 1, ptr %argument, i64 %b.value)
  %push.threw = extractvalue { i64, i1 } %pushed, 1
  call void @testPrintBool(i1 %push.threw)
  %push.result = extractvalue { i64, i1 } %pushed, 0
  call void @valuePrint(i64 %push.result)
  %a.length = call i64 @valuePropertyGet(i64 %a.value, i64 6, ptr @.test.length)
  call void @valuePrint(i64 %a.length)
  %pop = call i64 @valuePropertyGet(i64 %b.value, i64 3, ptr @.test.pop)
  %popped = call { i64, i1 } @jsCall(i64 %pop, i64 0, ptr null, i64 %b.value)
  %pop.threw = extractvalue { i64, i1 } %popped, 1
  call void @testPrintBool(i1 %pop.threw)
  %pop.result = extractvalue { i64, i1 } %popped, 0
  call void @valuePrint(i64 %pop.result)
  %collections = call i64 @gcStatsCollections()
  %collected = icmp uge i64 %collections, 29
  call void @testPrintBool(i1 %collected)
  ret i32 0
}

define void @testPrintBool(i1 %value) {
entry:
  %boxed = select i1 %value, i64 9222246136947933186, i64 9222246136947933185
  call void @valuePrint(i64 %boxed)
  ret void
}

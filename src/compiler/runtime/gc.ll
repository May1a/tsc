; GC arena + bookkeeping (Phase B: strings only).
@gcArenaBase = internal global ptr null
@gcArenaEnd = internal global ptr null
@gcBumpPtr = internal global ptr null
@gcBytesAllocd = internal global i64 0
@gcNextCollectAt = internal global i64 1048576
@gcCollectPending = internal global i64 0
@gcCollections = internal global i64 0
@gcLiveBytes = internal global i64 0
@gcFreeString = internal global ptr null
@gcFreeObject = internal global ptr null
@gcFreeArray = internal global ptr null
@gcFreeCollection = internal global ptr null
@gcFreeFunction = internal global ptr null
@gcFreeEnvironment = internal global ptr null
@gcFreeIterator = internal global ptr null
@gcMarkStack = internal global ptr null
@gcMarkStackCount = internal global i64 0
@gcMarkStackCap = internal global i64 0
@gcRootStack = internal global ptr null
@gcRootStackCount = internal global i64 0
@gcRootStackCap = internal global i64 0
@gcTrace = internal global i64 0

@.gc.env.name = private unnamed_addr constant [18 x i8] c"TSCN_GC_HEAP_SIZE\00"
@.gc.trace.env = private unnamed_addr constant [14 x i8] c"TSCN_GC_TRACE\00"
@.gc.trace.fmt = private unnamed_addr constant [25 x i8] c"gc: coll=%lld live=%lld\0A\00"
define void @gcInit() {
entry:
  %env.ptr = call ptr @getenv(ptr @.gc.env.name)
  %env.set = icmp ne ptr %env.ptr, null
  br i1 %env.set, label %parse.env, label %use.default
parse.env:
  %parsed = call i64 @strtol(ptr %env.ptr, ptr null, i32 10)
  br label %init
use.default:
  br label %init
init:
  %heap.size = phi i64 [ %parsed, %parse.env ], [ 4194304, %use.default ]
  %arena = call ptr @malloc(i64 %heap.size)
  store ptr %arena, ptr @gcArenaBase
  %arena.end = getelementptr i8, ptr %arena, i64 %heap.size
  store ptr %arena.end, ptr @gcArenaEnd
  store ptr %arena, ptr @gcBumpPtr
  store i64 0, ptr @gcBytesAllocd
  store i64 1048576, ptr @gcNextCollectAt
  store i64 0, ptr @gcCollectPending
  store i64 0, ptr @gcCollections
  store i64 0, ptr @gcLiveBytes
  store ptr null, ptr @gcFreeString
  store ptr null, ptr @gcFreeObject
  store ptr null, ptr @gcFreeArray
  store ptr null, ptr @gcFreeCollection
  store ptr null, ptr @gcFreeFunction
  store ptr null, ptr @gcFreeEnvironment
  store ptr null, ptr @gcFreeIterator
  %root.cap.bytes = mul i64 64, 8
  %root.stack = call ptr @malloc(i64 %root.cap.bytes)
  store ptr %root.stack, ptr @gcRootStack
  store i64 0, ptr @gcRootStackCount
  store i64 64, ptr @gcRootStackCap
  %mark.cap.bytes = mul i64 64, 8
  %mark.stack = call ptr @malloc(i64 %mark.cap.bytes)
  store ptr %mark.stack, ptr @gcMarkStack
  store i64 0, ptr @gcMarkStackCount
  store i64 64, ptr @gcMarkStackCap
  %trace.env = call ptr @getenv(ptr @.gc.trace.env)
  %trace.set = icmp ne ptr %trace.env, null
  %trace.flag = zext i1 %trace.set to i64
  store i64 %trace.flag, ptr @gcTrace
  ret void
}

define void @gcRootPush(i64 %value) {
entry:
  %count = load i64, ptr @gcRootStackCount
  %cap = load i64, ptr @gcRootStackCap
  %need.grow = icmp eq i64 %count, %cap
  br i1 %need.grow, label %grow, label %store
grow:
  %new.cap = mul i64 %cap, 2
  %old.bytes = mul i64 %cap, 8
  %new.bytes = mul i64 %new.cap, 8
  %old.stack = load ptr, ptr @gcRootStack
  %new.stack = call ptr @malloc(i64 %new.bytes)
  call ptr @memcpy(ptr %new.stack, ptr %old.stack, i64 %old.bytes)
  store ptr %new.stack, ptr @gcRootStack
  store i64 %new.cap, ptr @gcRootStackCap
  br label %store
store:
  %stack = load ptr, ptr @gcRootStack
  %slot.bytes = mul i64 %count, 8
  %slot = getelementptr i8, ptr %stack, i64 %slot.bytes
  store i64 %value, ptr %slot
  %next = add i64 %count, 1
  store i64 %next, ptr @gcRootStackCount
  ret void
}

define void @gcRootPop() {
entry:
  %count = load i64, ptr @gcRootStackCount
  %is.empty = icmp eq i64 %count, 0
  br i1 %is.empty, label %underflow, label %ok
underflow:
  call void @exit(i32 1)
  ret void
ok:
  %next = sub i64 %count, 1
  store i64 %next, ptr @gcRootStackCount
  ret void
}

define i64 @gcRootSave() {
entry:
  %count = load i64, ptr @gcRootStackCount
  ret i64 %count
}

define void @gcRootRestore(i64 %depth) {
entry:
  store i64 %depth, ptr @gcRootStackCount
  ret void
}

define void @gcSafepoint() {
entry:
  %pending = load i64, ptr @gcCollectPending
  %do = icmp ne i64 %pending, 0
  br i1 %do, label %collect, label %skip
collect:
  store i64 0, ptr @gcCollectPending
  call void @gcCollect()
  br label %skip
skip:
  ret void
}

define void @gcMarkValue(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.string = icmp eq i64 %tag, 9221683186994511872
  %is.object = icmp eq i64 %tag, 9221120237041090560
  %is.array = icmp eq i64 %tag, 9221401712017801216
  %is.function = icmp eq i64 %tag, 9221964661971222528
  br i1 %is.string, label %mark.string, label %check.heap
check.heap:
  %is.object.or.array = or i1 %is.object, %is.array
  %is.heap = or i1 %is.object.or.array, %is.function
  br i1 %is.heap, label %mark.heap, label %skip
mark.string:
  %str.bits = and i64 %value, 281474976710655
  %str.cell = inttoptr i64 %str.bits to ptr
  %str.color.ptr = getelementptr i8, ptr %str.cell, i64 1
  %str.color = load i8, ptr %str.color.ptr
  %str.is.black = icmp eq i8 %str.color, 2
  br i1 %str.is.black, label %skip, label %mark.string.set
mark.string.set:
  store i8 2, ptr %str.color.ptr
  br label %skip
mark.heap:
  %bits = and i64 %value, 281474976710655
  %payload = inttoptr i64 %bits to ptr
  %cell = getelementptr i8, ptr %payload, i64 -8
  %color.ptr = getelementptr i8, ptr %cell, i64 1
  %color = load i8, ptr %color.ptr
  %is.black = icmp eq i8 %color, 2
  %is.gray = icmp eq i8 %color, 1
  %is.marked = or i1 %is.black, %is.gray
  br i1 %is.marked, label %skip, label %push.mark
push.mark:
  %count = load i64, ptr @gcMarkStackCount
  %cap = load i64, ptr @gcMarkStackCap
  %need.grow = icmp eq i64 %count, %cap
  br i1 %need.grow, label %push.grow, label %push.store
push.grow:
  %new.cap = mul i64 %cap, 2
  %old.bytes = mul i64 %cap, 8
  %new.bytes = mul i64 %new.cap, 8
  %old.stack = load ptr, ptr @gcMarkStack
  %new.stack = call ptr @malloc(i64 %new.bytes)
  call ptr @memcpy(ptr %new.stack, ptr %old.stack, i64 %old.bytes)
  store ptr %new.stack, ptr @gcMarkStack
  store i64 %new.cap, ptr @gcMarkStackCap
  br label %push.store
push.store:
  %stack = load ptr, ptr @gcMarkStack
  %slot.bytes = mul i64 %count, 8
  %slot = getelementptr i8, ptr %stack, i64 %slot.bytes
  store ptr %cell, ptr %slot
  %next.count = add i64 %count, 1
  store i64 %next.count, ptr @gcMarkStackCount
  store i8 1, ptr %color.ptr
  br label %skip
skip:
  ret void
}

; Mark a child reached through a raw GC payload pointer (object/array prototypes and
; array property bags are stored as cell+8 payload pointers, not boxed JSValues).
; Null-safe; greys the cell and pushes it for the iterative drain just like the heap
; path of gcMarkValue.
define void @gcMarkPayloadPtr(ptr %payload) {
entry:
  %is.null = icmp eq ptr %payload, null
  br i1 %is.null, label %done, label %mark
mark:
  %cell = getelementptr i8, ptr %payload, i64 -8
  %color.ptr = getelementptr i8, ptr %cell, i64 1
  %color = load i8, ptr %color.ptr
  %is.black = icmp eq i8 %color, 2
  %is.gray = icmp eq i8 %color, 1
  %is.marked = or i1 %is.black, %is.gray
  br i1 %is.marked, label %done, label %push
push:
  %count = load i64, ptr @gcMarkStackCount
  %cap = load i64, ptr @gcMarkStackCap
  %need.grow = icmp eq i64 %count, %cap
  br i1 %need.grow, label %grow, label %store
grow:
  %new.cap = mul i64 %cap, 2
  %old.bytes = mul i64 %cap, 8
  %new.bytes = mul i64 %new.cap, 8
  %old.stack = load ptr, ptr @gcMarkStack
  %new.stack = call ptr @malloc(i64 %new.bytes)
  call ptr @memcpy(ptr %new.stack, ptr %old.stack, i64 %old.bytes)
  store ptr %new.stack, ptr @gcMarkStack
  store i64 %new.cap, ptr @gcMarkStackCap
  br label %store
store:
  %stack = load ptr, ptr @gcMarkStack
  %slot.bytes = mul i64 %count, 8
  %slot = getelementptr i8, ptr %stack, i64 %slot.bytes
  store ptr %cell, ptr %slot
  %next.count = add i64 %count, 1
  store i64 %next.count, ptr @gcMarkStackCount
  store i8 1, ptr %color.ptr
  br label %done
done:
  ret void
}

define void @gcMarkObject(ptr %cell) {
entry:
  %color.ptr = getelementptr i8, ptr %cell, i64 1
  %prev.color = load i8, ptr %color.ptr
  store i8 2, ptr %color.ptr
  %was.gray = icmp eq i8 %prev.color, 1
  br i1 %was.gray, label %walk, label %skip
walk:
  %tag.ptr = getelementptr i8, ptr %cell, i64 0
  %tag = load i8, ptr %tag.ptr
  %is.string = icmp eq i8 %tag, 1
  %is.object = icmp eq i8 %tag, 2
  %is.array = icmp eq i8 %tag, 3
  %is.collection = icmp eq i8 %tag, 4
  %is.function = icmp eq i8 %tag, 5
  %is.environment = icmp eq i8 %tag, 6
  %is.iterator = icmp eq i8 %tag, 7
  br i1 %is.string, label %skip, label %check.object
check.object:
  br i1 %is.object, label %walk.object, label %check.array
check.array:
  br i1 %is.array, label %walk.array, label %check.collection
check.collection:
  br i1 %is.collection, label %walk.collection, label %check.function
check.function:
  br i1 %is.function, label %walk.function, label %check.environment
check.environment:
  br i1 %is.environment, label %walk.environment, label %check.iterator
check.iterator:
  br i1 %is.iterator, label %walk.iterator, label %skip
walk.object:
  %obj.count.ptr = getelementptr i8, ptr %cell, i64 8
  %obj.count = load i64, ptr %obj.count.ptr
  %obj.entries.ptr = getelementptr i8, ptr %cell, i64 24
  %obj.entries = load ptr, ptr %obj.entries.ptr
  br label %walk.object.loop
walk.object.loop:
  %oi = phi i64 [ 0, %walk.object ], [ %oi.next, %walk.object.next ]
  %odone = icmp eq i64 %oi, %obj.count
  br i1 %odone, label %walk.object.proto, label %walk.object.body
walk.object.body:
  %oentry.bytes = mul i64 %oi, 32
  %oentry.ptr = getelementptr i8, ptr %obj.entries, i64 %oentry.bytes
  %olen = load i64, ptr %oentry.ptr
  %olive = icmp sge i64 %olen, 0
  br i1 %olive, label %walk.object.mark, label %walk.object.next
walk.object.mark:
  %ovalue.slot = getelementptr i8, ptr %oentry.ptr, i64 16
  %ovalue = load i64, ptr %ovalue.slot
  call void @gcMarkValue(i64 %ovalue)
  br label %walk.object.next
walk.object.next:
  %oi.next = add i64 %oi, 1
  br label %walk.object.loop
walk.object.proto:
  %obj.proto.ptr = getelementptr i8, ptr %cell, i64 40
  %obj.proto = load ptr, ptr %obj.proto.ptr
  call void @gcMarkPayloadPtr(ptr %obj.proto)
  br label %skip
walk.array:
  %arr.length.ptr = getelementptr i8, ptr %cell, i64 8
  %arr.length = load i64, ptr %arr.length.ptr
  %arr.elements.ptr = getelementptr i8, ptr %cell, i64 24
  %arr.elements = load ptr, ptr %arr.elements.ptr
  br label %walk.array.loop
walk.array.loop:
  %ai = phi i64 [ 0, %walk.array ], [ %ai.next, %walk.array.body ]
  %adone = icmp eq i64 %ai, %arr.length
  br i1 %adone, label %walk.array.proto, label %walk.array.body
walk.array.body:
  %aslot.bytes = mul i64 %ai, 8
  %aslot = getelementptr i8, ptr %arr.elements, i64 %aslot.bytes
  %avalue = load i64, ptr %aslot
  call void @gcMarkValue(i64 %avalue)
  %ai.next = add i64 %ai, 1
  br label %walk.array.loop
walk.array.proto:
  %arr.proto.ptr = getelementptr i8, ptr %cell, i64 32
  %arr.proto = load ptr, ptr %arr.proto.ptr
  call void @gcMarkPayloadPtr(ptr %arr.proto)
  %arr.props.ptr = getelementptr i8, ptr %cell, i64 40
  %arr.props = load ptr, ptr %arr.props.ptr
  call void @gcMarkPayloadPtr(ptr %arr.props)
  br label %skip
walk.collection:
  %col.used.ptr = getelementptr i8, ptr %cell, i64 16
  %col.used = load i64, ptr %col.used.ptr
  %col.entries.ptr = getelementptr i8, ptr %cell, i64 32
  %col.entries = load ptr, ptr %col.entries.ptr
  %col.iterator.ptr = getelementptr i8, ptr %cell, i64 40
  %col.iterator = load i64, ptr %col.iterator.ptr
  call void @gcMarkValue(i64 %col.iterator)
  br label %walk.collection.loop
walk.collection.loop:
  %ci = phi i64 [ 0, %walk.collection ], [ %ci.next, %walk.collection.skip ]
  %cdone = icmp eq i64 %ci, %col.used
  br i1 %cdone, label %skip, label %walk.collection.body
walk.collection.body:
  %centry.bytes = mul i64 %ci, 24
  %centry.ptr = getelementptr i8, ptr %col.entries, i64 %centry.bytes
  %cactive = load i64, ptr %centry.ptr
  %cis.active = icmp ne i64 %cactive, 0
  br i1 %cis.active, label %walk.collection.active, label %walk.collection.skip
walk.collection.active:
  %ckey.slot = getelementptr i8, ptr %centry.ptr, i64 8
  %ckey = load i64, ptr %ckey.slot
  call void @gcMarkValue(i64 %ckey)
  %cvalue.slot = getelementptr i8, ptr %centry.ptr, i64 16
  %cvalue = load i64, ptr %cvalue.slot
  call void @gcMarkValue(i64 %cvalue)
  br label %walk.collection.skip
walk.collection.skip:
  %ci.next = add i64 %ci, 1
  br label %walk.collection.loop
walk.function:
  %fn.env.ptr = getelementptr i8, ptr %cell, i64 16
  %fn.env = load ptr, ptr %fn.env.ptr
  call void @gcMarkPayloadPtr(ptr %fn.env)
  %fn.this.ptr = getelementptr i8, ptr %cell, i64 24
  %fn.this = load i64, ptr %fn.this.ptr
  call void @gcMarkValue(i64 %fn.this)
  %fn.proto.ptr = getelementptr i8, ptr %cell, i64 32
  %fn.proto = load ptr, ptr %fn.proto.ptr
  call void @gcMarkPayloadPtr(ptr %fn.proto)
  %fn.name.ptr = getelementptr i8, ptr %cell, i64 40
  %fn.name = load i64, ptr %fn.name.ptr
  call void @gcMarkValue(i64 %fn.name)
  br label %skip
walk.environment:
  ; Environment cell: payload+0 holds slot count (i64), payload+8 holds a pointer
  ; to a malloc'd slots buffer (count * 8 bytes of boxed JSValues). Mark every slot.
  %env.count.ptr = getelementptr i8, ptr %cell, i64 8
  %env.count = load i64, ptr %env.count.ptr
  %env.slots.ptr = getelementptr i8, ptr %cell, i64 16
  %env.slots = load ptr, ptr %env.slots.ptr
  br label %walk.environment.loop
walk.environment.loop:
  %ei = phi i64 [ 0, %walk.environment ], [ %ei.next, %walk.environment.body ]
  %edone = icmp eq i64 %ei, %env.count
  br i1 %edone, label %skip, label %walk.environment.body
walk.environment.body:
  %eslot.bytes = mul i64 %ei, 8
  %eslot = getelementptr i8, ptr %env.slots, i64 %eslot.bytes
  %evalue = load i64, ptr %eslot
  call void @gcMarkValue(i64 %evalue)
  %ei.next = add i64 %ei, 1
  br label %walk.environment.loop
walk.iterator:
  ; Iterator state cell: +0 index, +8 sourceKind, +16 iterationKind, +24 sourceBits, +32 done.
  ; sourceKind 0/1 (array/string) store a JSValue; 2/3 (map/set) store a collection payload ptr.
  %it.kind.ptr = getelementptr i8, ptr %cell, i64 16
  %it.kind = load i64, ptr %it.kind.ptr
  %it.source.ptr = getelementptr i8, ptr %cell, i64 32
  %it.source = load i64, ptr %it.source.ptr
  %it.is.array = icmp eq i64 %it.kind, 0
  %it.is.string = icmp eq i64 %it.kind, 1
  %it.is.boxed = or i1 %it.is.array, %it.is.string
  br i1 %it.is.boxed, label %walk.iterator.boxed, label %walk.iterator.collection
walk.iterator.boxed:
  call void @gcMarkValue(i64 %it.source)
  br label %skip
walk.iterator.collection:
  %it.collection = inttoptr i64 %it.source to ptr
  call void @gcMarkPayloadPtr(ptr %it.collection)
  br label %skip
skip:
  ret void
}

define void @gcSweep() {
entry:
  %arena = load ptr, ptr @gcArenaBase
  %bump = load ptr, ptr @gcBumpPtr
  ; Recompute the surviving (black) byte total from scratch this cycle.
  store i64 0, ptr @gcLiveBytes
  br label %loop
loop:
  %cur = phi ptr [ %arena, %entry ], [ %step.cur, %advance ]
  %done = icmp uge ptr %cur, %bump
  br i1 %done, label %exit, label %check
check:
  %color.ptr = getelementptr i8, ptr %cur, i64 1
  %color = load i8, ptr %color.ptr
  %is.white = icmp eq i8 %color, 0
  %is.black = icmp eq i8 %color, 2
  br i1 %is.white, label %white, label %check.black
check.black:
  br i1 %is.black, label %black, label %advance
white:
  %tag.ptr = getelementptr i8, ptr %cur, i64 0
  %tag = load i8, ptr %tag.ptr
  %is.string = icmp eq i8 %tag, 1
  %is.object = icmp eq i8 %tag, 2
  %is.array = icmp eq i8 %tag, 3
  %is.collection = icmp eq i8 %tag, 4
  %is.function = icmp eq i8 %tag, 5
  %is.environment = icmp eq i8 %tag, 6
  %is.iterator = icmp eq i8 %tag, 7
  br i1 %is.string, label %free.string, label %check.free.object
check.free.object:
  br i1 %is.object, label %free.object, label %check.free.array
check.free.array:
  br i1 %is.array, label %free.array, label %check.free.collection
check.free.collection:
  br i1 %is.collection, label %free.collection, label %check.free.function
check.free.function:
  br i1 %is.function, label %free.function, label %check.free.environment
check.free.environment:
  br i1 %is.environment, label %free.environment, label %check.free.iterator
check.free.iterator:
  br i1 %is.iterator, label %free.iterator, label %advance
free.string:
  ; The string data buffer is owned by this cell only when the owns-flag (header
  ; byte +4) is set: literal-backed strings borrow constant data and must not be
  ; freed. Free before reusing the +8 payload word as the free-list next pointer.
  %s.owns.ptr = getelementptr i8, ptr %cur, i64 4
  %s.owns = load i8, ptr %s.owns.ptr
  %s.owned = icmp ne i8 %s.owns, 0
  br i1 %s.owned, label %free.string.buf, label %free.string.link
free.string.buf:
  %s.data.ptr = getelementptr i8, ptr %cur, i64 8
  %s.data = load ptr, ptr %s.data.ptr
  call void @free(ptr %s.data)
  br label %free.string.link
free.string.link:
  %sh = load ptr, ptr @gcFreeString
  %snf = getelementptr i8, ptr %cur, i64 8
  store ptr %sh, ptr %snf
  store ptr %cur, ptr @gcFreeString
  store i8 3, ptr %color.ptr
  br label %advance
free.object:
  ; Entry table (payload +16 => cell +24) is always a private malloc; free it.
  %o.entries.ptr = getelementptr i8, ptr %cur, i64 24
  %o.entries = load ptr, ptr %o.entries.ptr
  call void @free(ptr %o.entries)
  %oh = load ptr, ptr @gcFreeObject
  %onf = getelementptr i8, ptr %cur, i64 8
  store ptr %oh, ptr %onf
  store ptr %cur, ptr @gcFreeObject
  store i8 3, ptr %color.ptr
  br label %advance
free.array:
  ; Element buffer (payload +16 => cell +24) is a private malloc; free it. The
  ; properties object (cell +40) is a separate GC cell, reclaimed on its own sweep.
  %a.elems.ptr = getelementptr i8, ptr %cur, i64 24
  %a.elems = load ptr, ptr %a.elems.ptr
  call void @free(ptr %a.elems)
  %ah = load ptr, ptr @gcFreeArray
  %anf = getelementptr i8, ptr %cur, i64 8
  store ptr %ah, ptr %anf
  store ptr %cur, ptr @gcFreeArray
  store i8 3, ptr %color.ptr
  br label %advance
free.collection:
  ; Entry buffer (payload +24 => cell +32) is a private malloc; free it.
  %c.entries.ptr = getelementptr i8, ptr %cur, i64 32
  %c.entries = load ptr, ptr %c.entries.ptr
  call void @free(ptr %c.entries)
  %ch = load ptr, ptr @gcFreeCollection
  %cnf = getelementptr i8, ptr %cur, i64 8
  store ptr %ch, ptr %cnf
  store ptr %cur, ptr @gcFreeCollection
  store i8 3, ptr %color.ptr
  br label %advance
free.function:
  %fh = load ptr, ptr @gcFreeFunction
  %fnf = getelementptr i8, ptr %cur, i64 8
  store ptr %fh, ptr %fnf
  store ptr %cur, ptr @gcFreeFunction
  store i8 3, ptr %color.ptr
  br label %advance
free.environment:
  ; Slots buffer (cell +16) is a private malloc owned by this env cell. Free it
  ; before recycling the cell into @gcFreeEnvironment via the payload +8 next ptr.
  %e.slots.ptr = getelementptr i8, ptr %cur, i64 16
  %e.slots = load ptr, ptr %e.slots.ptr
  call void @free(ptr %e.slots)
  %eh = load ptr, ptr @gcFreeEnvironment
  %enf = getelementptr i8, ptr %cur, i64 8
  store ptr %eh, ptr %enf
  store ptr %cur, ptr @gcFreeEnvironment
  store i8 3, ptr %color.ptr
  br label %advance
free.iterator:
  %ih = load ptr, ptr @gcFreeIterator
  %inf = getelementptr i8, ptr %cur, i64 8
  store ptr %ih, ptr %inf
  store ptr %cur, ptr @gcFreeIterator
  store i8 3, ptr %color.ptr
  br label %advance
black:
  store i8 0, ptr %color.ptr
  ; Survivor: add its full cell footprint (header + payload) to the live total.
  %b.size.ptr = getelementptr i8, ptr %cur, i64 2
  %b.size.i16 = load i16, ptr %b.size.ptr
  %b.size = zext i16 %b.size.i16 to i64
  %b.cell.bytes = add i64 %b.size, 8
  %b.live = load i64, ptr @gcLiveBytes
  %b.live.next = add i64 %b.live, %b.cell.bytes
  store i64 %b.live.next, ptr @gcLiveBytes
  br label %advance
advance:
  %size.ptr = getelementptr i8, ptr %cur, i64 2
  %size.i16 = load i16, ptr %size.ptr
  %size = zext i16 %size.i16 to i64
  %step.bytes = add i64 %size, 8
  %step.cur = getelementptr i8, ptr %cur, i64 %step.bytes
  br label %loop
exit:
  ret void
}

define void @gcCollect() {
entry:
  br label %root.loop
root.loop:
  %i = phi i64 [ 0, %entry ], [ %i.next, %root.advance ]
  %count = load i64, ptr @gcRootStackCount
  %done = icmp uge i64 %i, %count
  br i1 %done, label %drain.mark, label %mark.root
mark.root:
  %stack = load ptr, ptr @gcRootStack
  %slot.bytes = mul i64 %i, 8
  %slot = getelementptr i8, ptr %stack, i64 %slot.bytes
  %root = load i64, ptr %slot
  call void @gcMarkValue(i64 %root)
  br label %root.advance
root.advance:
  %i.next = add i64 %i, 1
  br label %root.loop
drain.mark:
  br label %drain.loop
drain.loop:
  %dcount = load i64, ptr @gcMarkStackCount
  %ddone = icmp eq i64 %dcount, 0
  br i1 %ddone, label %after.mark, label %drain.pop
drain.pop:
  %dcount2 = load i64, ptr @gcMarkStackCount
  %didx = sub i64 %dcount2, 1
  store i64 %didx, ptr @gcMarkStackCount
  %dstack = load ptr, ptr @gcMarkStack
  %dslot.bytes = mul i64 %didx, 8
  %dslot = getelementptr i8, ptr %dstack, i64 %dslot.bytes
  %dcell = load ptr, ptr %dslot
  call void @gcMarkObject(ptr %dcell)
  br label %drain.loop
after.mark:
  call void @gcSweep()
  store i64 0, ptr @gcBytesAllocd
  %colls = load i64, ptr @gcCollections
  %colls.next = add i64 %colls, 1
  store i64 %colls.next, ptr @gcCollections
  %trace = load i64, ptr @gcTrace
  %trace.on = icmp ne i64 %trace, 0
  br i1 %trace.on, label %trace.emit, label %ret
trace.emit:
  %live = load i64, ptr @gcLiveBytes
  %colls.print = load i64, ptr @gcCollections
  call i32 (ptr, ...) @printf(ptr @.gc.trace.fmt, i64 %colls.print, i64 %live)
  br label %ret
ret:
  ret void
}

define ptr @gcAlloc(i64 %tag, i64 %size) {
entry:
  %bytes = add i64 %size, 8
  %is.string = icmp eq i64 %tag, 1
  %is.object = icmp eq i64 %tag, 2
  %is.array = icmp eq i64 %tag, 3
  %is.collection = icmp eq i64 %tag, 4
  %is.function = icmp eq i64 %tag, 5
  %is.environment = icmp eq i64 %tag, 6
  %is.iterator = icmp eq i64 %tag, 7
  br i1 %is.string, label %try.string, label %try.object
try.string:
  %sh = load ptr, ptr @gcFreeString
  %se = icmp eq ptr %sh, null
  br i1 %se, label %bump.alloc, label %reuse.string
reuse.string:
  %snf = getelementptr i8, ptr %sh, i64 8
  %sn = load ptr, ptr %snf
  store ptr %sn, ptr @gcFreeString
  br label %init.header
try.object:
  br i1 %is.object, label %try.object.body, label %try.array
try.object.body:
  %oh = load ptr, ptr @gcFreeObject
  %oe = icmp eq ptr %oh, null
  br i1 %oe, label %bump.alloc, label %reuse.object
reuse.object:
  %onf = getelementptr i8, ptr %oh, i64 8
  %on = load ptr, ptr %onf
  store ptr %on, ptr @gcFreeObject
  br label %init.header
try.array:
  br i1 %is.array, label %try.array.body, label %try.collection
try.array.body:
  %ah = load ptr, ptr @gcFreeArray
  %ae = icmp eq ptr %ah, null
  br i1 %ae, label %bump.alloc, label %reuse.array
reuse.array:
  %anf = getelementptr i8, ptr %ah, i64 8
  %an = load ptr, ptr %anf
  store ptr %an, ptr @gcFreeArray
  br label %init.header
try.collection:
  br i1 %is.collection, label %try.collection.body, label %try.function
try.collection.body:
  %ch = load ptr, ptr @gcFreeCollection
  %ce = icmp eq ptr %ch, null
  br i1 %ce, label %bump.alloc, label %reuse.collection
reuse.collection:
  %cnf = getelementptr i8, ptr %ch, i64 8
  %cn = load ptr, ptr %cnf
  store ptr %cn, ptr @gcFreeCollection
  br label %init.header
try.function:
  br i1 %is.function, label %try.function.body, label %try.environment
try.function.body:
  %fh = load ptr, ptr @gcFreeFunction
  %fe = icmp eq ptr %fh, null
  br i1 %fe, label %bump.alloc, label %reuse.function
reuse.function:
  %fnf = getelementptr i8, ptr %fh, i64 8
  %fn = load ptr, ptr %fnf
  store ptr %fn, ptr @gcFreeFunction
  br label %init.header
try.environment:
  br i1 %is.environment, label %try.environment.body, label %try.iterator
try.environment.body:
  %eh = load ptr, ptr @gcFreeEnvironment
  %ee = icmp eq ptr %eh, null
  br i1 %ee, label %bump.alloc, label %reuse.environment
reuse.environment:
  %enf = getelementptr i8, ptr %eh, i64 8
  %en = load ptr, ptr %enf
  store ptr %en, ptr @gcFreeEnvironment
  br label %init.header
try.iterator:
  br i1 %is.iterator, label %try.iterator.body, label %bump.alloc
try.iterator.body:
  %ih = load ptr, ptr @gcFreeIterator
  %ie = icmp eq ptr %ih, null
  br i1 %ie, label %bump.alloc, label %reuse.iterator
reuse.iterator:
  %inf = getelementptr i8, ptr %ih, i64 8
  %in = load ptr, ptr %inf
  store ptr %in, ptr @gcFreeIterator
  br label %init.header
bump.alloc:
  %bump = load ptr, ptr @gcBumpPtr
  %arena.end = load ptr, ptr @gcArenaEnd
  %new.bump = getelementptr i8, ptr %bump, i64 %bytes
  %will.fit = icmp ule ptr %new.bump, %arena.end
  br i1 %will.fit, label %do.bump, label %oom
do.bump:
  store ptr %new.bump, ptr @gcBumpPtr
  br label %init.header
oom:
  call void @exit(i32 1)
  ret ptr null
init.header:
  %cell = phi ptr [ %sh, %reuse.string ], [ %oh, %reuse.object ], [ %ah, %reuse.array ], [ %ch, %reuse.collection ], [ %fh, %reuse.function ], [ %eh, %reuse.environment ], [ %ih, %reuse.iterator ], [ %bump, %do.bump ]
  %tag.i8 = trunc i64 %tag to i8
  store i8 %tag.i8, ptr %cell
  %color.slot = getelementptr i8, ptr %cell, i64 1
  store i8 0, ptr %color.slot
  %size.slot = getelementptr i8, ptr %cell, i64 2
  %size.i16 = trunc i64 %size to i16
  store i16 %size.i16, ptr %size.slot
  ; Clear the reserved header word (+4..+7). Bit 0 is the "owns external buffer"
  ; flag read by gcSweep for strings; zeroing here keeps a reused free-list cell
  ; from inheriting a stale owns flag.
  %reserved.slot = getelementptr i8, ptr %cell, i64 4
  store i32 0, ptr %reserved.slot
  %old.bytes = load i64, ptr @gcBytesAllocd
  %new.bytes = add i64 %old.bytes, %bytes
  store i64 %new.bytes, ptr @gcBytesAllocd
  %threshold = load i64, ptr @gcNextCollectAt
  %over.threshold = icmp sgt i64 %new.bytes, %threshold
  br i1 %over.threshold, label %mark.pending, label %done.alloc
mark.pending:
  store i64 1, ptr @gcCollectPending
  br label %done.alloc
done.alloc:
  ret ptr %cell
}

define i64 @gcStatsLiveBytes() {
entry:
  %live = load i64, ptr @gcLiveBytes
  ret i64 %live
}

define i64 @gcStatsCollections() {
entry:
  %colls = load i64, ptr @gcCollections
  ret i64 %colls
}
; gcCollect emits a trace line on stderr when TSCN_GC_TRACE is set.

import {
  declaration,
  declarationList,
  described,
  optionalDeclaration,
  preserved,
  preservedList,
  reference,
  referenceList
} from "./field-roles.js";
import type { OperationRoleTable } from "./role-tables.js";

/** The bindings a class lowering declares by name. A class's prototype and static storage are ordinary bindings. */
const classStorageReference = reference;

export const operationRoles = {
  requireObjectCoercible: {},

  // Scalar and value declarations.
  constNumber: { name: declaration },
  constString: { name: declaration, value: preserved("stringData") },
  constStringExpression: { name: declaration },
  constBoolean: { name: declaration },
  constBooleanExpression: { name: declaration },
  constValue: { name: declaration },
  letValue: { name: declaration },
  constClosure: { name: declaration },
  letNumber: { name: declaration },
  letString: { name: declaration },
  letBoolean: { name: declaration },

  // Aggregate declarations.
  arrayLiteral: { name: declaration },
  runtimeArrayLiteral: { name: declaration },
  objectLiteral: { name: declaration },
  runtimeObjectLiteral: { name: declaration },
  runtimeObjectCreate: { name: declaration, prototypeName: reference },
  runtimeErrorLiteral: { name: declaration, errorName: preserved("errorName") },

  // Aggregate producers that read a source aggregate.
  runtimeObjectKeys: { name: declaration, targetName: reference },
  runtimeObjectValues: { name: declaration, targetName: reference },
  runtimeObjectEntries: { name: declaration, targetName: reference },
  runtimeObjectFromEntries: { name: declaration, entriesName: reference },
  runtimeObjectOwnPropertyDescriptor: { name: declaration, targetName: reference },
  runtimeObjectOwnPropertyNames: { name: declaration, targetName: reference },
  runtimeObjectOwnPropertyDescriptors: { name: declaration, targetName: reference },
  runtimeArraySlice: { name: declaration, arrayName: reference },
  runtimeArraySplice: { name: declaration, arrayName: reference },
  runtimeArraySpliceStatement: { arrayName: reference },
  runtimeArrayFlat: { name: declaration, arrayName: reference },
  runtimeStringSplit: { name: declaration },
  runtimeRegexSplit: { name: declaration },

  // Array callbacks. `callbackName` names the callback *function*, which is a hoisted binding; the
  // `runtimeArrayMapFunctionObject` form generates its own code name instead, so it preserves.
  runtimeArrayMapCallback: { name: declaration, arrayName: reference, callbackName: reference, callbackParameters: described },
  runtimeArrayMapFunctionObject: {
    name: declaration,
    arrayName: reference,
    callbackName: preserved("generatedSymbol")
  },
  runtimeArrayFlatMapCallback: { name: declaration, arrayName: reference, callbackName: reference, callbackParameters: described },
  runtimeArraySort: { name: declaration, arrayName: reference, callbackName: reference, callbackParameters: described },
  runtimeArrayFrom: { name: declaration, targetName: reference },
  runtimeArrayFromValue: { name: declaration },
  runtimeArrayFromCollection: { name: declaration, collectionName: reference },
  runtimeArrayFilterCallback: { name: declaration, arrayName: reference, callbackName: reference, callbackParameters: described },
  runtimeArrayConcat: { name: declaration, leftName: reference },
  runtimeArrayMutatorResult: { name: declaration, arrayName: reference },
  runtimeObjectGetPrototype: { name: declaration, targetName: reference },

  // Assignments name an existing binding, so they reference rather than declare.
  assignNumber: { name: reference },
  assignString: { name: reference },
  assignBoolean: { name: reference },

  // Aggregate mutation.
  arrayStore: { arrayName: reference },
  runtimeArrayStore: { arrayName: reference },
  runtimeArrayNamedStore: { arrayName: reference },
  runtimeArrayDelete: { arrayName: reference },
  runtimeArrayNamedDelete: { arrayName: reference },
  runtimeArraySetLength: { arrayName: reference },
  runtimeArrayPush: { arrayName: reference },
  runtimeArrayUnshift: { arrayName: reference },
  runtimeArrayFill: { arrayName: reference },
  runtimeArrayReverse: { arrayName: reference },
  runtimeArrayForEachCallback: { arrayName: reference, callbackName: reference, callbackParameters: described },
  runtimeArrayFindCallback: { name: declaration, arrayName: reference, callbackName: reference, callbackParameters: described },
  runtimeArrayFindIndexCallback: { name: declaration, arrayName: reference, callbackName: reference, callbackParameters: described },
  runtimeArrayReduceCallback: { name: declaration, arrayName: reference, callbackName: reference, callbackParameters: described },

  // Collections.
  runtimeMapNew: { name: declaration },
  runtimeSetNew: { name: declaration },
  runtimeMapFromArray: { name: declaration, sourceName: reference },
  runtimeSetFromArray: { name: declaration, sourceName: reference },
  runtimeMapFromIterable: { name: declaration, notIterableMessage: preserved("message") },
  runtimeSetFromIterable: { name: declaration, notIterableMessage: preserved("message") },
  runtimeMapFromCollection: { name: declaration, sourceName: reference },
  runtimeSetFromCollection: { name: declaration, sourceName: reference },
  runtimeMapSet: { mapName: reference },
  runtimeCollectionSetIterator: { collectionName: reference },
  runtimeSetAdd: { setName: reference },
  runtimeMapSetResult: { name: declaration, mapName: reference },
  runtimeSetAddResult: { name: declaration, setName: reference },
  runtimeIteratorNew: { name: declaration, collectionName: reference },
  runtimeArrayCopyWithin: { arrayName: reference },
  runtimeArrayPop: { arrayName: reference },
  runtimeArrayShift: { arrayName: reference },

  // Property and prototype writes.
  // `path` is the fixed field path into the object, which stays observable as property names.
  objectStore: { objectName: reference, path: preservedList("propertyKey") },
  runtimeObjectStore: { objectName: reference },
  valueObjectStore: { targetName: reference },
  privateFieldStore: { targetName: reference, key: preserved("privateKey"), message: preserved("message") },
  valueArrayStore: { targetName: reference },
  valueArraySetLength: { targetName: reference },
  runtimeObjectDelete: { objectName: reference },
  valueObjectDelete: { targetName: reference },
  valueArrayDelete: { targetName: reference },
  runtimeObjectSetPrototype: { targetName: reference, prototypeName: classStorageReference },
  valueObjectSetPrototype: { targetName: reference, prototypeName: classStorageReference },
  runtimeObjectPreventExtensions: { objectName: reference },
  runtimeObjectSeal: { objectName: reference },
  runtimeObjectFreeze: { objectName: reference },
  runtimeObjectAssign: { targetName: reference },
  runtimeObjectDefineDataProperty: { objectName: reference },
  runtimeObjectDefineDataProperties: { objectName: reference },

  // Control flow.
  print: {},
  throwValue: {},
  block: {},
  // `catchVariable` is empty when there is no catch clause, so it declares only when it has a name.
  tryCatch: { catchVariable: optionalDeclaration },
  bindingGroup: {},
  if: {},
  switch: {},
  while: {},
  doWhile: {},
  for: {},

  // Loops bind their item per iteration, which is a declaration in the loop's own scope.
  forOfArray: { itemName: declaration, arrayName: reference },
  forOfString: { itemName: declaration },
  forOfSet: { itemName: declaration, setName: reference },
  forOfMap: { itemName: declaration, mapName: reference },
  forOfProtocol: { itemName: declaration, notIterableMessage: preserved("message") },
  arrayDestructureProtocol: { notIterableMessage: preserved("message") },
  forInObject: { itemName: declaration, objectName: reference },
  forInArray: { itemName: declaration, arrayName: reference },
  break: {},
  continue: {},

  // A function declaration is visible before its own statement, so the operations pre-pass declares
  // its name before walking the block. `enclosingCaptureNames` names what its body reads from
  // outside, which is how a consumer knows which environment slots it has to build.
  function: { name: reference, enclosingCaptureNames: referenceList },
  call: { name: reference },
  callValue: {},
  inlineCpp: { symbol: preserved("generatedSymbol") },
  returnNumber: {},
  returnString: {},
  returnValue: {},

  // A closure's own function name is generated; its parameters declare in its frame and its captures
  // read bindings from outside.
  returnClosure: { functionName: preserved("generatedSymbol"), parameters: declarationList, captures: referenceList }
} satisfies OperationRoleTable;

import type { BindingRef, BindingStorage, FunctionId, LexicalOwner } from "../../src/compiler/binding-resolution/binding-id.js"
import type { VariantOfKind } from "../../src/compiler/binding-resolution/dispatch.js"
import type { ResolveNested, ResolvedArrayMutation, ResolvedCallArgument, ResolvedClosureValue, ResolvedConcatElement, ResolvedCondition, ResolvedDataDescriptor, ResolvedDestructureElement, ResolvedDestructureSource, ResolvedExpression, ResolvedFunctionObject, ResolvedFunctionObjectCapture, ResolvedFunctionParameter, ResolvedNumberExpression, ResolvedObjectAssignSource, ResolvedObjectField, ResolvedObjectFieldValue, ResolvedObjectValue, ResolvedOperation, ResolvedRuntimeArrayElement, ResolvedRuntimeObjectField, ResolvedRuntimeObjectValue, ResolvedStringExpression, ResolvedSwitchClause, ResolvedValueExpression } from "../../src/compiler/binding-resolution/resolved-types.js"
import type { JsIrArrayDestructureElement, JsIrArrayIsArrayOperand, JsIrArrayMutation, JsIrCallArgument, JsIrClosureValue, JsIrCondition, JsIrDestructureSource, JsIrExpression, JsIrFunctionObjectCapture, JsIrFunctionObjectDefinition, JsIrFunctionParameter, JsIrNumberExpression, JsIrObjectAssignSource, JsIrObjectFieldValue, JsIrObjectValue, JsIrOperationNode, JsIrOperationTrace, JsIrRuntimeArrayConcatElement, JsIrRuntimeArrayElement, JsIrRuntimeDataDescriptor, JsIrRuntimeObjectValue, JsIrStringExpression, JsIrSwitchClause, JsIrValueExpression } from "../../src/compiler/ir.js"

type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type Assert<A extends true> = A;

export type _ValueInputIsItsOwnVariant = Assert<
  Equals<VariantOfKind<JsIrValueExpression, JsIrValueExpression["kind"]>, JsIrValueExpression>
>;
export type _ValueOutputIsItsOwnVariant = Assert<
  Equals<VariantOfKind<ResolvedValueExpression, ResolvedValueExpression["kind"]>, ResolvedValueExpression>
>;
export type _NumberInputIsItsOwnVariant = Assert<
  Equals<VariantOfKind<JsIrNumberExpression, JsIrNumberExpression["kind"]>, JsIrNumberExpression>
>;
export type _NumberOutputIsItsOwnVariant = Assert<
  Equals<VariantOfKind<ResolvedNumberExpression, ResolvedNumberExpression["kind"]>, ResolvedNumberExpression>
>;
export type _StringInputIsItsOwnVariant = Assert<
  Equals<VariantOfKind<JsIrStringExpression, JsIrStringExpression["kind"]>, JsIrStringExpression>
>;
export type _StringOutputIsItsOwnVariant = Assert<
  Equals<VariantOfKind<ResolvedStringExpression, ResolvedStringExpression["kind"]>, ResolvedStringExpression>
>;
export type _ConditionInputIsItsOwnVariant = Assert<
  Equals<VariantOfKind<JsIrCondition, JsIrCondition["kind"]>, JsIrCondition>
>;
export type _ConditionOutputIsItsOwnVariant = Assert<
  Equals<VariantOfKind<ResolvedCondition, ResolvedCondition["kind"]>, ResolvedCondition>
>;
export type _ExpressionInputIsItsOwnVariant = Assert<Equals<VariantOfKind<JsIrExpression, JsIrExpression["kind"]>, JsIrExpression>>;
export type _ExpressionOutputIsItsOwnVariant = Assert<
  Equals<VariantOfKind<ResolvedExpression, ResolvedExpression["kind"]>, ResolvedExpression>
>;
export type _OperationInputIsItsOwnVariant = Assert<
  Equals<VariantOfKind<JsIrOperationNode, JsIrOperationNode["kind"]>, JsIrOperationNode>
>;
export type _OperationOutputIsItsOwnVariant = Assert<
  Equals<VariantOfKind<ResolvedOperation, ResolvedOperation["kind"]>, ResolvedOperation>
>;

// The resolved tier is a discriminated union over exactly the IR's kinds, so a consumer can switch on
// `kind` over it the way it does over the JsIr. Without this the tier would be a mapped object keyed by
// kind, which has no `kind` property at all.
export type _OperationKinds = Assert<Equals<ResolvedOperation["kind"], JsIrOperationNode["kind"]>>;
export type _ValueKinds = Assert<Equals<ResolvedValueExpression["kind"], JsIrValueExpression["kind"]>>;
export type _NumberKinds = Assert<Equals<ResolvedNumberExpression["kind"], JsIrNumberExpression["kind"]>>;
export type _StringKinds = Assert<Equals<ResolvedStringExpression["kind"], JsIrStringExpression["kind"]>>;
export type _ConditionKinds = Assert<Equals<ResolvedCondition["kind"], JsIrCondition["kind"]>>;
export type _ExpressionKinds = Assert<Equals<ResolvedExpression["kind"], JsIrExpression["kind"]>>;

// A declaration's name is an identity.
export type _ConstNumberName = Assert<Equals<Extract<ResolvedOperation, { kind: "constNumber" }>["name"], BindingRef>>;
export type _LetValueName = Assert<Equals<Extract<ResolvedOperation, { kind: "letValue" }>["name"], BindingRef>>;
export type _FunctionName = Assert<Equals<Extract<ResolvedOperation, { kind: "function" }>["name"], BindingRef>>;
export type _ReturnClosureParameters = Assert<
  Equals<Extract<ResolvedOperation, { kind: "returnClosure" }>["parameters"], readonly BindingRef[]>
>;

// A catch parameter the IR spells as the empty string declares nothing, and its field says so rather
// than claiming an identity that does not exist.
export type _CatchVariableIsOptional = Assert<
  Equals<Extract<ResolvedOperation, { kind: "tryCatch" }>["catchVariable"], BindingRef | undefined>
>;

// A reference's name is an identity, in every tier and under every field spelling.
export type _ArrayStoreArray = Assert<Equals<Extract<ResolvedOperation, { kind: "arrayStore" }>["arrayName"], BindingRef>>;
export type _TargetName = Assert<Equals<Extract<ResolvedOperation, { kind: "runtimeObjectKeys" }>["targetName"], BindingRef>>;
export type _ValueVariable = Assert<Equals<Extract<ResolvedValueExpression, { kind: "variable" }>["name"], BindingRef>>;
export type _NumberParameter = Assert<Equals<Extract<ResolvedNumberExpression, { kind: "parameter" }>["name"], BindingRef>>;
export type _NumberUpdate = Assert<Equals<Extract<ResolvedNumberExpression, { kind: "update" }>["name"], BindingRef>>;
export type _StringVariable = Assert<Equals<Extract<ResolvedStringExpression, { kind: "variable" }>["name"], BindingRef>>;
export type _BooleanVariable = Assert<Equals<Extract<ResolvedCondition, { kind: "booleanVariable" }>["name"], BindingRef>>;
export type _CollectionIdentity = Assert<
  Equals<Extract<ResolvedCondition, { kind: "runtimeCollectionIdentity" }>["leftName"], BindingRef>
>;

// A preserved string stays a string: property keys, string data, generated symbols, error names,
// private keys, template text and messages must survive as themselves.
export type _ConstStringValue = Assert<Equals<Extract<ResolvedOperation, { kind: "constString" }>["value"], string>>;
export type _PrivateKey = Assert<Equals<Extract<ResolvedOperation, { kind: "privateFieldStore" }>["key"], string>>;
export type _PrivateMessage = Assert<Equals<Extract<ResolvedOperation, { kind: "privateFieldStore" }>["message"], string>>;
export type _ErrorName = Assert<Equals<Extract<ResolvedOperation, { kind: "runtimeErrorLiteral" }>["errorName"], string>>;
export type _ConditionErrorName = Assert<Equals<Extract<ResolvedCondition, { kind: "errorInstanceOf" }>["errorName"], string>>;
export type _ClassName = Assert<Equals<Extract<ResolvedValueExpression, { kind: "newInstance" }>["className"], string>>;
export type _ConstructorName = Assert<Equals<Extract<ResolvedValueExpression, { kind: "newInstance" }>["constructorName"], BindingRef>>;
export type _InlineCppSymbol = Assert<Equals<Extract<ResolvedOperation, { kind: "inlineCpp" }>["symbol"], string>>;
export type _TemplateHead = Assert<Equals<Extract<ResolvedStringExpression, { kind: "taggedTemplate" }>["head"], string>>;
export type _StringLiteral = Assert<Equals<Extract<ResolvedStringExpression, { kind: "literal" }>["value"], string>>;

// A class's prototype *is* a binding the class declared, so those two do resolve.
export type _NewInstancePrototype = Assert<
  Equals<Extract<ResolvedValueExpression, { kind: "newInstance" }>["prototypeName"], BindingRef>
>;
export type _SetPrototype = Assert<
  Equals<Extract<ResolvedOperation, { kind: "valueObjectSetPrototype" }>["prototypeName"], BindingRef>
>;

// A preserved list stays a list of strings and a reference list becomes identities. `readonly T[]` and
// `T[]` are different types with the same elements, which is not the property under test, so these are
// asserted by assignability rather than by `Equals`.
export type _ObjectStorePathStaysStrings = Assert<
  [Extract<ResolvedOperation, { kind: "objectStore" }>["path"]] extends [readonly string[]] ? true : false
>;
export type _CaptureNamesBecomeIdentities = Assert<
  [Extract<ResolvedOperation, { kind: "function" }>["enclosingCaptureNames"]] extends
    [readonly BindingRef[] | undefined] ? true : false
>;

// Nested IR recurses. This is the assertion that distinguishes a real resolved IR from an annotated one:
// if the fallback branch passed nested fields through, `value` would still be a JsIr expression. A nested
// expression must be assignable to the resolved tier and must *not* be assignable to the JsIr tier it
// came from, which is the direction that actually catches an unresolved field.
export type _NestedNumberIsResolved = Assert<
  [Extract<ResolvedOperation, { kind: "constNumber" }>["value"]] extends [ResolvedNumberExpression] ? true : false
>;
export type _NestedNumberIsNotJsIr = Assert<
  [Extract<ResolvedOperation, { kind: "constNumber" }>["value"]] extends [JsIrNumberExpression] ? false : true
>;
export type _NestedOperationsAreResolved = Assert<
  [Extract<ResolvedOperation, { kind: "block" }>["operations"][number]] extends [ResolvedOperation] ? true : false
>;
export type _NestedOperationsAreNotJsIr = Assert<
  [Extract<ResolvedOperation, { kind: "block" }>["operations"][number]] extends [JsIrOperationNode] ? false : true
>;
export type _NestedValueIsResolved = Assert<
  [Extract<ResolvedValueExpression, { kind: "ternary" }>["consequent"]] extends [ResolvedValueExpression] ? true : false
>;
export type _NestedValueIsNotJsIr = Assert<
  [Extract<ResolvedValueExpression, { kind: "ternary" }>["consequent"]] extends [JsIrValueExpression] ? false : true
>;

// A field the IR declares as optional keeps its `?` and resolves to an identity when present. The
// optionality has to be asked about with `extends { … ? }`, because TypeScript does not put `undefined`
// in the *type* of an optional property.
export type _ReplacerNameResolves = Assert<
  [Extract<ResolvedValueExpression, { kind: "jsonStringify" }>["replacerName"]] extends [BindingRef | undefined]
    ? true
    : false
>;
export type _ReplacerNameStaysOptional = Assert<
  Extract<ResolvedValueExpression, { kind: "jsonStringify" }> extends { readonly replacerName?: BindingRef }
    ? true
    : false
>;
export type _CallbackNameResolves = Assert<
  [Extract<ResolvedOperation, { kind: "runtimeArraySort" }>["callbackName"]] extends [BindingRef | undefined]
    ? true
    : false
>;
export type _CallbackNameStaysOptional = Assert<
  Extract<ResolvedOperation, { kind: "runtimeArraySort" }> extends { readonly callbackName?: BindingRef }
    ? true
    : false
>;

// The IR's closed enumerations are not text fields and must pass through untouched.
export type _TargetKind = Assert<
  Equals<Extract<ResolvedOperation, { kind: "runtimeObjectKeys" }>["targetKind"], "object" | "array" | "value">
>;
export type _HasCatch = Assert<Equals<Extract<ResolvedOperation, { kind: "tryCatch" }>["hasCatch"], boolean>>;

// A described field keeps the IR's own shape: a named callback's parameters describe the frame of the
// function declaration its name refers to, so they stay `JsIrFunctionParameter` rather than becoming a
// second set of identities for names that already have one.
export type _CallbackParametersStayDescriptions = Assert<
  Equals<
    Extract<ResolvedOperation, { kind: "runtimeArrayMapCallback" }>["callbackParameters"],
    readonly JsIrFunctionParameter[]
  >
>;

// `trace` rides along: provenance is not a binding, and a consumer attributes instructions through it.
export type _TraceSurvives = Assert<Equals<ResolvedOperation["trace"], JsIrOperationTrace | undefined>>;

// Each arm of the nested-payload dispatch maps the IR payload it claims to the resolved payload, and only
// that one. A payload two arms could both match would make the earlier arm's assertion fail here, which
// is what keeps the dispatch honest without a runtime check.
export type _CallArgument = Assert<Equals<ResolveNested<JsIrCallArgument>, ResolvedCallArgument>>;
export type _DestructureElement = Assert<Equals<ResolveNested<JsIrArrayDestructureElement>, ResolvedDestructureElement>>;
export type _RuntimeArrayElement = Assert<Equals<ResolveNested<JsIrRuntimeArrayElement>, ResolvedRuntimeArrayElement>>;
export type _ConcatElement = Assert<Equals<ResolveNested<JsIrRuntimeArrayConcatElement>, ResolvedConcatElement>>;
export type _ObjectAssignSource = Assert<Equals<ResolveNested<JsIrObjectAssignSource>, ResolvedObjectAssignSource>>;
export type _ClosureValue = Assert<Equals<ResolveNested<JsIrClosureValue>, ResolvedClosureValue>>;
export type _ObjectValue = Assert<Equals<ResolveNested<JsIrObjectValue>, ResolvedObjectValue>>;
export type _RuntimeObjectValue = Assert<Equals<ResolveNested<JsIrRuntimeObjectValue>, ResolvedRuntimeObjectValue>>;
export type _SwitchClause = Assert<Equals<ResolveNested<JsIrSwitchClause>, ResolvedSwitchClause>>;
export type _FunctionObject = Assert<Equals<ResolveNested<JsIrFunctionObjectDefinition>, ResolvedFunctionObject>>;
export type _FunctionParameter = Assert<Equals<ResolveNested<JsIrFunctionParameter>, ResolvedFunctionParameter>>;
export type _DataDescriptor = Assert<Equals<ResolveNested<JsIrRuntimeDataDescriptor>, ResolvedDataDescriptor>>;
export type _ArrayMutation = Assert<Equals<ResolveNested<JsIrArrayMutation>, ResolvedArrayMutation>>;
export type _DestructureSource = Assert<Equals<ResolveNested<JsIrDestructureSource>, ResolvedDestructureSource>>;
export type _FunctionObjectCapture = Assert<Equals<ResolveNested<JsIrFunctionObjectCapture>, ResolvedFunctionObjectCapture>>;
export type _ObjectFieldValue = Assert<Equals<ResolveNested<JsIrObjectFieldValue>, ResolvedObjectFieldValue>>;
export type _ArrayIsArrayOperand = Assert<
  Equals<ResolveNested<JsIrArrayIsArrayOperand>, boolean | ResolvedValueExpression>
>;

// Arrays map element-wise, which is what keeps `block.operations` resolved and a preserved
// `readonly string[]` untouched.
export type _OperationArrayResolves = Assert<
  Equals<ResolveNested<readonly JsIrOperationNode[]>, readonly ResolvedOperation[]>
>;
export type _StringArrayIsUntouched = Assert<Equals<ResolveNested<readonly string[]>, readonly string[]>>;
export type _PlainValueIsUntouched = Assert<Equals<ResolveNested<boolean>, boolean>>;

// The binding model is what a backend reads instead of a spelling.
export type _StorageCarriesBothParts = Assert<
  Equals<BindingStorage, { readonly representation: BindingStorage["representation"]; readonly location: BindingStorage["location"] }>
>;
export type _OwnerIsModuleOrFunction = Assert<
  Equals<LexicalOwner["kind"], "module" | "function">
>;
export type _ObjectFieldNameStaysAPropertyKey = Assert<Equals<ResolvedObjectField["name"], string>>;
export type _RuntimeObjectSpreadIsABinding = Assert<
  Equals<Extract<ResolvedRuntimeObjectField, { kind: "spread" }>["sourceName"], BindingRef>
>;
export type _FunctionBodyIsRequired = Assert<
  Equals<Extract<ResolvedFunctionObject, { readonly functionId: FunctionId }>["body"], readonly ResolvedOperation[]>
>;
export type _DirectFunctionReferenceHasNoBody = Assert<
  Equals<Extract<ResolvedFunctionObject, { readonly directTarget: BindingRef }>["body"], undefined>
>;

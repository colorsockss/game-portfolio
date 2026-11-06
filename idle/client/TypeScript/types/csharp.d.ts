// idle/client/Assets/Editor/TypeScript/TypeScriptTypings.cs가 생성한 파일. 직접 고치지 않는다.
// API 지문: c0e7cb10e99dfe20

    declare namespace CS {
    //keep type incompatibility / 此属性保持类型不兼容
    const __keep_incompatibility: unique symbol;
    interface $Ref<T> {
        __doNoAccess: T
    }
    namespace System {
        interface Array$1<T> extends System.Array {
            get_Item(index: number):T;
            set_Item(index: number, value: T):void;
        }
    }
    interface $Task<T> {}
    namespace System {
        class Object
        {
            protected [__keep_incompatibility]: never;
        }
        class ValueType extends System.Object
        {
            protected [__keep_incompatibility]: never;
        }
        class Void extends System.ValueType
        {
            protected [__keep_incompatibility]: never;
        }
        class Int32 extends System.ValueType implements System.IEquatable$1<number>, System.IFormattable, System.ISpanFormattable, System.IComparable, System.IComparable$1<number>, System.IConvertible
        {
            protected [__keep_incompatibility]: never;
        }
        interface IEquatable$1<T>
        {
        }
        interface IFormattable
        {
        }
        interface ISpanFormattable
        {
        }
        interface IComparable
        {
        }
        interface IComparable$1<T>
        {
        }
        interface IConvertible
        {
        }
        class Single extends System.ValueType implements System.IEquatable$1<number>, System.IFormattable, System.ISpanFormattable, System.IComparable, System.IComparable$1<number>, System.IConvertible
        {
            protected [__keep_incompatibility]: never;
        }
        class String extends System.Object implements System.IEquatable$1<string>, System.Collections.Generic.IEnumerable$1<number>, System.Collections.IEnumerable, System.ICloneable, System.IComparable, System.IComparable$1<string>, System.IConvertible
        {
            protected [__keep_incompatibility]: never;
        }
        class Char extends System.ValueType implements System.IEquatable$1<number>, System.IComparable, System.IComparable$1<number>, System.IConvertible
        {
            protected [__keep_incompatibility]: never;
        }
        interface ICloneable
        {
        }
        class Boolean extends System.ValueType implements System.IEquatable$1<boolean>, System.IComparable, System.IComparable$1<boolean>, System.IConvertible
        {
            protected [__keep_incompatibility]: never;
        }
        class Double extends System.ValueType implements System.IEquatable$1<number>, System.IFormattable, System.ISpanFormattable, System.IComparable, System.IComparable$1<number>, System.IConvertible
        {
            protected [__keep_incompatibility]: never;
        }
        class Array extends System.Object implements System.Collections.IEnumerable, System.ICloneable, System.Collections.IList, System.Collections.IStructuralComparable, System.Collections.IStructuralEquatable, System.Collections.ICollection
        {
            protected [__keep_incompatibility]: never;
            public get LongLength(): bigint;
            public get IsFixedSize(): boolean;
            public get IsReadOnly(): boolean;
            public get IsSynchronized(): boolean;
            public get SyncRoot(): any;
            public get Length(): number;
            public get Rank(): number;
            public static CreateInstance ($elementType: System.Type, ...lengths: bigint[]) : System.Array
            public CopyTo ($array: System.Array, $index: number) : void
            public Clone () : any
            public static BinarySearch ($array: System.Array, $value: any) : number
            public static Copy ($sourceArray: System.Array, $destinationArray: System.Array, $length: bigint) : void
            public static Copy ($sourceArray: System.Array, $sourceIndex: bigint, $destinationArray: System.Array, $destinationIndex: bigint, $length: bigint) : void
            public CopyTo ($array: System.Array, $index: bigint) : void
            public GetLongLength ($dimension: number) : bigint
            public GetValue ($index: bigint) : any
            public GetValue ($index1: bigint, $index2: bigint) : any
            public GetValue ($index1: bigint, $index2: bigint, $index3: bigint) : any
            public GetValue (...indices: bigint[]) : any
            public static BinarySearch ($array: System.Array, $index: number, $length: number, $value: any) : number
            public static BinarySearch ($array: System.Array, $value: any, $comparer: System.Collections.IComparer) : number
            public static BinarySearch ($array: System.Array, $index: number, $length: number, $value: any, $comparer: System.Collections.IComparer) : number
            public static IndexOf ($array: System.Array, $value: any) : number
            public static IndexOf ($array: System.Array, $value: any, $startIndex: number) : number
            public static IndexOf ($array: System.Array, $value: any, $startIndex: number, $count: number) : number
            public static LastIndexOf ($array: System.Array, $value: any) : number
            public static LastIndexOf ($array: System.Array, $value: any, $startIndex: number) : number
            public static LastIndexOf ($array: System.Array, $value: any, $startIndex: number, $count: number) : number
            public static Reverse ($array: System.Array) : void
            public static Reverse ($array: System.Array, $index: number, $length: number) : void
            public SetValue ($value: any, $index: bigint) : void
            public SetValue ($value: any, $index1: bigint, $index2: bigint) : void
            public SetValue ($value: any, $index1: bigint, $index2: bigint, $index3: bigint) : void
            public SetValue ($value: any, ...indices: bigint[]) : void
            public static Sort ($array: System.Array) : void
            public static Sort ($array: System.Array, $index: number, $length: number) : void
            public static Sort ($array: System.Array, $comparer: System.Collections.IComparer) : void
            public static Sort ($array: System.Array, $index: number, $length: number, $comparer: System.Collections.IComparer) : void
            public static Sort ($keys: System.Array, $items: System.Array) : void
            public static Sort ($keys: System.Array, $items: System.Array, $comparer: System.Collections.IComparer) : void
            public static Sort ($keys: System.Array, $items: System.Array, $index: number, $length: number) : void
            public static Sort ($keys: System.Array, $items: System.Array, $index: number, $length: number, $comparer: System.Collections.IComparer) : void
            public GetEnumerator () : System.Collections.IEnumerator
            public GetLength ($dimension: number) : number
            public GetLowerBound ($dimension: number) : number
            public GetValue (...indices: number[]) : any
            public SetValue ($value: any, ...indices: number[]) : void
            public GetUpperBound ($dimension: number) : number
            public GetValue ($index: number) : any
            public GetValue ($index1: number, $index2: number) : any
            public GetValue ($index1: number, $index2: number, $index3: number) : any
            public SetValue ($value: any, $index: number) : void
            public SetValue ($value: any, $index1: number, $index2: number) : void
            public SetValue ($value: any, $index1: number, $index2: number, $index3: number) : void
            public static CreateInstance ($elementType: System.Type, $length: number) : System.Array
            public static CreateInstance ($elementType: System.Type, $length1: number, $length2: number) : System.Array
            public static CreateInstance ($elementType: System.Type, $length1: number, $length2: number, $length3: number) : System.Array
            public static CreateInstance ($elementType: System.Type, ...lengths: number[]) : System.Array
            public static CreateInstance ($elementType: System.Type, $lengths: System.Array$1<number>, $lowerBounds: System.Array$1<number>) : System.Array
            public static Clear ($array: System.Array, $index: number, $length: number) : void
            public static Copy ($sourceArray: System.Array, $destinationArray: System.Array, $length: number) : void
            public static Copy ($sourceArray: System.Array, $sourceIndex: number, $destinationArray: System.Array, $destinationIndex: number, $length: number) : void
            public static ConstrainedCopy ($sourceArray: System.Array, $sourceIndex: number, $destinationArray: System.Array, $destinationIndex: number, $length: number) : void
            public Initialize () : void
        }
        class Type extends System.Reflection.MemberInfo implements System.Reflection.ICustomAttributeProvider, System.Reflection.IReflect, System.Runtime.InteropServices._MemberInfo, System.Runtime.InteropServices._Type
        {
            protected [__keep_incompatibility]: never;
            public static Delimiter : number
            public static EmptyTypes : System.Array$1<System.Type>
            public static Missing : any
            public static FilterAttribute : System.Reflection.MemberFilter
            public static FilterName : System.Reflection.MemberFilter
            public static FilterNameIgnoreCase : System.Reflection.MemberFilter
            public get IsSerializable(): boolean;
            public get ContainsGenericParameters(): boolean;
            public get IsVisible(): boolean;
            public get MemberType(): System.Reflection.MemberTypes;
            public get Namespace(): string;
            public get AssemblyQualifiedName(): string;
            public get FullName(): string;
            public get Assembly(): System.Reflection.Assembly;
            public get Module(): System.Reflection.Module;
            public get IsNested(): boolean;
            public get DeclaringType(): System.Type;
            public get DeclaringMethod(): System.Reflection.MethodBase;
            public get ReflectedType(): System.Type;
            public get UnderlyingSystemType(): System.Type;
            public get IsTypeDefinition(): boolean;
            public get IsArray(): boolean;
            public get IsByRef(): boolean;
            public get IsPointer(): boolean;
            public get IsConstructedGenericType(): boolean;
            public get IsGenericParameter(): boolean;
            public get IsGenericTypeParameter(): boolean;
            public get IsGenericMethodParameter(): boolean;
            public get IsGenericType(): boolean;
            public get IsGenericTypeDefinition(): boolean;
            public get IsVariableBoundArray(): boolean;
            public get IsByRefLike(): boolean;
            public get HasElementType(): boolean;
            public get GenericTypeArguments(): System.Array$1<System.Type>;
            public get GenericParameterPosition(): number;
            public get GenericParameterAttributes(): System.Reflection.GenericParameterAttributes;
            public get Attributes(): System.Reflection.TypeAttributes;
            public get IsAbstract(): boolean;
            public get IsImport(): boolean;
            public get IsSealed(): boolean;
            public get IsSpecialName(): boolean;
            public get IsClass(): boolean;
            public get IsNestedAssembly(): boolean;
            public get IsNestedFamANDAssem(): boolean;
            public get IsNestedFamily(): boolean;
            public get IsNestedFamORAssem(): boolean;
            public get IsNestedPrivate(): boolean;
            public get IsNestedPublic(): boolean;
            public get IsNotPublic(): boolean;
            public get IsPublic(): boolean;
            public get IsAutoLayout(): boolean;
            public get IsExplicitLayout(): boolean;
            public get IsLayoutSequential(): boolean;
            public get IsAnsiClass(): boolean;
            public get IsAutoClass(): boolean;
            public get IsUnicodeClass(): boolean;
            public get IsCOMObject(): boolean;
            public get IsContextful(): boolean;
            public get IsCollectible(): boolean;
            public get IsEnum(): boolean;
            public get IsMarshalByRef(): boolean;
            public get IsPrimitive(): boolean;
            public get IsValueType(): boolean;
            public get IsSignatureType(): boolean;
            public get IsSecurityCritical(): boolean;
            public get IsSecuritySafeCritical(): boolean;
            public get IsSecurityTransparent(): boolean;
            public get StructLayoutAttribute(): System.Runtime.InteropServices.StructLayoutAttribute;
            public get TypeInitializer(): System.Reflection.ConstructorInfo;
            public get TypeHandle(): System.RuntimeTypeHandle;
            public get GUID(): System.Guid;
            public get BaseType(): System.Type;
            public static get DefaultBinder(): System.Reflection.Binder;
            public get IsInterface(): boolean;
            public IsEnumDefined ($value: any) : boolean
            public GetEnumName ($value: any) : string
            public GetEnumNames () : System.Array$1<string>
            public FindInterfaces ($filter: System.Reflection.TypeFilter, $filterCriteria: any) : System.Array$1<System.Type>
            public FindMembers ($memberType: System.Reflection.MemberTypes, $bindingAttr: System.Reflection.BindingFlags, $filter: System.Reflection.MemberFilter, $filterCriteria: any) : System.Array$1<System.Reflection.MemberInfo>
            public IsSubclassOf ($c: System.Type) : boolean
            public IsAssignableFrom ($c: System.Type) : boolean
            public GetType () : System.Type
            public GetElementType () : System.Type
            public GetArrayRank () : number
            public GetGenericTypeDefinition () : System.Type
            public GetGenericArguments () : System.Array$1<System.Type>
            public GetGenericParameterConstraints () : System.Array$1<System.Type>
            public GetConstructor ($types: System.Array$1<System.Type>) : System.Reflection.ConstructorInfo
            public GetConstructor ($bindingAttr: System.Reflection.BindingFlags, $binder: System.Reflection.Binder, $types: System.Array$1<System.Type>, $modifiers: System.Array$1<System.Reflection.ParameterModifier>) : System.Reflection.ConstructorInfo
            public GetConstructor ($bindingAttr: System.Reflection.BindingFlags, $binder: System.Reflection.Binder, $callConvention: System.Reflection.CallingConventions, $types: System.Array$1<System.Type>, $modifiers: System.Array$1<System.Reflection.ParameterModifier>) : System.Reflection.ConstructorInfo
            public GetConstructors () : System.Array$1<System.Reflection.ConstructorInfo>
            public GetConstructors ($bindingAttr: System.Reflection.BindingFlags) : System.Array$1<System.Reflection.ConstructorInfo>
            public GetEvent ($name: string) : System.Reflection.EventInfo
            public GetEvent ($name: string, $bindingAttr: System.Reflection.BindingFlags) : System.Reflection.EventInfo
            public GetEvents () : System.Array$1<System.Reflection.EventInfo>
            public GetEvents ($bindingAttr: System.Reflection.BindingFlags) : System.Array$1<System.Reflection.EventInfo>
            public GetField ($name: string) : System.Reflection.FieldInfo
            public GetField ($name: string, $bindingAttr: System.Reflection.BindingFlags) : System.Reflection.FieldInfo
            public GetFields () : System.Array$1<System.Reflection.FieldInfo>
            public GetFields ($bindingAttr: System.Reflection.BindingFlags) : System.Array$1<System.Reflection.FieldInfo>
            public GetMember ($name: string) : System.Array$1<System.Reflection.MemberInfo>
            public GetMember ($name: string, $bindingAttr: System.Reflection.BindingFlags) : System.Array$1<System.Reflection.MemberInfo>
            public GetMember ($name: string, $type: System.Reflection.MemberTypes, $bindingAttr: System.Reflection.BindingFlags) : System.Array$1<System.Reflection.MemberInfo>
            public GetMembers () : System.Array$1<System.Reflection.MemberInfo>
            public GetMembers ($bindingAttr: System.Reflection.BindingFlags) : System.Array$1<System.Reflection.MemberInfo>
            public GetMethod ($name: string) : System.Reflection.MethodInfo
            public GetMethod ($name: string, $bindingAttr: System.Reflection.BindingFlags) : System.Reflection.MethodInfo
            public GetMethod ($name: string, $types: System.Array$1<System.Type>) : System.Reflection.MethodInfo
            public GetMethod ($name: string, $types: System.Array$1<System.Type>, $modifiers: System.Array$1<System.Reflection.ParameterModifier>) : System.Reflection.MethodInfo
            public GetMethod ($name: string, $bindingAttr: System.Reflection.BindingFlags, $binder: System.Reflection.Binder, $types: System.Array$1<System.Type>, $modifiers: System.Array$1<System.Reflection.ParameterModifier>) : System.Reflection.MethodInfo
            public GetMethod ($name: string, $bindingAttr: System.Reflection.BindingFlags, $binder: System.Reflection.Binder, $callConvention: System.Reflection.CallingConventions, $types: System.Array$1<System.Type>, $modifiers: System.Array$1<System.Reflection.ParameterModifier>) : System.Reflection.MethodInfo
            public GetMethod ($name: string, $genericParameterCount: number, $types: System.Array$1<System.Type>) : System.Reflection.MethodInfo
            public GetMethod ($name: string, $genericParameterCount: number, $types: System.Array$1<System.Type>, $modifiers: System.Array$1<System.Reflection.ParameterModifier>) : System.Reflection.MethodInfo
            public GetMethod ($name: string, $genericParameterCount: number, $bindingAttr: System.Reflection.BindingFlags, $binder: System.Reflection.Binder, $types: System.Array$1<System.Type>, $modifiers: System.Array$1<System.Reflection.ParameterModifier>) : System.Reflection.MethodInfo
            public GetMethod ($name: string, $genericParameterCount: number, $bindingAttr: System.Reflection.BindingFlags, $binder: System.Reflection.Binder, $callConvention: System.Reflection.CallingConventions, $types: System.Array$1<System.Type>, $modifiers: System.Array$1<System.Reflection.ParameterModifier>) : System.Reflection.MethodInfo
            public GetMethods () : System.Array$1<System.Reflection.MethodInfo>
            public GetMethods ($bindingAttr: System.Reflection.BindingFlags) : System.Array$1<System.Reflection.MethodInfo>
            public GetNestedType ($name: string) : System.Type
            public GetNestedType ($name: string, $bindingAttr: System.Reflection.BindingFlags) : System.Type
            public GetNestedTypes () : System.Array$1<System.Type>
            public GetNestedTypes ($bindingAttr: System.Reflection.BindingFlags) : System.Array$1<System.Type>
            public GetProperty ($name: string) : System.Reflection.PropertyInfo
            public GetProperty ($name: string, $bindingAttr: System.Reflection.BindingFlags) : System.Reflection.PropertyInfo
            public GetProperty ($name: string, $returnType: System.Type) : System.Reflection.PropertyInfo
            public GetProperty ($name: string, $types: System.Array$1<System.Type>) : System.Reflection.PropertyInfo
            public GetProperty ($name: string, $returnType: System.Type, $types: System.Array$1<System.Type>) : System.Reflection.PropertyInfo
            public GetProperty ($name: string, $returnType: System.Type, $types: System.Array$1<System.Type>, $modifiers: System.Array$1<System.Reflection.ParameterModifier>) : System.Reflection.PropertyInfo
            public GetProperty ($name: string, $bindingAttr: System.Reflection.BindingFlags, $binder: System.Reflection.Binder, $returnType: System.Type, $types: System.Array$1<System.Type>, $modifiers: System.Array$1<System.Reflection.ParameterModifier>) : System.Reflection.PropertyInfo
            public GetProperties () : System.Array$1<System.Reflection.PropertyInfo>
            public GetProperties ($bindingAttr: System.Reflection.BindingFlags) : System.Array$1<System.Reflection.PropertyInfo>
            public GetDefaultMembers () : System.Array$1<System.Reflection.MemberInfo>
            public static GetTypeHandle ($o: any) : System.RuntimeTypeHandle
            public static GetTypeArray ($args: System.Array$1<any>) : System.Array$1<System.Type>
            public static GetTypeCode ($type: System.Type) : System.TypeCode
            public static GetTypeFromCLSID ($clsid: System.Guid) : System.Type
            public static GetTypeFromCLSID ($clsid: System.Guid, $throwOnError: boolean) : System.Type
            public static GetTypeFromCLSID ($clsid: System.Guid, $server: string) : System.Type
            public static GetTypeFromProgID ($progID: string) : System.Type
            public static GetTypeFromProgID ($progID: string, $throwOnError: boolean) : System.Type
            public static GetTypeFromProgID ($progID: string, $server: string) : System.Type
            public InvokeMember ($name: string, $invokeAttr: System.Reflection.BindingFlags, $binder: System.Reflection.Binder, $target: any, $args: System.Array$1<any>) : any
            public InvokeMember ($name: string, $invokeAttr: System.Reflection.BindingFlags, $binder: System.Reflection.Binder, $target: any, $args: System.Array$1<any>, $culture: System.Globalization.CultureInfo) : any
            public InvokeMember ($name: string, $invokeAttr: System.Reflection.BindingFlags, $binder: System.Reflection.Binder, $target: any, $args: System.Array$1<any>, $modifiers: System.Array$1<System.Reflection.ParameterModifier>, $culture: System.Globalization.CultureInfo, $namedParameters: System.Array$1<string>) : any
            public GetInterface ($name: string) : System.Type
            public GetInterface ($name: string, $ignoreCase: boolean) : System.Type
            public GetInterfaces () : System.Array$1<System.Type>
            public GetInterfaceMap ($interfaceType: System.Type) : System.Reflection.InterfaceMapping
            public IsInstanceOfType ($o: any) : boolean
            public IsEquivalentTo ($other: System.Type) : boolean
            public GetEnumUnderlyingType () : System.Type
            public GetEnumValues () : System.Array
            public MakeArrayType () : System.Type
            public MakeArrayType ($rank: number) : System.Type
            public MakeByRefType () : System.Type
            public MakeGenericType (...typeArguments: System.Type[]) : System.Type
            public MakePointerType () : System.Type
            public static MakeGenericSignatureType ($genericTypeDefinition: System.Type, ...typeArguments: System.Type[]) : System.Type
            public static MakeGenericMethodParameter ($position: number) : System.Type
            public Equals ($o: any) : boolean
            public Equals ($o: System.Type) : boolean
            public static GetTypeFromHandle ($handle: System.RuntimeTypeHandle) : System.Type
            public static GetType ($typeName: string, $throwOnError: boolean, $ignoreCase: boolean) : System.Type
            public static GetType ($typeName: string, $throwOnError: boolean) : System.Type
            public static GetType ($typeName: string) : System.Type
            public static GetType ($typeName: string, $assemblyResolver: System.Func$2<System.Reflection.AssemblyName, System.Reflection.Assembly>, $typeResolver: System.Func$4<System.Reflection.Assembly, string, boolean, System.Type>) : System.Type
            public static GetType ($typeName: string, $assemblyResolver: System.Func$2<System.Reflection.AssemblyName, System.Reflection.Assembly>, $typeResolver: System.Func$4<System.Reflection.Assembly, string, boolean, System.Type>, $throwOnError: boolean) : System.Type
            public static GetType ($typeName: string, $assemblyResolver: System.Func$2<System.Reflection.AssemblyName, System.Reflection.Assembly>, $typeResolver: System.Func$4<System.Reflection.Assembly, string, boolean, System.Type>, $throwOnError: boolean, $ignoreCase: boolean) : System.Type
            public static op_Equality ($left: System.Type, $right: System.Type) : boolean
            public static op_Inequality ($left: System.Type, $right: System.Type) : boolean
            public static ReflectionOnlyGetType ($typeName: string, $throwIfNotFound: boolean, $ignoreCase: boolean) : System.Type
            public static GetTypeFromCLSID ($clsid: System.Guid, $server: string, $throwOnError: boolean) : System.Type
            public static GetTypeFromProgID ($progID: string, $server: string, $throwOnError: boolean) : System.Type
        }
        class Int64 extends System.ValueType implements System.IEquatable$1<bigint>, System.IFormattable, System.ISpanFormattable, System.IComparable, System.IComparable$1<bigint>, System.IConvertible
        {
            protected [__keep_incompatibility]: never;
        }
        class Delegate extends System.Object implements System.ICloneable, System.Runtime.Serialization.ISerializable
        {
            protected [__keep_incompatibility]: never;
        }
        interface MulticastDelegate
        { 
        (...args:any[]) : any; 
        Invoke?: (...args:any[]) => any;
        }
        var MulticastDelegate: { new (func: (...args:any[]) => any): MulticastDelegate; }
        interface Converter$2<TInput, TOutput>
        { 
        (input: TInput) : TOutput; 
        Invoke?: (input: TInput) => TOutput;
        }
        interface Action$1<T>
        { 
        (obj: T) : void; 
        Invoke?: (obj: T) => void;
        }
        interface Comparison$1<T>
        { 
        (x: T, y: T) : number; 
        Invoke?: (x: T, y: T) => number;
        }
        interface Predicate$1<T>
        { 
        (obj: T) : boolean; 
        Invoke?: (obj: T) => boolean;
        }
        class Enum extends System.ValueType implements System.IFormattable, System.IComparable, System.IConvertible
        {
            protected [__keep_incompatibility]: never;
        }
        interface IDisposable
        {
        }
        class ReadOnlySpan$1<T> extends System.ValueType
        {
            protected [__keep_incompatibility]: never;
        }
        class UInt64 extends System.ValueType implements System.IEquatable$1<bigint>, System.IFormattable, System.ISpanFormattable, System.IComparable, System.IComparable$1<bigint>, System.IConvertible
        {
            protected [__keep_incompatibility]: never;
        }
        class UInt32 extends System.ValueType implements System.IEquatable$1<number>, System.IFormattable, System.ISpanFormattable, System.IComparable, System.IComparable$1<number>, System.IConvertible
        {
            protected [__keep_incompatibility]: never;
        }
        interface Func$3<T1, T2, TResult>
        { 
        (arg1: T1, arg2: T2) : TResult; 
        Invoke?: (arg1: T1, arg2: T2) => TResult;
        }
        class Attribute extends System.Object implements System.Runtime.InteropServices._Attribute
        {
            protected [__keep_incompatibility]: never;
        }
        class RuntimeTypeHandle extends System.ValueType implements System.Runtime.Serialization.ISerializable
        {
            protected [__keep_incompatibility]: never;
        }
        enum TypeCode
        { Empty = 0, Object = 1, DBNull = 2, Boolean = 3, Char = 4, SByte = 5, Byte = 6, Int16 = 7, UInt16 = 8, Int32 = 9, UInt32 = 10, Int64 = 11, UInt64 = 12, Single = 13, Double = 14, Decimal = 15, DateTime = 16, String = 18 }
        class Guid extends System.ValueType implements System.IEquatable$1<System.Guid>, System.IFormattable, System.ISpanFormattable, System.IComparable, System.IComparable$1<System.Guid>
        {
            protected [__keep_incompatibility]: never;
        }
        interface IFormatProvider
        {
        }
        interface Func$2<T, TResult>
        { 
        (arg: T) : TResult; 
        Invoke?: (arg: T) => TResult;
        }
        interface Func$4<T1, T2, T3, TResult>
        { 
        (arg1: T1, arg2: T2, arg3: T3) : TResult; 
        Invoke?: (arg1: T1, arg2: T2, arg3: T3) => TResult;
        }
    }
    namespace PortfolioIdleRpg.Facades {
        class AudioFacade extends System.Object
        {
            protected [__keep_incompatibility]: never;
            public static PlayBgm ($assetId: number, $volume: number) : void
            public static SetBgmVolume ($volume: number) : void
            public static StopBgm () : void
            public static PlaySfx ($assetId: number, $volume: number) : void
        }
        class BundleFacade extends System.Object
        {
            protected [__keep_incompatibility]: never;
            public static Downloading : number
            public static Downloaded : number
            public static Failed : number
            public static CurrentManifest () : string
            public static BeginStaging () : void
            public static Download ($url: string, $path: string) : number
            public static Poll ($id: number) : number
            public static Reuse ($path: string) : void
            public static ReadText ($path: string) : string
            public static Size ($path: string) : number
            public static Sha256 ($path: string) : string
            public static UseSource ($source: string) : void
            public static DownloadAssets ($staged: boolean) : void
            public static PollAssets () : number
            public static AssetBytesReceived () : number
            public static AssetBytesTotal () : number
            public static Commit () : void
            public static Discard () : void
        }
        class DisplayFacade extends System.Object
        {
            protected [__keep_incompatibility]: never;
            public static get Language(): string;
            public static SetFrameRate ($frameRate: number) : void
        }
        class FileFacade extends System.Object
        {
            protected [__keep_incompatibility]: never;
            public static Read ($relativePath: string) : ArrayBuffer
        }
        class ResourceFacade extends System.Object
        {
            protected [__keep_incompatibility]: never;
            public static Loading : number
            public static Loaded : number
            public static Missing : number
            public static Load ($key: string) : number
            public static Poll ($id: number) : number
            public static Release ($id: number) : void
            public static UnloadUnused () : void
        }
        class RuntimeFacade extends System.Object
        {
            protected [__keep_incompatibility]: never;
            public static Restart () : void
            public static StartGame () : void
            public static OpenUrl ($url: string) : void
            public static Config () : string
        }
        class SocketEvent extends System.Object
        {
            protected [__keep_incompatibility]: never;
            public Kind : number
            public Data : ArrayBuffer
            public Code : number
            public Reason : string
            public constructor ($kind: number)
        }
        class StorageFacade extends System.Object
        {
            protected [__keep_incompatibility]: never;
            public static Get ($key: string) : string
            public static Set ($key: string, $value: string) : void
            public static Delete ($key: string) : void
        }
        class UiFacade extends System.Object
        {
            protected [__keep_incompatibility]: never;
            public static Screen : number
            public static Popup : number
            public static Guide : number
            public static Overlay : number
            public static Debug : number
            public static Create ($assetId: number, $layer: number) : PortfolioIdleRpg.Views.ViewRefs
            public static Destroy ($view: PortfolioIdleRpg.Views.ViewRefs) : void
            public static Close ($view: PortfolioIdleRpg.Views.ViewRefs) : PortfolioIdleRpg.Views.PopupMotion
            public static SetBlocking ($blocking: boolean) : void
            public static BackPressed () : boolean
        }
        class WebSocketFacade extends System.Object
        {
            protected [__keep_incompatibility]: never;
            public static Opened : number
            public static Message : number
            public static Closed : number
            public static Open ($url: string) : number
            public static Send ($id: number, $data: ArrayBuffer) : void
            public static Close ($id: number, $code: number, $reason: string) : void
            public static Poll ($id: number) : PortfolioIdleRpg.Facades.SocketEvent
        }
        class WorldFacade extends System.Object
        {
            protected [__keep_incompatibility]: never;
            public static Create ($assetId: number) : PortfolioIdleRpg.Views.ViewRefs
            public static SetActive ($view: PortfolioIdleRpg.Views.ViewRefs, $active: boolean) : void
            public static Destroy ($view: PortfolioIdleRpg.Views.ViewRefs) : void
            public static Shake ($strength: number, $seconds: number) : void
            public static HitStop ($seconds: number) : void
        }
    }
    namespace System.Collections.Generic {
        interface IEnumerable$1<T> extends System.Collections.IEnumerable
        {
        }
        interface IList$1<T> extends System.Collections.Generic.IEnumerable$1<T>, System.Collections.IEnumerable, System.Collections.Generic.ICollection$1<T>
        {
        }
        interface ICollection$1<T> extends System.Collections.Generic.IEnumerable$1<T>, System.Collections.IEnumerable
        {
        }
        interface IReadOnlyCollection$1<T> extends System.Collections.Generic.IEnumerable$1<T>, System.Collections.IEnumerable
        {
        }
        interface IReadOnlyList$1<T> extends System.Collections.Generic.IEnumerable$1<T>, System.Collections.IEnumerable, System.Collections.Generic.IReadOnlyCollection$1<T>
        {
        }
        interface IComparer$1<T>
        {
        }
        class List$1<T> extends System.Object implements System.Collections.Generic.IEnumerable$1<T>, System.Collections.IEnumerable, System.Collections.Generic.IList$1<T>, System.Collections.Generic.IReadOnlyCollection$1<T>, System.Collections.IList, System.Collections.Generic.ICollection$1<T>, System.Collections.Generic.IReadOnlyList$1<T>, System.Collections.ICollection
        {
            protected [__keep_incompatibility]: never;
            public [Symbol.iterator]() : IterableIterator<T>
        }
    }
    namespace System.Collections {
        interface IEnumerable
        {
        }
        interface IList extends System.Collections.IEnumerable, System.Collections.ICollection
        {
        }
        interface ICollection extends System.Collections.IEnumerable
        {
        }
        interface IStructuralComparable
        {
        }
        interface IStructuralEquatable
        {
        }
        interface IComparer
        {
        }
        interface IEnumerator
        {
        }
    }
    namespace Puerts {
        class ArrayBuffer extends System.Object
        {
            protected [__keep_incompatibility]: never;
        }
    }
    namespace UnityEngine {
        /** Base class for all objects Unity can reference.
        */
        class Object extends System.Object
        {
            protected [__keep_incompatibility]: never;
        }
        /** Base class for everything that can be attached to a GameObject.
        */
        class Component extends UnityEngine.Object
        {
            protected [__keep_incompatibility]: never;
            /** The Transform attached to this GameObject.
            */
            public get transform(): UnityEngine.Transform;
            /** The TransformHandle of this GameObject.
            */
            public get transformHandle(): UnityEngine.TransformHandle;
            /** The game object this component is attached to. A component is always attached to a game object.
            */
            public get gameObject(): UnityEngine.GameObject;
            /** The tag of this game object.
            */
            public get tag(): string;
            public set tag(value: string);
            /** The non-generic version of this method.
            * @param $type The type of Component to retrieve.
            * @returns A Component of the matching type, otherwise null if no Component is found. 
            */
            public GetComponent ($type: System.Type) : UnityEngine.Component
            /** The non-generic version of this method.
            * @param $type The type of component to search for.
            * @param $component The output argument that contains the component or null.
            * @returns Returns true if the component is found, false otherwise. 
            */
            public TryGetComponent ($type: System.Type, $component: $Ref<UnityEngine.Component>) : boolean
            /** The string-based version of this method.
            * @param $type The name of the type of Component to get.
            * @returns A Component of the matching type, otherwise null if no Component is found. 
            */
            public GetComponent ($type: string) : UnityEngine.Component
            /** This is the non-generic version of this method.
            * @param $t The type of component to search for.
            * @param $includeInactive Whether to include inactive child GameObjects in the search.
            * @returns A Component of the matching type, otherwise null if no Component is found. 
            */
            public GetComponentInChildren ($t: System.Type, $includeInactive: boolean) : UnityEngine.Component
            /** This is the non-generic version of this method.
            * @param $t The type of component to search for.
            * @param $includeInactive Whether to include inactive child GameObjects in the search.
            * @returns A Component of the matching type, otherwise null if no Component is found. 
            */
            public GetComponentInChildren ($t: System.Type) : UnityEngine.Component
            /** The non-generic version of this method.
            * @param $t The type of component to search for.
            * @param $includeInactive Whether to include inactive child GameObjects in the search.
            * @returns An array of all found components matching the specified type. 
            */
            public GetComponentsInChildren ($t: System.Type, $includeInactive: boolean) : System.Array$1<UnityEngine.Component>
            public GetComponentsInChildren ($t: System.Type) : System.Array$1<UnityEngine.Component>
            /** The non-generic version of this method.
            * @param $t The type of component to search for.
            * @param $includeInactive Whether to include inactive GameObjects in the search.
            * @returns A Component of the matching type, otherwise null if no Component is found. 
            */
            public GetComponentInParent ($t: System.Type, $includeInactive: boolean) : UnityEngine.Component
            /** The non-generic version of this method.
            * @param $t The type of component to search for.
            * @param $includeInactive Whether to include inactive GameObjects in the search.
            * @returns A Component of the matching type, otherwise null if no Component is found. 
            */
            public GetComponentInParent ($t: System.Type) : UnityEngine.Component
            /** The non-generic version of this method.
            * @param $t The type of component to search for.
            * @param $includeInactive Whether to include inactive GameObjects in the search.
            * @returns An array of all found components matching the specified type. 
            */
            public GetComponentsInParent ($t: System.Type, $includeInactive: boolean) : System.Array$1<UnityEngine.Component>
            public GetComponentsInParent ($t: System.Type) : System.Array$1<UnityEngine.Component>
            /** The non-generic version of this method.
            * @param $type The type of component to search for.
            * @returns An array containing all matching components of type type. 
            */
            public GetComponents ($type: System.Type) : System.Array$1<UnityEngine.Component>
            public GetComponents ($type: System.Type, $results: System.Collections.Generic.List$1<UnityEngine.Component>) : void
            /** Gets the index of the component on its parent GameObject.
            * @returns The component index. 
            */
            public GetComponentIndex () : number
            /** Checks the GameObject's tag against the defined tag.
            * @param $tag The tag to compare.
            * @returns Returns true if GameObject has same tag. Returns false otherwise. 
            */
            public CompareTag ($tag: string) : boolean
            /** Checks the GameObject's tag against the defined tag.
            * @param $tag A TagHandle representing the tag to compare.
            * @returns Returns true if GameObject has same tag. Returns false otherwise. 
            */
            public CompareTag ($tag: UnityEngine.TagHandle) : boolean
            /** Calls the method named methodName on every MonoBehaviour in this game object and on every ancestor of the behaviour.
            * @param $methodName Name of method to call.
            * @param $value Optional parameter value for the method.
            * @param $options Should an error be raised if the method does not exist on the target object?
            */
            public SendMessageUpwards ($methodName: string, $value: any, $options: UnityEngine.SendMessageOptions) : void
            /** Calls the method named methodName on every MonoBehaviour in this game object and on every ancestor of the behaviour.
            * @param $methodName Name of method to call.
            * @param $value Optional parameter value for the method.
            * @param $options Should an error be raised if the method does not exist on the target object?
            */
            public SendMessageUpwards ($methodName: string, $value: any) : void
            /** Calls the method named methodName on every MonoBehaviour in this game object and on every ancestor of the behaviour.
            * @param $methodName Name of method to call.
            * @param $value Optional parameter value for the method.
            * @param $options Should an error be raised if the method does not exist on the target object?
            */
            public SendMessageUpwards ($methodName: string) : void
            /** Calls the method named methodName on every MonoBehaviour in this game object and on every ancestor of the behaviour.
            * @param $methodName Name of method to call.
            * @param $value Optional parameter value for the method.
            * @param $options Should an error be raised if the method does not exist on the target object?
            */
            public SendMessageUpwards ($methodName: string, $options: UnityEngine.SendMessageOptions) : void
            /** Calls the method named methodName on every MonoBehaviour in this game object.
            * @param $methodName Name of the method to call.
            * @param $value Optional parameter for the method.
            * @param $options Should an error be raised if the target object doesn't implement the method for the message?
            */
            public SendMessage ($methodName: string, $value: any) : void
            /** Calls the method named methodName on every MonoBehaviour in this game object.
            * @param $methodName Name of the method to call.
            * @param $value Optional parameter for the method.
            * @param $options Should an error be raised if the target object doesn't implement the method for the message?
            */
            public SendMessage ($methodName: string) : void
            /** Calls the method named methodName on every MonoBehaviour in this game object.
            * @param $methodName Name of the method to call.
            * @param $value Optional parameter for the method.
            * @param $options Should an error be raised if the target object doesn't implement the method for the message?
            */
            public SendMessage ($methodName: string, $value: any, $options: UnityEngine.SendMessageOptions) : void
            /** Calls the method named methodName on every MonoBehaviour in this game object.
            * @param $methodName Name of the method to call.
            * @param $value Optional parameter for the method.
            * @param $options Should an error be raised if the target object doesn't implement the method for the message?
            */
            public SendMessage ($methodName: string, $options: UnityEngine.SendMessageOptions) : void
            /** Calls the method named methodName on every MonoBehaviour in this game object or any of its children.
            * @param $methodName Name of the method to call.
            * @param $parameter Optional parameter to pass to the method (can be any value).
            * @param $options Should an error be raised if the method does not exist for a given target object?
            */
            public BroadcastMessage ($methodName: string, $parameter: any, $options: UnityEngine.SendMessageOptions) : void
            /** Calls the method named methodName on every MonoBehaviour in this game object or any of its children.
            * @param $methodName Name of the method to call.
            * @param $parameter Optional parameter to pass to the method (can be any value).
            * @param $options Should an error be raised if the method does not exist for a given target object?
            */
            public BroadcastMessage ($methodName: string, $parameter: any) : void
            /** Calls the method named methodName on every MonoBehaviour in this game object or any of its children.
            * @param $methodName Name of the method to call.
            * @param $parameter Optional parameter to pass to the method (can be any value).
            * @param $options Should an error be raised if the method does not exist for a given target object?
            */
            public BroadcastMessage ($methodName: string) : void
            /** Calls the method named methodName on every MonoBehaviour in this game object or any of its children.
            * @param $methodName Name of the method to call.
            * @param $parameter Optional parameter to pass to the method (can be any value).
            * @param $options Should an error be raised if the method does not exist for a given target object?
            */
            public BroadcastMessage ($methodName: string, $options: UnityEngine.SendMessageOptions) : void
            public constructor ()
        }
        /** Behaviours are Components that can be enabled or disabled.
        */
        class Behaviour extends UnityEngine.Component
        {
            protected [__keep_incompatibility]: never;
        }
        /** MonoBehaviour is a base class that many Unity scripts derive from.
        */
        class MonoBehaviour extends UnityEngine.Behaviour
        {
            protected [__keep_incompatibility]: never;
        }
        interface ISerializationCallbackReceiver
        {
        }
        /** A class you can derive from if you want to create objects that live independently of GameObjects.
        */
        class ScriptableObject extends UnityEngine.Object
        {
            protected [__keep_incompatibility]: never;
        }
        /** Represents a Sprite object for use in 2D gameplay.
        */
        class Sprite extends UnityEngine.Object
        {
            protected [__keep_incompatibility]: never;
        }
        /** Base class for all objects that can exist in a scene. Add components to a GameObject to control its appearance and behavior.
        */
        class GameObject extends UnityEngine.Object
        {
            protected [__keep_incompatibility]: never;
            /** The Transform attached to the GameObject (Read Only).
            */
            public get transform(): UnityEngine.Transform;
            /** The TransformHandle of the GameObject (Read Only).
            */
            public get transformHandle(): UnityEngine.TransformHandle;
            /** Integer identifying the layer the GameObject is assigned to.
            */
            public get layer(): number;
            public set layer(value: number);
            /** The local active state of the GameObject. True if active, false if inactive. (Read Only)
            */
            public get activeSelf(): boolean;
            /** The active state of the GameObject in the Scene hierarchy. True if active, false if inactive. (Read Only)
            */
            public get activeInHierarchy(): boolean;
            /** Whether there are any Static Editor Flags set for the GameObject.
            */
            public get isStatic(): boolean;
            public set isStatic(value: boolean);
            /** The tag assigned to the GameObject.
            */
            public get tag(): string;
            public set tag(value: string);
            /** The Scene that contains the GameObject.
            */
            public get scene(): UnityEngine.SceneManagement.Scene;
            /** The Scene culling mask defined for the GameObject. (Read Only)
            */
            public get sceneCullingMask(): bigint;
            public get gameObject(): UnityEngine.GameObject;
            /** Creates a GameObject of the specified PrimtiveType with a mesh renderer and appropriate collider.
            * @param $type The type of primitive object to create, specified as a member of the PrimitiveType enum.
            */
            public static CreatePrimitive ($type: UnityEngine.PrimitiveType) : UnityEngine.GameObject
            /** Retrieves a reference to a component of specified type, by providing the component type as a method parameter.
            * @param $type The type of component to search for, specified as a Type object.
            * @returns A reference to a component of the specified type, returned as a Component type. If no component is found, returns null. 
            */
            public GetComponent ($type: System.Type) : UnityEngine.Component
            /** Retrieves a reference to a component of the specified type, by providing the name of the component type as a method parameter.
            * @param $type The name of the type of component to search for, specified as a string.
            * @returns A reference to a component of the specified type, returned as a Component type. If no component is found, returns null. 
            */
            public GetComponent ($type: string) : UnityEngine.Component
            /** This is the non-generic version of this method.
            * @param $type The type of Component to retrieve.
            * @param $includeInactive Whether to include inactive child GameObjects in the search.
            * @returns A component of the matching type, if found. 
            */
            public GetComponentInChildren ($type: System.Type, $includeInactive: boolean) : UnityEngine.Component
            /** This is the non-generic version of this method.
            * @param $type The type of Component to retrieve.
            * @param $includeInactive Whether to include inactive child GameObjects in the search.
            * @returns A component of the matching type, if found. 
            */
            public GetComponentInChildren ($type: System.Type) : UnityEngine.Component
            /** The non-generic version of this method.
            * @param $type The type of component to search for.
            * @param $includeInactive Whether to include inactive parent GameObjects in the search.
            * @returns A Component of the matching type, otherwise null if no matching Component is found. 
            */
            public GetComponentInParent ($type: System.Type, $includeInactive: boolean) : UnityEngine.Component
            /** The non-generic version of this method.
            * @param $type The type of component to search for.
            * @param $includeInactive Whether to include inactive parent GameObjects in the search.
            * @returns A Component of the matching type, otherwise null if no matching Component is found. 
            */
            public GetComponentInParent ($type: System.Type) : UnityEngine.Component
            /** The non-generic version of this method.
            * @param $type The type of component to search for.
            * @returns An array containing all matching components of type type. 
            */
            public GetComponents ($type: System.Type) : System.Array$1<UnityEngine.Component>
            public GetComponents ($type: System.Type, $results: System.Collections.Generic.List$1<UnityEngine.Component>) : void
            /** The non-generic version of this method.
            * @param $type The type of component to search for.
            * @param $includeInactive Whether to include inactive child GameObjects in the search.
            * @returns An array of all found components matching the specified type. 
            */
            public GetComponentsInChildren ($type: System.Type) : System.Array$1<UnityEngine.Component>
            /** The non-generic version of this method.
            * @param $type The type of component to search for.
            * @param $includeInactive Whether to include inactive child GameObjects in the search.
            * @returns An array of all found components matching the specified type. 
            */
            public GetComponentsInChildren ($type: System.Type, $includeInactive: boolean) : System.Array$1<UnityEngine.Component>
            public GetComponentsInParent ($type: System.Type) : System.Array$1<UnityEngine.Component>
            /** The non-generic version of this method.
            * @param $type The type of component to search for.
            * @param $includeInactive Whether to include inactive parent GameObjects in the search.
            * @returns An array of all found components matching the specified type. 
            */
            public GetComponentsInParent ($type: System.Type, $includeInactive: boolean) : System.Array$1<UnityEngine.Component>
            /** The non-generic version of this method.
            * @param $type The type of component to search for.
            * @param $component The out parameter that will contain the component or null.
            * @returns Returns true if the component is found, false otherwise. 
            */
            public TryGetComponent ($type: System.Type, $component: $Ref<UnityEngine.Component>) : boolean
            /** Retrieves the first active GameObject tagged with the specified tag. Returns null if no GameObject has the tag.
            * @param $tag The tag to search for.
            */
            public static FindWithTag ($tag: string) : UnityEngine.GameObject
            public static FindGameObjectsWithTag ($tag: string, $results: System.Collections.Generic.List$1<UnityEngine.GameObject>) : void
            public SendMessageUpwards ($methodName: string, $options: UnityEngine.SendMessageOptions) : void
            public SendMessage ($methodName: string, $options: UnityEngine.SendMessageOptions) : void
            public BroadcastMessage ($methodName: string, $options: UnityEngine.SendMessageOptions) : void
            /** Adds a component of the specified type to the GameObject.
            */
            public AddComponent ($componentType: System.Type) : UnityEngine.Component
            /** Retrieves the total number of components currently attached to the GameObject.
            * @returns The number of components on the GameObject as an Integer value. 
            */
            public GetComponentCount () : number
            /** Retrieves a reference to a component of type T at a specific index on the specified GameObject.
            * @param $index The index position in the array of components at which to find the requested object.
            * @returns A reference to a component of type T at the specified index. If no component is found at the specified index, returns null. 
            */
            public GetComponentAtIndex ($index: number) : UnityEngine.Component
            /** Retrieves the index of the specified component in the array of components attached to the GameObject.
            * @param $component The component to search for.
            * @returns The index of the specified Component if it exists. Otherwise, returns -1. 
            */
            public GetComponentIndex ($component: UnityEngine.Component) : number
            /** Activates or deactivates the GameObject locally, according to the value of the supplied parameter.
            * @param $value The active state to set, where true sets the GameObject to active and false sets it to inactive.
            */
            public SetActive ($value: boolean) : void
            /** Checks if the specified tag is attached to the GameObject.
            * @param $tag The tag to check for on the GameObject.
            * @returns true if the GameObject has the given tag, false otherwise. 
            */
            public CompareTag ($tag: string) : boolean
            /** Checks if the specified tag is attached to the GameObject.
            * @param $tag A TagHandle representing the tag to check for on the GameObject.
            * @returns true if the GameObject has the given tag, false otherwise. 
            */
            public CompareTag ($tag: UnityEngine.TagHandle) : boolean
            public static FindGameObjectWithTag ($tag: string) : UnityEngine.GameObject
            /** Retrieves an array of all active GameObjects tagged with the specified tag. Returns an empty array if no GameObjects have the tag.
            * @param $tag The name of the tag to search for GameObjects by.
            */
            public static FindGameObjectsWithTag ($tag: string) : System.Array$1<UnityEngine.GameObject>
            /** Calls the specified method on every MonoBehaviour attached to the GameObject and on every ancestor of the behaviour.
            * @param $methodName The name of the MonoBehaviour method to call.
            * @param $value An optional parameter value to pass to the called method.
            * @param $options Whether an error should be raised if the method doesn't exist on the target object.
            */
            public SendMessageUpwards ($methodName: string, $value: any, $options: UnityEngine.SendMessageOptions) : void
            /** Calls the specified method on every MonoBehaviour attached to the GameObject and on every ancestor of the behaviour.
            * @param $methodName The name of the MonoBehaviour method to call.
            * @param $value An optional parameter value to pass to the called method.
            * @param $options Whether an error should be raised if the method doesn't exist on the target object.
            */
            public SendMessageUpwards ($methodName: string, $value: any) : void
            /** Calls the specified method on every MonoBehaviour attached to the GameObject and on every ancestor of the behaviour.
            * @param $methodName The name of the MonoBehaviour method to call.
            * @param $value An optional parameter value to pass to the called method.
            * @param $options Whether an error should be raised if the method doesn't exist on the target object.
            */
            public SendMessageUpwards ($methodName: string) : void
            /** Calls the specified method on every MonoBehaviour attached to the GameObject.
            * @param $methodName The name of the MonoBehaviour method to call.
            * @param $value An optional parameter value to pass to the called method.
            * @param $options Whether an error should be raised if the method doesn't exist on the target object.
            */
            public SendMessage ($methodName: string, $value: any, $options: UnityEngine.SendMessageOptions) : void
            /** Calls the specified method on every MonoBehaviour attached to the GameObject.
            * @param $methodName The name of the MonoBehaviour method to call.
            * @param $value An optional parameter value to pass to the called method.
            * @param $options Whether an error should be raised if the method doesn't exist on the target object.
            */
            public SendMessage ($methodName: string, $value: any) : void
            /** Calls the specified method on every MonoBehaviour attached to the GameObject.
            * @param $methodName The name of the MonoBehaviour method to call.
            * @param $value An optional parameter value to pass to the called method.
            * @param $options Whether an error should be raised if the method doesn't exist on the target object.
            */
            public SendMessage ($methodName: string) : void
            /** Calls the specified method on every MonoBehaviour attached to the GameObject or any of its children.
            * @param $methodName The name of the MonoBehaviour method to call.
            * @param $parameter An optional parameter value to pass to the called method.
            * @param $options Whether an error should be raised if the method doesn't exist on the target object.
            */
            public BroadcastMessage ($methodName: string, $parameter: any, $options: UnityEngine.SendMessageOptions) : void
            /** Calls the specified method on every MonoBehaviour attached to the GameObject or any of its children.
            * @param $methodName The name of the MonoBehaviour method to call.
            * @param $parameter An optional parameter value to pass to the called method.
            * @param $options Whether an error should be raised if the method doesn't exist on the target object.
            */
            public BroadcastMessage ($methodName: string, $parameter: any) : void
            /** Calls the specified method on every MonoBehaviour attached to the GameObject or any of its children.
            * @param $methodName The name of the MonoBehaviour method to call.
            * @param $parameter An optional parameter value to pass to the called method.
            * @param $options Whether an error should be raised if the method doesn't exist on the target object.
            */
            public BroadcastMessage ($methodName: string) : void
            /** Finds and returns a GameObject with the specified name or hierarchy path.
            * @param $name The name or hierarchy path of the GameObject to find.
            */
            public static Find ($name: string) : UnityEngine.GameObject
            public static SetGameObjectsActive ($entityIds: Unity.Collections.NativeArray$1<UnityEngine.EntityId>, $active: boolean) : void
            public static InstantiateGameObjects ($sourceEntityId: UnityEngine.EntityId, $count: number, $newEntityIds: Unity.Collections.NativeArray$1<UnityEngine.EntityId>, $newTransformEntityIds: Unity.Collections.NativeArray$1<UnityEngine.EntityId>, $destinationScene?: UnityEngine.SceneManagement.Scene) : void
            public static GetScene ($entityId: UnityEngine.EntityId) : UnityEngine.SceneManagement.Scene
            /** Checks if the GameObject and its descendants are currently in the process of being destroyed.
            * @returns Is this GameObject being destroyed. 
            */
            public IsDestroying () : boolean
            public constructor ($name: string)
            public constructor ()
            public constructor ($name: string, ...components: System.Type[])
        }
        /** The various primitives that can be created using the GameObject.CreatePrimitive function.
        */
        enum PrimitiveType
        { Sphere = 0, Capsule = 1, Cylinder = 2, Cube = 3, Plane = 4, Quad = 5 }
        /** Options for how to send a message.
        */
        enum SendMessageOptions
        { RequireReceiver = 0, DontRequireReceiver = 1 }
        /** Position, rotation and scale of an object.
        */
        class Transform extends UnityEngine.Component implements System.Collections.IEnumerable
        {
            protected [__keep_incompatibility]: never;
        }
        /** Position, rotation and scale of an object.
        */
        class TransformHandle extends System.ValueType implements System.IEquatable$1<UnityEngine.TransformHandle>, System.IComparable$1<UnityEngine.TransformHandle>
        {
            protected [__keep_incompatibility]: never;
        }
        /** A handle to one of the tag values that can be applied to a GameObject.
        */
        class TagHandle extends System.ValueType
        {
            protected [__keep_incompatibility]: never;
        }
        /** A unique identifier for a Unity object.
        */
        class EntityId extends System.ValueType implements System.IEquatable$1<UnityEngine.EntityId>, System.IFormattable, System.IComparable$1<UnityEngine.EntityId>
        {
            protected [__keep_incompatibility]: never;
        }
        interface ICanvasRaycastFilter
        {
        }
        /** Manages, controls, and evaluates the animation of a GameObject.
        */
        class Animator extends UnityEngine.Behaviour
        {
            protected [__keep_incompatibility]: never;
        }
        /** Representation of 3D vectors and points.
        */
        class Vector3 extends System.ValueType implements System.IEquatable$1<UnityEngine.Vector3>, System.IFormattable
        {
            protected [__keep_incompatibility]: never;
        }
        /** Class that can be used to generate text for rendering.
        */
        class TextGenerator extends System.Object implements System.IDisposable
        {
            protected [__keep_incompatibility]: never;
        }
        /** Base class for Texture handling.
        */
        class Texture extends UnityEngine.Object
        {
            protected [__keep_incompatibility]: never;
        }
        /** Script interface for.
        */
        class Font extends UnityEngine.Object
        {
            protected [__keep_incompatibility]: never;
        }
        /** Where the anchor of the text is placed.
        */
        enum TextAnchor
        { UpperLeft = 0, UpperCenter = 1, UpperRight = 2, MiddleLeft = 3, MiddleCenter = 4, MiddleRight = 5, LowerLeft = 6, LowerCenter = 7, LowerRight = 8 }
        /** Wrapping modes for text that reaches the horizontal boundary.
        */
        enum HorizontalWrapMode
        { Wrap = 0, Overflow = 1 }
        /** Wrapping modes for text that reaches the vertical boundary.
        */
        enum VerticalWrapMode
        { Truncate = 0, Overflow = 1 }
        /** Font Style applied to GUI Texts, Text Meshes or GUIStyles.
        */
        enum FontStyle
        { Normal = 0, Bold = 1, Italic = 2, BoldAndItalic = 3 }
        /** A struct that stores the settings for TextGeneration.
        */
        class TextGenerationSettings extends System.ValueType
        {
            protected [__keep_incompatibility]: never;
        }
        /** Representation of 2D vectors and points.
        */
        class Vector2 extends System.ValueType implements System.IEquatable$1<UnityEngine.Vector2>, System.IFormattable
        {
            protected [__keep_incompatibility]: never;
        }
        /** The material class.
        */
        class Material extends UnityEngine.Object
        {
            protected [__keep_incompatibility]: never;
        }
        /** A Camera is a device through which the player views the world.
        */
        class Camera extends UnityEngine.Behaviour
        {
            protected [__keep_incompatibility]: never;
        }
        /** Representation of RGBA colors.
        */
        class Color extends System.ValueType implements System.IEquatable$1<UnityEngine.Color>, System.IFormattable
        {
            protected [__keep_incompatibility]: never;
        }
        /** Interface for on-screen keyboards. Only native iPhone, Android, and Windows Store Apps are supported.
        */
        class TouchScreenKeyboard extends System.Object
        {
            protected [__keep_incompatibility]: never;
        }
        /** Enumeration of the different types of supported touchscreen keyboards.
        */
        enum TouchScreenKeyboardType
        { Default = 0, ASCIICapable = 1, NumbersAndPunctuation = 2, URL = 3, NumberPad = 4, PhonePad = 5, NamePhonePad = 6, EmailAddress = 7, NintendoNetworkAccount = 8, Social = 9, Search = 10, DecimalPad = 11, OneTimeCode = 12 }
        /** A UnityGUI event.
        */
        class Event extends System.Object
        {
            protected [__keep_incompatibility]: never;
        }
        /** Position, size, anchor and pivot information for a rectangle.
        */
        class RectTransform extends UnityEngine.Transform implements System.Collections.IEnumerable
        {
            protected [__keep_incompatibility]: never;
        }
        /** Representation of RGBA colors in 32 bit format.
        */
        class Color32 extends System.ValueType implements System.IEquatable$1<UnityEngine.Color32>, System.IFormattable
        {
            protected [__keep_incompatibility]: never;
        }
        /** Representation of four-dimensional vectors.
        */
        class Vector4 extends System.ValueType implements System.IEquatable$1<UnityEngine.Vector4>, System.IFormattable
        {
            protected [__keep_incompatibility]: never;
        }
        /** A class that allows you to create or modify meshes.
        */
        class Mesh extends UnityEngine.Object
        {
            protected [__keep_incompatibility]: never;
        }
        /** Represents an axis aligned bounding box.
        */
        class Bounds extends System.ValueType implements System.IEquatable$1<UnityEngine.Bounds>, System.IFormattable
        {
            protected [__keep_incompatibility]: never;
        }
        /** A component that will render to the screen after all normal rendering has completed when attached to a Canvas. Designed for GUI application.
        */
        class CanvasRenderer extends UnityEngine.Component
        {
            protected [__keep_incompatibility]: never;
        }
        /** A 2D Rectangle defined by X and Y position, width and height.
        */
        class Rect extends System.ValueType implements System.IEquatable$1<UnityEngine.Rect>, System.IFormattable
        {
            protected [__keep_incompatibility]: never;
        }
    }
    namespace PortfolioIdleRpg.Views {
        class ViewRefs extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
            public GetKind ($name: string) : number
            public GetObject ($name: string) : UnityEngine.Object
            public GetList ($name: string) : System.Array$1<UnityEngine.Object>
            public GetString ($name: string) : string
            public GetNumber ($name: string) : number
            public GetBool ($name: string) : boolean
            public constructor ()
        }
        class PopupMotion extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
            public get Finished(): UnityEngine.Events.UnityEvent;
            public Close () : boolean
            public constructor ()
        }
        class ActorView extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
            public Setup ($clips: string, $r: number, $g: number, $b: number, $size: number, $facing: number) : void
            public Place ($x: number, $y: number) : void
            public MoveTo ($x: number, $y: number, $seconds: number, $walking: boolean) : void
            public Attack ($clip: string, $impactSeconds: number) : void
            public Hit ($hpRatio: number) : void
            public SetHp ($hpRatio: number) : void
            public Die () : void
            public Leave () : void
            public Revive ($hpRatio: number) : void
            public constructor ()
        }
        class BattleFrame extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
            public constructor ()
        }
        class DockView extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
            public Show ($key: string) : void
            public constructor ()
        }
        class EffectIcons extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
            public SetCount ($count: number) : void
            public Show ($index: number, $icon: string, $r: number, $g: number, $b: number, $seconds: number, $total: number) : void
            public constructor ()
        }
        class Fade extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
            public get Finished(): UnityEngine.Events.UnityEvent;
            public FadeTo ($covered: boolean) : void
            public constructor ()
        }
        class FloatingText extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
            public Show ($text: string, $r: number, $g: number, $b: number, $size: number, $x: number, $y: number, $grounded: boolean) : void
            public constructor ()
        }
        class IconSet extends UnityEngine.ScriptableObject
        {
            protected [__keep_incompatibility]: never;
            public Find ($name: string) : UnityEngine.Sprite
            public constructor ()
        }
        class IconView extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
            public Show ($name: string) : void
            public constructor ()
        }
        class ItemList extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
            public get Shown(): UnityEngine.Events.UnityEvent;
            public get ShownItem(): PortfolioIdleRpg.Views.ViewRefs;
            public get ShownIndex(): number;
            public get ShownSlot(): number;
            public SetCount ($count: number) : void
        }
        class ProjectileView extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
            public Fly ($clip: string, $fromX: number, $fromY: number, $toX: number, $toY: number, $seconds: number, $r: number, $g: number, $b: number, $size: number) : void
            public Fizzle () : void
            public constructor ()
        }
        class ReleaseSlider extends UnityEngine.UI.Slider implements UnityEngine.EventSystems.IPointerUpHandler, UnityEngine.EventSystems.IMoveHandler, UnityEngine.EventSystems.IInitializePotentialDragHandler, UnityEngine.EventSystems.IDragHandler, UnityEngine.UI.ICanvasElement, UnityEngine.EventSystems.IEventSystemHandler, UnityEngine.EventSystems.IPointerEnterHandler, UnityEngine.EventSystems.ISelectHandler, UnityEngine.EventSystems.IPointerExitHandler, UnityEngine.EventSystems.IDeselectHandler, UnityEngine.EventSystems.IPointerDownHandler
        {
            protected [__keep_incompatibility]: never;
            public get Released(): UnityEngine.Events.UnityEvent;
            public constructor ()
        }
        class RepeatButton extends UnityEngine.MonoBehaviour implements UnityEngine.EventSystems.IPointerUpHandler, UnityEngine.EventSystems.IEventSystemHandler, UnityEngine.EventSystems.IPointerExitHandler, UnityEngine.EventSystems.IPointerDownHandler
        {
            protected [__keep_incompatibility]: never;
            public OnPointerDown ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public OnPointerUp ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public OnPointerExit ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public constructor ()
        }
        class RollingText extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
            public Set ($text: string) : void
            public Roll ($frames: string, $seconds: number) : void
            public constructor ()
        }
        class ScrollList extends PortfolioIdleRpg.Views.ItemList
        {
            protected [__keep_incompatibility]: never;
            public constructor ()
        }
        class Spinner extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
            public constructor ()
        }
        class Spotlight extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
            public Focus ($target: UnityEngine.Object) : void
            public Clear () : void
            public constructor ()
        }
        class SpriteAnimator extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
            public get Clip(): PortfolioIdleRpg.Views.SpriteClip;
            public get Finished(): boolean;
            public Play ($clip: PortfolioIdleRpg.Views.SpriteClip, $time?: number) : void
            public constructor ()
        }
        class SpriteClip extends System.Object
        {
            protected [__keep_incompatibility]: never;
            public Name : string
            public Frames : System.Array$1<UnityEngine.Sprite>
            public FramesPerSecond : number
            public Loop : boolean
            public ImpactFrame : number
            public get Duration(): number;
            public get Windup(): number;
            public FrameAt ($time: number) : number
            public constructor ()
        }
        class SpriteClipSet extends UnityEngine.ScriptableObject
        {
            protected [__keep_incompatibility]: never;
            public Find ($name: string) : PortfolioIdleRpg.Views.SpriteClip
            public constructor ()
        }
        class StageView extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
            public Show ($background: string) : void
            public Cover ($r: number, $g: number, $b: number) : void
            public Scroll ($distance: number, $seconds: number) : void
            public Burst ($x: number, $y: number, $r: number, $g: number, $b: number, $count: number, $size: number) : void
            public constructor ()
        }
        class TabBar extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
            public SetCount ($count: number) : void
            public SetLabel ($index: number, $label: string) : void
            public Select ($index: number) : void
            public GetClickEvent ($index: number) : UnityEngine.Events.UnityEvent
            public GetBadge ($index: number) : UnityEngine.GameObject
            public constructor ()
        }
        class TintView extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
            public Show ($index: number) : void
            public constructor ()
        }
        class Toast extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
            public Show ($text: string) : void
            public constructor ()
        }
        class ViewList extends PortfolioIdleRpg.Views.ItemList
        {
            protected [__keep_incompatibility]: never;
            public constructor ()
        }
    }
    namespace UnityEngine.Events {
        /** Abstract base class for UnityEvents.
        */
        class UnityEventBase extends System.Object implements UnityEngine.ISerializationCallbackReceiver
        {
            protected [__keep_incompatibility]: never;
            /** Get the number of registered persistent listeners.
            */
            public GetPersistentEventCount () : number
            /** Get the target component of the listener at index index.
            * @param $index Index of the listener to query.
            */
            public GetPersistentTarget ($index: number) : UnityEngine.Object
            /** Get the target method name of the listener at index index.
            * @param $index Index of the listener to query.
            */
            public GetPersistentMethodName ($index: number) : string
            /** Modify the execution state of a persistent listener.
            * @param $index Index of the listener to query.
            * @param $state State to set.
            */
            public SetPersistentListenerState ($index: number, $state: UnityEngine.Events.UnityEventCallState) : void
            /** Returns the execution state of a persistent listener.
            * @param $index Index of the listener to query.
            * @returns Execution state of the persistent listener. 
            */
            public GetPersistentListenerState ($index: number) : UnityEngine.Events.UnityEventCallState
            /** Remove all non-persistent (ie created from script) listeners  from the event.
            */
            public RemoveAllListeners () : void
            /** Given an object, function name, and a list of argument types; find the method that matches.
            * @param $obj Object to search for the method.
            * @param $functionName Function name to search for.
            * @param $argumentTypes Argument types for the function.
            */
            public static GetValidMethodInfo ($obj: any, $functionName: string, $argumentTypes: System.Array$1<System.Type>) : System.Reflection.MethodInfo
            /** Given an object type, function name, and a list of argument types; find the method that matches.
            * @param $objectType Object type to search for the method.
            * @param $functionName Function name to search for.
            * @param $argumentTypes Argument types for the function.
            */
            public static GetValidMethodInfo ($objectType: System.Type, $functionName: string, $argumentTypes: System.Array$1<System.Type>) : System.Reflection.MethodInfo
        }
        /** A zero-argument event callback that persists with the Scene and allows the registration of runtime and persistent listeners.
        */
        class UnityEvent extends UnityEngine.Events.UnityEventBase implements UnityEngine.ISerializationCallbackReceiver
        {
            protected [__keep_incompatibility]: never;
            /** Adds a runtime listener to the UnityEvent.
            * @param $call The callback function to execute when the event is invoked.
            */
            public AddListener ($call: UnityEngine.Events.UnityAction) : void
            /** Removes a runtime listener from the UnityEvent.
            * @param $call The callback function to remove.
            */
            public RemoveListener ($call: UnityEngine.Events.UnityAction) : void
            /** Invoke all registered callbacks both runtime and persistent.
            */
            public Invoke () : void
            public constructor ()
        }
        /** Controls the scope of UnityEvent callbacks.
        */
        enum UnityEventCallState
        { Off = 0, EditorAndRuntime = 1, RuntimeOnly = 2 }
        /** Zero argument delegate used by UnityEvents.
        */
        interface UnityAction
        { 
        () : void; 
        Invoke?: () => void;
        }
        var UnityAction: { new (func: () => void): UnityAction; }
        class UnityEvent$1<T0> extends UnityEngine.Events.UnityEventBase implements UnityEngine.ISerializationCallbackReceiver
        {
            protected [__keep_incompatibility]: never;
            public AddListener ($call: UnityEngine.Events.UnityAction$1<T0>) : void
            public RemoveListener ($call: UnityEngine.Events.UnityAction$1<T0>) : void
            public Invoke ($arg0: T0) : void
            public constructor ()
        }
        interface UnityAction$1<T0>
        { 
        (arg0: T0) : void; 
        Invoke?: (arg0: T0) => void;
        }
        class UnityEvent$3<T0, T1, T2> extends UnityEngine.Events.UnityEventBase implements UnityEngine.ISerializationCallbackReceiver
        {
            protected [__keep_incompatibility]: never;
        }
    }
    namespace UnityEngine.EventSystems {
        class UIBehaviour extends UnityEngine.MonoBehaviour
        {
            protected [__keep_incompatibility]: never;
        }
        interface IPointerUpHandler extends UnityEngine.EventSystems.IEventSystemHandler
        {
        }
        interface IEventSystemHandler
        {
        }
        interface IMoveHandler extends UnityEngine.EventSystems.IEventSystemHandler
        {
        }
        interface IPointerEnterHandler extends UnityEngine.EventSystems.IEventSystemHandler
        {
        }
        interface ISelectHandler extends UnityEngine.EventSystems.IEventSystemHandler
        {
        }
        interface IPointerExitHandler extends UnityEngine.EventSystems.IEventSystemHandler
        {
        }
        interface IDeselectHandler extends UnityEngine.EventSystems.IEventSystemHandler
        {
        }
        interface IPointerDownHandler extends UnityEngine.EventSystems.IEventSystemHandler
        {
        }
        interface IInitializePotentialDragHandler extends UnityEngine.EventSystems.IEventSystemHandler
        {
        }
        interface IDragHandler extends UnityEngine.EventSystems.IEventSystemHandler
        {
        }
        class AbstractEventData extends System.Object
        {
            protected [__keep_incompatibility]: never;
        }
        class BaseEventData extends UnityEngine.EventSystems.AbstractEventData
        {
            protected [__keep_incompatibility]: never;
        }
        class PointerEventData extends UnityEngine.EventSystems.BaseEventData
        {
            protected [__keep_incompatibility]: never;
        }
        class AxisEventData extends UnityEngine.EventSystems.BaseEventData
        {
            protected [__keep_incompatibility]: never;
        }
        interface ISubmitHandler extends UnityEngine.EventSystems.IEventSystemHandler
        {
        }
        interface IPointerClickHandler extends UnityEngine.EventSystems.IEventSystemHandler
        {
        }
        interface IBeginDragHandler extends UnityEngine.EventSystems.IEventSystemHandler
        {
        }
        interface IEndDragHandler extends UnityEngine.EventSystems.IEventSystemHandler
        {
        }
        interface IUpdateSelectedHandler extends UnityEngine.EventSystems.IEventSystemHandler
        {
        }
        interface ICancelHandler extends UnityEngine.EventSystems.IEventSystemHandler
        {
        }
        interface IScrollHandler extends UnityEngine.EventSystems.IEventSystemHandler
        {
        }
    }
    namespace UnityEngine.UI {
        class Selectable extends UnityEngine.EventSystems.UIBehaviour implements UnityEngine.EventSystems.IPointerUpHandler, UnityEngine.EventSystems.IMoveHandler, UnityEngine.EventSystems.IEventSystemHandler, UnityEngine.EventSystems.IPointerEnterHandler, UnityEngine.EventSystems.ISelectHandler, UnityEngine.EventSystems.IPointerExitHandler, UnityEngine.EventSystems.IDeselectHandler, UnityEngine.EventSystems.IPointerDownHandler
        {
            protected [__keep_incompatibility]: never;
            public static get allSelectablesArray(): System.Array$1<UnityEngine.UI.Selectable>;
            public static get allSelectableCount(): number;
            public get navigation(): UnityEngine.UI.Navigation;
            public set navigation(value: UnityEngine.UI.Navigation);
            public get transition(): UnityEngine.UI.Selectable.Transition;
            public set transition(value: UnityEngine.UI.Selectable.Transition);
            public get colors(): UnityEngine.UI.ColorBlock;
            public set colors(value: UnityEngine.UI.ColorBlock);
            public get spriteState(): UnityEngine.UI.SpriteState;
            public set spriteState(value: UnityEngine.UI.SpriteState);
            public get animationTriggers(): UnityEngine.UI.AnimationTriggers;
            public set animationTriggers(value: UnityEngine.UI.AnimationTriggers);
            public get targetGraphic(): UnityEngine.UI.Graphic;
            public set targetGraphic(value: UnityEngine.UI.Graphic);
            public get interactable(): boolean;
            public set interactable(value: boolean);
            public get image(): UnityEngine.UI.Image;
            public set image(value: UnityEngine.UI.Image);
            public get animator(): UnityEngine.Animator;
            public static AllSelectablesNoAlloc ($selectables: System.Array$1<UnityEngine.UI.Selectable>) : number
            public IsInteractable () : boolean
            public FindSelectable ($dir: UnityEngine.Vector3) : UnityEngine.UI.Selectable
            public FindSelectableOnLeft () : UnityEngine.UI.Selectable
            public FindSelectableOnRight () : UnityEngine.UI.Selectable
            public FindSelectableOnUp () : UnityEngine.UI.Selectable
            public FindSelectableOnDown () : UnityEngine.UI.Selectable
            public OnMove ($eventData: UnityEngine.EventSystems.AxisEventData) : void
            public IsHighlighted () : boolean
            public IsPressed () : boolean
            public OnPointerDown ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public OnPointerUp ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public OnPointerEnter ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public OnPointerExit ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public OnSelect ($eventData: UnityEngine.EventSystems.BaseEventData) : void
            public OnDeselect ($eventData: UnityEngine.EventSystems.BaseEventData) : void
            public Select () : void
        }
        class Slider extends UnityEngine.UI.Selectable implements UnityEngine.EventSystems.IPointerUpHandler, UnityEngine.EventSystems.IMoveHandler, UnityEngine.EventSystems.IInitializePotentialDragHandler, UnityEngine.EventSystems.IDragHandler, UnityEngine.UI.ICanvasElement, UnityEngine.EventSystems.IEventSystemHandler, UnityEngine.EventSystems.IPointerEnterHandler, UnityEngine.EventSystems.ISelectHandler, UnityEngine.EventSystems.IPointerExitHandler, UnityEngine.EventSystems.IDeselectHandler, UnityEngine.EventSystems.IPointerDownHandler
        {
            protected [__keep_incompatibility]: never;
            public get fillRect(): UnityEngine.RectTransform;
            public set fillRect(value: UnityEngine.RectTransform);
            public get handleRect(): UnityEngine.RectTransform;
            public set handleRect(value: UnityEngine.RectTransform);
            public get direction(): UnityEngine.UI.Slider.Direction;
            public set direction(value: UnityEngine.UI.Slider.Direction);
            public get minValue(): number;
            public set minValue(value: number);
            public get maxValue(): number;
            public set maxValue(value: number);
            public get wholeNumbers(): boolean;
            public set wholeNumbers(value: boolean);
            public get value(): number;
            public set value(value: number);
            public get normalizedValue(): number;
            public set normalizedValue(value: number);
            public get onValueChanged(): UnityEngine.UI.Slider.SliderEvent;
            public set onValueChanged(value: UnityEngine.UI.Slider.SliderEvent);
            public SetValueWithoutNotify ($input: number) : void
            public Rebuild ($executing: UnityEngine.UI.CanvasUpdate) : void
            public LayoutComplete () : void
            public GraphicUpdateComplete () : void
            public OnDrag ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public OnInitializePotentialDrag ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public SetDirection ($direction: UnityEngine.UI.Slider.Direction, $includeRectLayouts: boolean) : void
        }
        interface ICanvasElement
        {
        }
        class Navigation extends System.ValueType implements System.IEquatable$1<UnityEngine.UI.Navigation>
        {
            protected [__keep_incompatibility]: never;
        }
        class ColorBlock extends System.ValueType implements System.IEquatable$1<UnityEngine.UI.ColorBlock>
        {
            protected [__keep_incompatibility]: never;
        }
        class SpriteState extends System.ValueType implements System.IEquatable$1<UnityEngine.UI.SpriteState>
        {
            protected [__keep_incompatibility]: never;
        }
        class AnimationTriggers extends System.Object
        {
            protected [__keep_incompatibility]: never;
        }
        class Graphic extends UnityEngine.EventSystems.UIBehaviour implements UnityEngine.UI.ICanvasElement
        {
            protected [__keep_incompatibility]: never;
        }
        class MaskableGraphic extends UnityEngine.UI.Graphic implements UnityEngine.UI.IMaterialModifier, UnityEngine.UI.IMaskable, UnityEngine.UI.IClippable, UnityEngine.UI.ICanvasElement
        {
            protected [__keep_incompatibility]: never;
        }
        interface IMaterialModifier
        {
        }
        interface IMaskable
        {
        }
        interface IClippable
        {
        }
        class Image extends UnityEngine.UI.MaskableGraphic implements UnityEngine.UI.IMaterialModifier, UnityEngine.UI.IMaskable, UnityEngine.UI.IClippable, UnityEngine.UI.ICanvasElement, UnityEngine.ICanvasRaycastFilter, UnityEngine.ISerializationCallbackReceiver, UnityEngine.UI.ILayoutElement
        {
            protected [__keep_incompatibility]: never;
            public get sprite(): UnityEngine.Sprite;
            public set sprite(value: UnityEngine.Sprite);
            public get overrideSprite(): UnityEngine.Sprite;
            public set overrideSprite(value: UnityEngine.Sprite);
            public get type(): UnityEngine.UI.Image.Type;
            public set type(value: UnityEngine.UI.Image.Type);
            public get preserveAspect(): boolean;
            public set preserveAspect(value: boolean);
            public get fillCenter(): boolean;
            public set fillCenter(value: boolean);
            public get fillMethod(): UnityEngine.UI.Image.FillMethod;
            public set fillMethod(value: UnityEngine.UI.Image.FillMethod);
            public get fillAmount(): number;
            public set fillAmount(value: number);
            public get fillClockwise(): boolean;
            public set fillClockwise(value: boolean);
            public get fillOrigin(): number;
            public set fillOrigin(value: number);
            public get alphaHitTestMinimumThreshold(): number;
            public set alphaHitTestMinimumThreshold(value: number);
            public get useSpriteMesh(): boolean;
            public set useSpriteMesh(value: boolean);
            public static get defaultETC1GraphicMaterial(): UnityEngine.Material;
            public get mainTexture(): UnityEngine.Texture;
            public get hasBorder(): boolean;
            public get pixelsPerUnitMultiplier(): number;
            public set pixelsPerUnitMultiplier(value: number);
            public get pixelsPerUnit(): number;
            public get material(): UnityEngine.Material;
            public set material(value: UnityEngine.Material);
            public get minWidth(): number;
            public get maxWidth(): number;
            public get preferredWidth(): number;
            public get flexibleWidth(): number;
            public get minHeight(): number;
            public get maxHeight(): number;
            public get preferredHeight(): number;
            public get flexibleHeight(): number;
            public get layoutPriority(): number;
            public DisableSpriteOptimizations () : void
            public OnBeforeSerialize () : void
            public OnAfterDeserialize () : void
            public CalculateLayoutInputHorizontal () : void
            public CalculateLayoutInputVertical () : void
            public IsRaycastLocationValid ($screenPoint: UnityEngine.Vector2, $eventCamera: UnityEngine.Camera) : boolean
        }
        interface ILayoutElement
        {
        }
        class Text extends UnityEngine.UI.MaskableGraphic implements UnityEngine.UI.IMaterialModifier, UnityEngine.UI.IMaskable, UnityEngine.UI.IClippable, UnityEngine.UI.ICanvasElement, UnityEngine.UI.ILayoutElement
        {
            protected [__keep_incompatibility]: never;
            public get cachedTextGenerator(): UnityEngine.TextGenerator;
            public get cachedTextGeneratorForLayout(): UnityEngine.TextGenerator;
            public get mainTexture(): UnityEngine.Texture;
            public get font(): UnityEngine.Font;
            public set font(value: UnityEngine.Font);
            public get text(): string;
            public set text(value: string);
            public get supportRichText(): boolean;
            public set supportRichText(value: boolean);
            public get resizeTextForBestFit(): boolean;
            public set resizeTextForBestFit(value: boolean);
            public get resizeTextMinSize(): number;
            public set resizeTextMinSize(value: number);
            public get resizeTextMaxSize(): number;
            public set resizeTextMaxSize(value: number);
            public get alignment(): UnityEngine.TextAnchor;
            public set alignment(value: UnityEngine.TextAnchor);
            public get alignByGeometry(): boolean;
            public set alignByGeometry(value: boolean);
            public get fontSize(): number;
            public set fontSize(value: number);
            public get horizontalOverflow(): UnityEngine.HorizontalWrapMode;
            public set horizontalOverflow(value: UnityEngine.HorizontalWrapMode);
            public get verticalOverflow(): UnityEngine.VerticalWrapMode;
            public set verticalOverflow(value: UnityEngine.VerticalWrapMode);
            public get lineSpacing(): number;
            public set lineSpacing(value: number);
            public get fontStyle(): UnityEngine.FontStyle;
            public set fontStyle(value: UnityEngine.FontStyle);
            public get pixelsPerUnit(): number;
            public get minWidth(): number;
            public get maxWidth(): number;
            public get preferredWidth(): number;
            public get flexibleWidth(): number;
            public get minHeight(): number;
            public get maxHeight(): number;
            public get preferredHeight(): number;
            public get flexibleHeight(): number;
            public get layoutPriority(): number;
            public FontTextureChanged () : void
            public GetGenerationSettings ($extents: UnityEngine.Vector2) : UnityEngine.TextGenerationSettings
            public static GetTextAnchorPivot ($anchor: UnityEngine.TextAnchor) : UnityEngine.Vector2
            public CalculateLayoutInputHorizontal () : void
            public CalculateLayoutInputVertical () : void
        }
        class Button extends UnityEngine.UI.Selectable implements UnityEngine.EventSystems.IPointerUpHandler, UnityEngine.EventSystems.IMoveHandler, UnityEngine.EventSystems.ISubmitHandler, UnityEngine.EventSystems.IPointerClickHandler, UnityEngine.EventSystems.IEventSystemHandler, UnityEngine.EventSystems.IPointerEnterHandler, UnityEngine.EventSystems.ISelectHandler, UnityEngine.EventSystems.IPointerExitHandler, UnityEngine.EventSystems.IDeselectHandler, UnityEngine.EventSystems.IPointerDownHandler
        {
            protected [__keep_incompatibility]: never;
            public get onClick(): UnityEngine.UI.Button.ButtonClickedEvent;
            public set onClick(value: UnityEngine.UI.Button.ButtonClickedEvent);
            public OnPointerClick ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public OnSubmit ($eventData: UnityEngine.EventSystems.BaseEventData) : void
        }
        class InputField extends UnityEngine.UI.Selectable implements UnityEngine.EventSystems.IPointerUpHandler, UnityEngine.EventSystems.IMoveHandler, UnityEngine.EventSystems.ISubmitHandler, UnityEngine.EventSystems.IPointerClickHandler, UnityEngine.EventSystems.IBeginDragHandler, UnityEngine.EventSystems.IDragHandler, UnityEngine.UI.ICanvasElement, UnityEngine.EventSystems.IEndDragHandler, UnityEngine.EventSystems.IEventSystemHandler, UnityEngine.EventSystems.IPointerEnterHandler, UnityEngine.EventSystems.IUpdateSelectedHandler, UnityEngine.EventSystems.ISelectHandler, UnityEngine.EventSystems.IPointerExitHandler, UnityEngine.UI.ILayoutElement, UnityEngine.EventSystems.IDeselectHandler, UnityEngine.EventSystems.IPointerDownHandler
        {
            protected [__keep_incompatibility]: never;
            public get shouldHideMobileInput(): boolean;
            public set shouldHideMobileInput(value: boolean);
            public get shouldActivateOnSelect(): boolean;
            public set shouldActivateOnSelect(value: boolean);
            public get text(): string;
            public set text(value: string);
            public get isFocused(): boolean;
            public get caretBlinkRate(): number;
            public set caretBlinkRate(value: number);
            public get caretWidth(): number;
            public set caretWidth(value: number);
            public get textComponent(): UnityEngine.UI.Text;
            public set textComponent(value: UnityEngine.UI.Text);
            public get placeholder(): UnityEngine.UI.Graphic;
            public set placeholder(value: UnityEngine.UI.Graphic);
            public get caretColor(): UnityEngine.Color;
            public set caretColor(value: UnityEngine.Color);
            public get customCaretColor(): boolean;
            public set customCaretColor(value: boolean);
            public get selectionColor(): UnityEngine.Color;
            public set selectionColor(value: UnityEngine.Color);
            public get onEndEdit(): UnityEngine.UI.InputField.EndEditEvent;
            public set onEndEdit(value: UnityEngine.UI.InputField.EndEditEvent);
            public get onSubmit(): UnityEngine.UI.InputField.SubmitEvent;
            public set onSubmit(value: UnityEngine.UI.InputField.SubmitEvent);
            public get onValueChanged(): UnityEngine.UI.InputField.OnChangeEvent;
            public set onValueChanged(value: UnityEngine.UI.InputField.OnChangeEvent);
            public get onValidateInput(): UnityEngine.UI.InputField.OnValidateInput;
            public set onValidateInput(value: UnityEngine.UI.InputField.OnValidateInput);
            public get characterLimit(): number;
            public set characterLimit(value: number);
            public get contentType(): UnityEngine.UI.InputField.ContentType;
            public set contentType(value: UnityEngine.UI.InputField.ContentType);
            public get lineType(): UnityEngine.UI.InputField.LineType;
            public set lineType(value: UnityEngine.UI.InputField.LineType);
            public get inputType(): UnityEngine.UI.InputField.InputType;
            public set inputType(value: UnityEngine.UI.InputField.InputType);
            public get touchScreenKeyboard(): UnityEngine.TouchScreenKeyboard;
            public get keyboardType(): UnityEngine.TouchScreenKeyboardType;
            public set keyboardType(value: UnityEngine.TouchScreenKeyboardType);
            public get characterValidation(): UnityEngine.UI.InputField.CharacterValidation;
            public set characterValidation(value: UnityEngine.UI.InputField.CharacterValidation);
            public get readOnly(): boolean;
            public set readOnly(value: boolean);
            public get multiLine(): boolean;
            public get asteriskChar(): number;
            public set asteriskChar(value: number);
            public get wasCanceled(): boolean;
            public get caretPosition(): number;
            public set caretPosition(value: number);
            public get selectionAnchorPosition(): number;
            public set selectionAnchorPosition(value: number);
            public get selectionFocusPosition(): number;
            public set selectionFocusPosition(value: number);
            public get minWidth(): number;
            public get maxWidth(): number;
            public get preferredWidth(): number;
            public get flexibleWidth(): number;
            public get minHeight(): number;
            public get maxHeight(): number;
            public get preferredHeight(): number;
            public get flexibleHeight(): number;
            public get layoutPriority(): number;
            public SetTextWithoutNotify ($input: string) : void
            public MoveTextEnd ($shift: boolean) : void
            public MoveTextStart ($shift: boolean) : void
            public OnBeginDrag ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public OnDrag ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public OnEndDrag ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public ProcessEvent ($e: UnityEngine.Event) : void
            public OnUpdateSelected ($eventData: UnityEngine.EventSystems.BaseEventData) : void
            public ForceLabelUpdate () : void
            public Rebuild ($update: UnityEngine.UI.CanvasUpdate) : void
            public LayoutComplete () : void
            public GraphicUpdateComplete () : void
            public ActivateInputField () : void
            public OnPointerClick ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public DeactivateInputField () : void
            public OnSubmit ($eventData: UnityEngine.EventSystems.BaseEventData) : void
            public CalculateLayoutInputHorizontal () : void
            public CalculateLayoutInputVertical () : void
        }
        enum CanvasUpdate
        { Prelayout = 0, Layout = 1, PostLayout = 2, PreRender = 3, LatePreRender = 4, MaxUpdateValue = 5 }
        class Toggle extends UnityEngine.UI.Selectable implements UnityEngine.EventSystems.IPointerUpHandler, UnityEngine.EventSystems.IMoveHandler, UnityEngine.EventSystems.ISubmitHandler, UnityEngine.EventSystems.IPointerClickHandler, UnityEngine.UI.ICanvasElement, UnityEngine.EventSystems.IEventSystemHandler, UnityEngine.EventSystems.IPointerEnterHandler, UnityEngine.EventSystems.ISelectHandler, UnityEngine.EventSystems.IPointerExitHandler, UnityEngine.EventSystems.IDeselectHandler, UnityEngine.EventSystems.IPointerDownHandler
        {
            protected [__keep_incompatibility]: never;
            public toggleTransition : UnityEngine.UI.Toggle.ToggleTransition
            public graphic : UnityEngine.UI.Graphic
            public onValueChanged : UnityEngine.UI.Toggle.ToggleEvent
            public get group(): UnityEngine.UI.ToggleGroup;
            public set group(value: UnityEngine.UI.ToggleGroup);
            public get isOn(): boolean;
            public set isOn(value: boolean);
            public Rebuild ($executing: UnityEngine.UI.CanvasUpdate) : void
            public LayoutComplete () : void
            public GraphicUpdateComplete () : void
            public SetIsOnWithoutNotify ($value: boolean) : void
            public OnPointerClick ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public OnSubmit ($eventData: UnityEngine.EventSystems.BaseEventData) : void
        }
        class ToggleGroup extends UnityEngine.EventSystems.UIBehaviour
        {
            protected [__keep_incompatibility]: never;
        }
        class Scrollbar extends UnityEngine.UI.Selectable implements UnityEngine.EventSystems.IPointerUpHandler, UnityEngine.EventSystems.IMoveHandler, UnityEngine.EventSystems.IBeginDragHandler, UnityEngine.EventSystems.IInitializePotentialDragHandler, UnityEngine.EventSystems.IDragHandler, UnityEngine.UI.ICanvasElement, UnityEngine.EventSystems.IEventSystemHandler, UnityEngine.EventSystems.IPointerEnterHandler, UnityEngine.EventSystems.ISelectHandler, UnityEngine.EventSystems.IPointerExitHandler, UnityEngine.EventSystems.IDeselectHandler, UnityEngine.EventSystems.IPointerDownHandler
        {
            protected [__keep_incompatibility]: never;
        }
    }
    namespace System.Reflection {
        class MemberInfo extends System.Object implements System.Reflection.ICustomAttributeProvider, System.Runtime.InteropServices._MemberInfo
        {
            protected [__keep_incompatibility]: never;
        }
        interface ICustomAttributeProvider
        {
        }
        interface IReflect
        {
        }
        class MethodBase extends System.Reflection.MemberInfo implements System.Reflection.ICustomAttributeProvider, System.Runtime.InteropServices._MemberInfo, System.Runtime.InteropServices._MethodBase
        {
            protected [__keep_incompatibility]: never;
        }
        class MethodInfo extends System.Reflection.MethodBase implements System.Runtime.InteropServices._MethodInfo, System.Reflection.ICustomAttributeProvider, System.Runtime.InteropServices._MemberInfo, System.Runtime.InteropServices._MethodBase
        {
            protected [__keep_incompatibility]: never;
        }
        interface MemberFilter
        { 
        (m: System.Reflection.MemberInfo, filterCriteria: any) : boolean; 
        Invoke?: (m: System.Reflection.MemberInfo, filterCriteria: any) => boolean;
        }
        var MemberFilter: { new (func: (m: System.Reflection.MemberInfo, filterCriteria: any) => boolean): MemberFilter; }
        interface TypeFilter
        { 
        (m: System.Type, filterCriteria: any) : boolean; 
        Invoke?: (m: System.Type, filterCriteria: any) => boolean;
        }
        var TypeFilter: { new (func: (m: System.Type, filterCriteria: any) => boolean): TypeFilter; }
        enum MemberTypes
        { Constructor = 1, Event = 2, Field = 4, Method = 8, Property = 16, TypeInfo = 32, Custom = 64, NestedType = 128, All = 191 }
        enum BindingFlags
        { Default = 0, IgnoreCase = 1, DeclaredOnly = 2, Instance = 4, Static = 8, Public = 16, NonPublic = 32, FlattenHierarchy = 64, InvokeMethod = 256, CreateInstance = 512, GetField = 1024, SetField = 2048, GetProperty = 4096, SetProperty = 8192, PutDispProperty = 16384, PutRefDispProperty = 32768, ExactBinding = 65536, SuppressChangeType = 131072, OptionalParamBinding = 262144, IgnoreReturn = 16777216, DoNotWrapExceptions = 33554432 }
        class Assembly extends System.Object implements System.Reflection.ICustomAttributeProvider, System.Runtime.InteropServices._Assembly, System.Security.IEvidenceFactory, System.Runtime.Serialization.ISerializable
        {
            protected [__keep_incompatibility]: never;
        }
        class Module extends System.Object implements System.Runtime.InteropServices._Module, System.Reflection.ICustomAttributeProvider, System.Runtime.Serialization.ISerializable
        {
            protected [__keep_incompatibility]: never;
        }
        enum GenericParameterAttributes
        { None = 0, VarianceMask = 3, Covariant = 1, Contravariant = 2, SpecialConstraintMask = 28, ReferenceTypeConstraint = 4, NotNullableValueTypeConstraint = 8, DefaultConstructorConstraint = 16 }
        enum TypeAttributes
        { VisibilityMask = 7, NotPublic = 0, Public = 1, NestedPublic = 2, NestedPrivate = 3, NestedFamily = 4, NestedAssembly = 5, NestedFamANDAssem = 6, NestedFamORAssem = 7, LayoutMask = 24, AutoLayout = 0, SequentialLayout = 8, ExplicitLayout = 16, ClassSemanticsMask = 32, Class = 0, Interface = 32, Abstract = 128, Sealed = 256, SpecialName = 1024, Import = 4096, Serializable = 8192, WindowsRuntime = 16384, StringFormatMask = 196608, AnsiClass = 0, UnicodeClass = 65536, AutoClass = 131072, CustomFormatClass = 196608, CustomFormatMask = 12582912, BeforeFieldInit = 1048576, RTSpecialName = 2048, HasSecurity = 262144, ReservedMask = 264192 }
        class ConstructorInfo extends System.Reflection.MethodBase implements System.Reflection.ICustomAttributeProvider, System.Runtime.InteropServices._MemberInfo, System.Runtime.InteropServices._MethodBase, System.Runtime.InteropServices._ConstructorInfo
        {
            protected [__keep_incompatibility]: never;
        }
        class Binder extends System.Object
        {
            protected [__keep_incompatibility]: never;
        }
        class ParameterModifier extends System.ValueType
        {
            protected [__keep_incompatibility]: never;
        }
        enum CallingConventions
        { Standard = 1, VarArgs = 2, Any = 3, HasThis = 32, ExplicitThis = 64 }
        class EventInfo extends System.Reflection.MemberInfo implements System.Runtime.InteropServices._EventInfo, System.Reflection.ICustomAttributeProvider, System.Runtime.InteropServices._MemberInfo
        {
            protected [__keep_incompatibility]: never;
        }
        class FieldInfo extends System.Reflection.MemberInfo implements System.Reflection.ICustomAttributeProvider, System.Runtime.InteropServices._FieldInfo, System.Runtime.InteropServices._MemberInfo
        {
            protected [__keep_incompatibility]: never;
        }
        class PropertyInfo extends System.Reflection.MemberInfo implements System.Reflection.ICustomAttributeProvider, System.Runtime.InteropServices._PropertyInfo, System.Runtime.InteropServices._MemberInfo
        {
            protected [__keep_incompatibility]: never;
        }
        class InterfaceMapping extends System.ValueType
        {
            protected [__keep_incompatibility]: never;
        }
        class AssemblyName extends System.Object implements System.ICloneable, System.Runtime.InteropServices._AssemblyName, System.Runtime.Serialization.IDeserializationCallback, System.Runtime.Serialization.ISerializable
        {
            protected [__keep_incompatibility]: never;
        }
    }
    namespace System.Runtime.InteropServices {
        interface _MemberInfo
        {
        }
        interface _Type
        {
        }
        interface _MethodBase
        {
        }
        interface _MethodInfo
        {
        }
        interface _Assembly
        {
        }
        interface _Module
        {
        }
        interface _Attribute
        {
        }
        class StructLayoutAttribute extends System.Attribute implements System.Runtime.InteropServices._Attribute
        {
            protected [__keep_incompatibility]: never;
        }
        interface _ConstructorInfo
        {
        }
        interface _EventInfo
        {
        }
        interface _FieldInfo
        {
        }
        interface _PropertyInfo
        {
        }
        interface _AssemblyName
        {
        }
    }
    namespace System.Collections.ObjectModel {
        class ReadOnlyCollection$1<T> extends System.Object implements System.Collections.Generic.IEnumerable$1<T>, System.Collections.IEnumerable, System.Collections.Generic.IList$1<T>, System.Collections.Generic.IReadOnlyCollection$1<T>, System.Collections.IList, System.Collections.Generic.ICollection$1<T>, System.Collections.Generic.IReadOnlyList$1<T>, System.Collections.ICollection
        {
            protected [__keep_incompatibility]: never;
            public [Symbol.iterator]() : IterableIterator<T>
        }
    }
    namespace System.Runtime.Serialization {
        interface ISerializable
        {
        }
        interface IDeserializationCallback
        {
        }
    }
    namespace Unity.Collections {
        class NativeArray$1<T> extends System.ValueType implements System.IEquatable$1<Unity.Collections.NativeArray$1<T>>, System.Collections.Generic.IEnumerable$1<T>, System.Collections.IEnumerable, System.IDisposable
        {
            protected [__keep_incompatibility]: never;
            public [Symbol.iterator]() : IterableIterator<T>
        }
    }
    namespace UnityEngine.SceneManagement {
        /** The runtime data structure for a scene.
        */
        class Scene extends System.ValueType
        {
            protected [__keep_incompatibility]: never;
        }
    }
    namespace UnityEngine.UI.Selectable {
        enum Transition
        { None = 0, ColorTint = 1, SpriteSwap = 2, Animation = 3 }
    }
    namespace UnityEngine.UI.Image {
        enum Type
        { Simple = 0, Sliced = 1, Tiled = 2, Filled = 3 }
        enum FillMethod
        { Horizontal = 0, Vertical = 1, Radial90 = 2, Radial180 = 3, Radial360 = 4 }
    }
    namespace UnityEngine.UI.Button {
        class ButtonClickedEvent extends UnityEngine.Events.UnityEvent implements UnityEngine.ISerializationCallbackReceiver
        {
            protected [__keep_incompatibility]: never;
            public constructor ()
        }
    }
    namespace UnityEngine.UI.InputField {
        class EndEditEvent extends UnityEngine.Events.UnityEvent$1<string> implements UnityEngine.ISerializationCallbackReceiver
        {
            protected [__keep_incompatibility]: never;
        }
        class SubmitEvent extends UnityEngine.Events.UnityEvent$1<string> implements UnityEngine.ISerializationCallbackReceiver
        {
            protected [__keep_incompatibility]: never;
        }
        class OnChangeEvent extends UnityEngine.Events.UnityEvent$1<string> implements UnityEngine.ISerializationCallbackReceiver
        {
            protected [__keep_incompatibility]: never;
            public constructor ()
        }
        interface OnValidateInput
        { 
        (text: string, charIndex: number, addedChar: number) : number; 
        Invoke?: (text: string, charIndex: number, addedChar: number) => number;
        }
        var OnValidateInput: { new (func: (text: string, charIndex: number, addedChar: number) => number): OnValidateInput; }
        enum ContentType
        { Standard = 0, Autocorrected = 1, IntegerNumber = 2, DecimalNumber = 3, Alphanumeric = 4, Name = 5, EmailAddress = 6, Password = 7, Pin = 8, Custom = 9 }
        enum LineType
        { SingleLine = 0, MultiLineSubmit = 1, MultiLineNewline = 2 }
        enum InputType
        { Standard = 0, AutoCorrect = 1, Password = 2 }
        enum CharacterValidation
        { None = 0, Integer = 1, Decimal = 2, Alphanumeric = 3, Name = 4, EmailAddress = 5 }
    }
    namespace UnityEngine.UI.Toggle {
        enum ToggleTransition
        { None = 0, Fade = 1 }
        class ToggleEvent extends UnityEngine.Events.UnityEvent$1<boolean> implements UnityEngine.ISerializationCallbackReceiver
        {
            protected [__keep_incompatibility]: never;
            public constructor ()
        }
    }
    namespace UnityEngine.UI.Slider {
        enum Direction
        { LeftToRight = 0, RightToLeft = 1, BottomToTop = 2, TopToBottom = 3 }
        class SliderEvent extends UnityEngine.Events.UnityEvent$1<number> implements UnityEngine.ISerializationCallbackReceiver
        {
            protected [__keep_incompatibility]: never;
            public constructor ()
        }
    }
    namespace TMPro {
        class TMP_Text extends UnityEngine.UI.MaskableGraphic implements UnityEngine.UI.IMaterialModifier, UnityEngine.UI.IMaskable, UnityEngine.UI.IClippable, UnityEngine.UI.ICanvasElement
        {
            protected [__keep_incompatibility]: never;
            public get text(): string;
            public set text(value: string);
            public get textPreprocessor(): TMPro.ITextPreprocessor;
            public set textPreprocessor(value: TMPro.ITextPreprocessor);
            public get isRightToLeftText(): boolean;
            public set isRightToLeftText(value: boolean);
            public get font(): TMPro.TMP_FontAsset;
            public set font(value: TMPro.TMP_FontAsset);
            public get fontSharedMaterial(): UnityEngine.Material;
            public set fontSharedMaterial(value: UnityEngine.Material);
            public get fontSharedMaterials(): System.Array$1<UnityEngine.Material>;
            public set fontSharedMaterials(value: System.Array$1<UnityEngine.Material>);
            public get fontMaterial(): UnityEngine.Material;
            public set fontMaterial(value: UnityEngine.Material);
            public get fontMaterials(): System.Array$1<UnityEngine.Material>;
            public set fontMaterials(value: System.Array$1<UnityEngine.Material>);
            public get color(): UnityEngine.Color;
            public set color(value: UnityEngine.Color);
            public get alpha(): number;
            public set alpha(value: number);
            public get enableVertexGradient(): boolean;
            public set enableVertexGradient(value: boolean);
            public get colorGradient(): TMPro.VertexGradient;
            public set colorGradient(value: TMPro.VertexGradient);
            public get colorGradientPreset(): TMPro.TMP_ColorGradient;
            public set colorGradientPreset(value: TMPro.TMP_ColorGradient);
            public get spriteAsset(): TMPro.TMP_SpriteAsset;
            public set spriteAsset(value: TMPro.TMP_SpriteAsset);
            public get tintAllSprites(): boolean;
            public set tintAllSprites(value: boolean);
            public get styleSheet(): TMPro.TMP_StyleSheet;
            public set styleSheet(value: TMPro.TMP_StyleSheet);
            public get textStyle(): TMPro.TMP_Style;
            public set textStyle(value: TMPro.TMP_Style);
            public get overrideColorTags(): boolean;
            public set overrideColorTags(value: boolean);
            public get faceColor(): UnityEngine.Color32;
            public set faceColor(value: UnityEngine.Color32);
            public get outlineColor(): UnityEngine.Color32;
            public set outlineColor(value: UnityEngine.Color32);
            public get outlineWidth(): number;
            public set outlineWidth(value: number);
            public get fontSize(): number;
            public set fontSize(value: number);
            public get fontWeight(): TMPro.FontWeight;
            public set fontWeight(value: TMPro.FontWeight);
            public get pixelsPerUnit(): number;
            public get enableAutoSizing(): boolean;
            public set enableAutoSizing(value: boolean);
            public get fontSizeMin(): number;
            public set fontSizeMin(value: number);
            public get fontSizeMax(): number;
            public set fontSizeMax(value: number);
            public get fontStyle(): TMPro.FontStyles;
            public set fontStyle(value: TMPro.FontStyles);
            public get isUsingBold(): boolean;
            public get horizontalAlignment(): TMPro.HorizontalAlignmentOptions;
            public set horizontalAlignment(value: TMPro.HorizontalAlignmentOptions);
            public get verticalAlignment(): TMPro.VerticalAlignmentOptions;
            public set verticalAlignment(value: TMPro.VerticalAlignmentOptions);
            public get alignment(): TMPro.TextAlignmentOptions;
            public set alignment(value: TMPro.TextAlignmentOptions);
            public get characterSpacing(): number;
            public set characterSpacing(value: number);
            public get characterHorizontalScale(): number;
            public set characterHorizontalScale(value: number);
            public get wordSpacing(): number;
            public set wordSpacing(value: number);
            public get lineSpacing(): number;
            public set lineSpacing(value: number);
            public get lineSpacingAdjustment(): number;
            public set lineSpacingAdjustment(value: number);
            public get paragraphSpacing(): number;
            public set paragraphSpacing(value: number);
            public get characterWidthAdjustment(): number;
            public set characterWidthAdjustment(value: number);
            public get textWrappingMode(): TMPro.TextWrappingModes;
            public set textWrappingMode(value: TMPro.TextWrappingModes);
            public get wordWrappingRatios(): number;
            public set wordWrappingRatios(value: number);
            public get overflowMode(): TMPro.TextOverflowModes;
            public set overflowMode(value: TMPro.TextOverflowModes);
            public get isTextOverflowing(): boolean;
            public get firstOverflowCharacterIndex(): number;
            public get linkedTextComponent(): TMPro.TMP_Text;
            public set linkedTextComponent(value: TMPro.TMP_Text);
            public get isTextTruncated(): boolean;
            public get fontFeatures(): System.Collections.Generic.List$1<UnityEngine.TextCore.OTL_FeatureTag>;
            public set fontFeatures(value: System.Collections.Generic.List$1<UnityEngine.TextCore.OTL_FeatureTag>);
            public get extraPadding(): boolean;
            public set extraPadding(value: boolean);
            public get richText(): boolean;
            public set richText(value: boolean);
            public get emojiFallbackSupport(): boolean;
            public set emojiFallbackSupport(value: boolean);
            public get parseCtrlCharacters(): boolean;
            public set parseCtrlCharacters(value: boolean);
            public get isOverlay(): boolean;
            public set isOverlay(value: boolean);
            public get isOrthographic(): boolean;
            public set isOrthographic(value: boolean);
            public get enableCulling(): boolean;
            public set enableCulling(value: boolean);
            public get ignoreVisibility(): boolean;
            public set ignoreVisibility(value: boolean);
            public get horizontalMapping(): TMPro.TextureMappingOptions;
            public set horizontalMapping(value: TMPro.TextureMappingOptions);
            public get verticalMapping(): TMPro.TextureMappingOptions;
            public set verticalMapping(value: TMPro.TextureMappingOptions);
            public get mappingUvLineOffset(): number;
            public set mappingUvLineOffset(value: number);
            public get renderMode(): TMPro.TextRenderFlags;
            public set renderMode(value: TMPro.TextRenderFlags);
            public get geometrySortingOrder(): TMPro.VertexSortingOrder;
            public set geometrySortingOrder(value: TMPro.VertexSortingOrder);
            public get isTextObjectScaleStatic(): boolean;
            public set isTextObjectScaleStatic(value: boolean);
            public get vertexBufferAutoSizeReduction(): boolean;
            public set vertexBufferAutoSizeReduction(value: boolean);
            public get firstVisibleCharacter(): number;
            public set firstVisibleCharacter(value: number);
            public get maxVisibleCharacters(): number;
            public set maxVisibleCharacters(value: number);
            public get maxVisibleWords(): number;
            public set maxVisibleWords(value: number);
            public get maxVisibleLines(): number;
            public set maxVisibleLines(value: number);
            public get useMaxVisibleDescender(): boolean;
            public set useMaxVisibleDescender(value: boolean);
            public get pageToDisplay(): number;
            public set pageToDisplay(value: number);
            public get margin(): UnityEngine.Vector4;
            public set margin(value: UnityEngine.Vector4);
            public get textInfo(): TMPro.TMP_TextInfo;
            public get havePropertiesChanged(): boolean;
            public set havePropertiesChanged(value: boolean);
            public get isUsingLegacyAnimationComponent(): boolean;
            public set isUsingLegacyAnimationComponent(value: boolean);
            public get transform(): UnityEngine.Transform;
            public get rectTransform(): UnityEngine.RectTransform;
            public get autoSizeTextContainer(): boolean;
            public set autoSizeTextContainer(value: boolean);
            public get mesh(): UnityEngine.Mesh;
            public get isVolumetricText(): boolean;
            public set isVolumetricText(value: boolean);
            public get bounds(): UnityEngine.Bounds;
            public get textBounds(): UnityEngine.Bounds;
            public get flexibleHeight(): number;
            public get flexibleWidth(): number;
            public get minWidth(): number;
            public get minHeight(): number;
            public get maxWidth(): number;
            public get maxHeight(): number;
            public get preferredWidth(): number;
            public get preferredHeight(): number;
            public get renderedWidth(): number;
            public get renderedHeight(): number;
            public get layoutPriority(): number;
            public static add_OnCharacterRequest ($value: System.Func$3<number, TMPro.TMP_Text, TMPro.TMP_FontAsset>) : void
            public static remove_OnCharacterRequest ($value: System.Func$3<number, TMPro.TMP_Text, TMPro.TMP_FontAsset>) : void
            public static add_OnFontAssetRequest ($value: System.Func$3<number, string, TMPro.TMP_FontAsset>) : void
            public static remove_OnFontAssetRequest ($value: System.Func$3<number, string, TMPro.TMP_FontAsset>) : void
            public static add_OnFontMaterialRequest ($value: System.Func$3<number, string, UnityEngine.Material>) : void
            public static remove_OnFontMaterialRequest ($value: System.Func$3<number, string, UnityEngine.Material>) : void
            public static add_OnSpriteAssetRequest ($value: System.Func$3<number, string, TMPro.TMP_SpriteAsset>) : void
            public static remove_OnSpriteAssetRequest ($value: System.Func$3<number, string, TMPro.TMP_SpriteAsset>) : void
            public static add_OnColorGradientAssetRequest ($value: System.Func$3<number, string, TMPro.TMP_ColorGradient>) : void
            public static remove_OnColorGradientAssetRequest ($value: System.Func$3<number, string, TMPro.TMP_ColorGradient>) : void
            public static add_OnMissingCharacter ($value: TMPro.TMP_Text.MissingCharacterEventCallback) : void
            public static remove_OnMissingCharacter ($value: TMPro.TMP_Text.MissingCharacterEventCallback) : void
            public add_OnPreRenderText ($value: System.Action$1<TMPro.TMP_TextInfo>) : void
            public remove_OnPreRenderText ($value: System.Action$1<TMPro.TMP_TextInfo>) : void
            public ForceMeshUpdate ($ignoreActiveState?: boolean, $forceTextReparsing?: boolean) : void
            public UpdateGeometry ($mesh: UnityEngine.Mesh, $index: number) : void
            public UpdateVertexData ($flags: TMPro.TMP_VertexDataUpdateFlags) : void
            public UpdateVertexData () : void
            public SetVertices ($vertices: System.Array$1<UnityEngine.Vector3>) : void
            public UpdateMeshPadding () : void
            public SetText ($sourceText: string) : void
            public SetText ($sourceText: string, $arg0: number) : void
            public SetText ($sourceText: string, $arg0: number, $arg1: number) : void
            public SetText ($sourceText: string, $arg0: number, $arg1: number, $arg2: number) : void
            public SetText ($sourceText: string, $arg0: number, $arg1: number, $arg2: number, $arg3: number) : void
            public SetText ($sourceText: string, $arg0: number, $arg1: number, $arg2: number, $arg3: number, $arg4: number) : void
            public SetText ($sourceText: string, $arg0: number, $arg1: number, $arg2: number, $arg3: number, $arg4: number, $arg5: number) : void
            public SetText ($sourceText: string, $arg0: number, $arg1: number, $arg2: number, $arg3: number, $arg4: number, $arg5: number, $arg6: number) : void
            public SetText ($sourceText: string, $arg0: number, $arg1: number, $arg2: number, $arg3: number, $arg4: number, $arg5: number, $arg6: number, $arg7: number) : void
            public SetText ($sourceText: System.Text.StringBuilder) : void
            public SetText ($sourceText: System.Array$1<number>) : void
            public SetText ($sourceText: System.Array$1<number>, $start: number, $length: number) : void
            public SetCharArray ($sourceText: System.Array$1<number>) : void
            public SetCharArray ($sourceText: System.Array$1<number>, $start: number, $length: number) : void
            public GetPreferredValues () : UnityEngine.Vector2
            public GetPreferredValues ($width: number, $height: number) : UnityEngine.Vector2
            public GetPreferredValues ($text: string) : UnityEngine.Vector2
            public GetPreferredValues ($text: string, $width: number, $height: number) : UnityEngine.Vector2
            public GetRenderedValues () : UnityEngine.Vector2
            public GetRenderedValues ($onlyVisibleCharacters: boolean) : UnityEngine.Vector2
            public GetTextInfo ($text: string) : TMPro.TMP_TextInfo
            public ComputeMarginSize () : void
            public ClearMesh () : void
            public ClearMesh ($uploadGeometry: boolean) : void
            public GetParsedText () : string
        }
        interface ITextPreprocessor
        {
        }
        class TMP_Asset extends UnityEngine.ScriptableObject
        {
            protected [__keep_incompatibility]: never;
        }
        class TMP_FontAsset extends TMPro.TMP_Asset
        {
            protected [__keep_incompatibility]: never;
        }
        class VertexGradient extends System.ValueType
        {
            protected [__keep_incompatibility]: never;
        }
        class TMP_ColorGradient extends UnityEngine.ScriptableObject
        {
            protected [__keep_incompatibility]: never;
        }
        class TMP_SpriteAsset extends TMPro.TMP_Asset
        {
            protected [__keep_incompatibility]: never;
        }
        class TMP_StyleSheet extends UnityEngine.ScriptableObject
        {
            protected [__keep_incompatibility]: never;
        }
        class TMP_Style extends System.Object
        {
            protected [__keep_incompatibility]: never;
        }
        enum FontWeight
        { Thin = 100, ExtraLight = 200, Light = 300, Regular = 400, Medium = 500, SemiBold = 600, Bold = 700, Heavy = 800, Black = 900 }
        enum FontStyles
        { Normal = 0, Bold = 1, Italic = 2, Underline = 4, LowerCase = 8, UpperCase = 16, SmallCaps = 32, Strikethrough = 64, Superscript = 128, Subscript = 256, Highlight = 512 }
        enum HorizontalAlignmentOptions
        { Left = 1, Center = 2, Right = 4, Justified = 8, Flush = 16, Geometry = 32 }
        enum VerticalAlignmentOptions
        { Top = 256, Middle = 512, Bottom = 1024, Baseline = 2048, Geometry = 4096, Capline = 8192 }
        enum TextAlignmentOptions
        { TopLeft = 257, Top = 258, TopRight = 260, TopJustified = 264, TopFlush = 272, TopGeoAligned = 288, Left = 513, Center = 514, Right = 516, Justified = 520, Flush = 528, CenterGeoAligned = 544, BottomLeft = 1025, Bottom = 1026, BottomRight = 1028, BottomJustified = 1032, BottomFlush = 1040, BottomGeoAligned = 1056, BaselineLeft = 2049, Baseline = 2050, BaselineRight = 2052, BaselineJustified = 2056, BaselineFlush = 2064, BaselineGeoAligned = 2080, MidlineLeft = 4097, Midline = 4098, MidlineRight = 4100, MidlineJustified = 4104, MidlineFlush = 4112, MidlineGeoAligned = 4128, CaplineLeft = 8193, Capline = 8194, CaplineRight = 8196, CaplineJustified = 8200, CaplineFlush = 8208, CaplineGeoAligned = 8224, Converted = 65535 }
        enum TextWrappingModes
        { NoWrap = 0, Normal = 1, PreserveWhitespace = 2, PreserveWhitespaceNoWrap = 3 }
        enum TextOverflowModes
        { Overflow = 0, Ellipsis = 1, Masking = 2, Truncate = 3, ScrollRect = 4, Page = 5, Linked = 6 }
        enum TextureMappingOptions
        { Character = 0, Line = 1, Paragraph = 2, MatchAspect = 3 }
        enum TextRenderFlags
        { DontRender = 0, Render = 255 }
        enum VertexSortingOrder
        { Normal = 0, Reverse = 1 }
        class TMP_TextInfo extends System.Object
        {
            protected [__keep_incompatibility]: never;
        }
        enum TMP_VertexDataUpdateFlags
        { None = 0, Vertices = 1, Uv0 = 2, Uv2 = 4, Uv4 = 8, Colors32 = 16, All = 255 }
        class TextMeshProUGUI extends TMPro.TMP_Text implements UnityEngine.UI.IMaterialModifier, UnityEngine.UI.IMaskable, UnityEngine.UI.IClippable, UnityEngine.UI.ICanvasElement, UnityEngine.UI.ILayoutElement
        {
            protected [__keep_incompatibility]: never;
            public get materialForRendering(): UnityEngine.Material;
            public get autoSizeTextContainer(): boolean;
            public set autoSizeTextContainer(value: boolean);
            public get mesh(): UnityEngine.Mesh;
            public get canvasRenderer(): UnityEngine.CanvasRenderer;
            public get maskOffset(): UnityEngine.Vector4;
            public set maskOffset(value: UnityEngine.Vector4);
            public CalculateLayoutInputHorizontal () : void
            public CalculateLayoutInputVertical () : void
            public UpdateFontAsset () : void
            public constructor ()
        }
        class TMP_InputField extends UnityEngine.UI.Selectable implements UnityEngine.EventSystems.IPointerUpHandler, UnityEngine.EventSystems.IMoveHandler, UnityEngine.EventSystems.ISubmitHandler, UnityEngine.EventSystems.IPointerClickHandler, UnityEngine.EventSystems.ICancelHandler, UnityEngine.EventSystems.IBeginDragHandler, UnityEngine.EventSystems.IDragHandler, UnityEngine.UI.ICanvasElement, UnityEngine.EventSystems.IEndDragHandler, UnityEngine.EventSystems.IEventSystemHandler, UnityEngine.EventSystems.IScrollHandler, UnityEngine.EventSystems.IPointerEnterHandler, UnityEngine.EventSystems.IUpdateSelectedHandler, UnityEngine.EventSystems.ISelectHandler, UnityEngine.EventSystems.IPointerExitHandler, UnityEngine.UI.ILayoutElement, UnityEngine.EventSystems.IDeselectHandler, UnityEngine.EventSystems.IPointerDownHandler
        {
            protected [__keep_incompatibility]: never;
            public isAlert : boolean
            public get shouldActivateOnSelect(): boolean;
            public set shouldActivateOnSelect(value: boolean);
            public get shouldHideMobileInput(): boolean;
            public set shouldHideMobileInput(value: boolean);
            public get shouldHideSoftKeyboard(): boolean;
            public set shouldHideSoftKeyboard(value: boolean);
            public get text(): string;
            public set text(value: string);
            public get isFocused(): boolean;
            public get caretBlinkRate(): number;
            public set caretBlinkRate(value: number);
            public get caretWidth(): number;
            public set caretWidth(value: number);
            public get textViewport(): UnityEngine.RectTransform;
            public set textViewport(value: UnityEngine.RectTransform);
            public get textComponent(): TMPro.TMP_Text;
            public set textComponent(value: TMPro.TMP_Text);
            public get placeholder(): UnityEngine.UI.Graphic;
            public set placeholder(value: UnityEngine.UI.Graphic);
            public get verticalScrollbar(): UnityEngine.UI.Scrollbar;
            public set verticalScrollbar(value: UnityEngine.UI.Scrollbar);
            public get scrollSensitivity(): number;
            public set scrollSensitivity(value: number);
            public get caretColor(): UnityEngine.Color;
            public set caretColor(value: UnityEngine.Color);
            public get customCaretColor(): boolean;
            public set customCaretColor(value: boolean);
            public get selectionColor(): UnityEngine.Color;
            public set selectionColor(value: UnityEngine.Color);
            public get onEndEdit(): TMPro.TMP_InputField.SubmitEvent;
            public set onEndEdit(value: TMPro.TMP_InputField.SubmitEvent);
            public get onSubmit(): TMPro.TMP_InputField.SubmitEvent;
            public set onSubmit(value: TMPro.TMP_InputField.SubmitEvent);
            public get onSelect(): TMPro.TMP_InputField.SelectionEvent;
            public set onSelect(value: TMPro.TMP_InputField.SelectionEvent);
            public get onDeselect(): TMPro.TMP_InputField.SelectionEvent;
            public set onDeselect(value: TMPro.TMP_InputField.SelectionEvent);
            public get onTextSelection(): TMPro.TMP_InputField.TextSelectionEvent;
            public set onTextSelection(value: TMPro.TMP_InputField.TextSelectionEvent);
            public get onEndTextSelection(): TMPro.TMP_InputField.TextSelectionEvent;
            public set onEndTextSelection(value: TMPro.TMP_InputField.TextSelectionEvent);
            public get onValueChanged(): TMPro.TMP_InputField.OnChangeEvent;
            public set onValueChanged(value: TMPro.TMP_InputField.OnChangeEvent);
            public get onTouchScreenKeyboardStatusChanged(): TMPro.TMP_InputField.TouchScreenKeyboardEvent;
            public set onTouchScreenKeyboardStatusChanged(value: TMPro.TMP_InputField.TouchScreenKeyboardEvent);
            public get onValidateInput(): TMPro.TMP_InputField.OnValidateInput;
            public set onValidateInput(value: TMPro.TMP_InputField.OnValidateInput);
            public get characterLimit(): number;
            public set characterLimit(value: number);
            public get pointSize(): number;
            public set pointSize(value: number);
            public get fontAsset(): TMPro.TMP_FontAsset;
            public set fontAsset(value: TMPro.TMP_FontAsset);
            public get onFocusSelectAll(): boolean;
            public set onFocusSelectAll(value: boolean);
            public get resetOnDeActivation(): boolean;
            public set resetOnDeActivation(value: boolean);
            public get keepTextSelectionVisible(): boolean;
            public set keepTextSelectionVisible(value: boolean);
            public get restoreOriginalTextOnEscape(): boolean;
            public set restoreOriginalTextOnEscape(value: boolean);
            public get isRichTextEditingAllowed(): boolean;
            public set isRichTextEditingAllowed(value: boolean);
            public get contentType(): TMPro.TMP_InputField.ContentType;
            public set contentType(value: TMPro.TMP_InputField.ContentType);
            public get lineType(): TMPro.TMP_InputField.LineType;
            public set lineType(value: TMPro.TMP_InputField.LineType);
            public get lineLimit(): number;
            public set lineLimit(value: number);
            public get inputType(): TMPro.TMP_InputField.InputType;
            public set inputType(value: TMPro.TMP_InputField.InputType);
            public get touchScreenKeyboard(): UnityEngine.TouchScreenKeyboard;
            public get keyboardType(): UnityEngine.TouchScreenKeyboardType;
            public set keyboardType(value: UnityEngine.TouchScreenKeyboardType);
            public get characterValidation(): TMPro.TMP_InputField.CharacterValidation;
            public set characterValidation(value: TMPro.TMP_InputField.CharacterValidation);
            public get inputValidator(): TMPro.TMP_InputValidator;
            public set inputValidator(value: TMPro.TMP_InputValidator);
            public get readOnly(): boolean;
            public set readOnly(value: boolean);
            public get richText(): boolean;
            public set richText(value: boolean);
            public get multiLine(): boolean;
            public get asteriskChar(): number;
            public set asteriskChar(value: number);
            public get wasCanceled(): boolean;
            public get caretPosition(): number;
            public set caretPosition(value: number);
            public get selectionAnchorPosition(): number;
            public set selectionAnchorPosition(value: number);
            public get selectionFocusPosition(): number;
            public set selectionFocusPosition(value: number);
            public get stringPosition(): number;
            public set stringPosition(value: number);
            public get selectionStringAnchorPosition(): number;
            public set selectionStringAnchorPosition(value: number);
            public get selectionStringFocusPosition(): number;
            public set selectionStringFocusPosition(value: number);
            public get minWidth(): number;
            public get maxWidth(): number;
            public get preferredWidth(): number;
            public get flexibleWidth(): number;
            public get minHeight(): number;
            public get maxHeight(): number;
            public get preferredHeight(): number;
            public get flexibleHeight(): number;
            public get layoutPriority(): number;
            public SetTextWithoutNotify ($input: string) : void
            public MoveTextEnd ($shift: boolean) : void
            public MoveTextStart ($shift: boolean) : void
            public MoveToEndOfLine ($shift: boolean, $ctrl: boolean) : void
            public MoveToStartOfLine ($shift: boolean, $ctrl: boolean) : void
            public OnBeginDrag ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public OnDrag ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public OnEndDrag ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public ProcessEvent ($e: UnityEngine.Event) : void
            public OnUpdateSelected ($eventData: UnityEngine.EventSystems.BaseEventData) : void
            public OnScroll ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public ForceLabelUpdate () : void
            public Rebuild ($update: UnityEngine.UI.CanvasUpdate) : void
            public LayoutComplete () : void
            public GraphicUpdateComplete () : void
            public ActivateInputField () : void
            public OnPointerClick ($eventData: UnityEngine.EventSystems.PointerEventData) : void
            public OnControlClick () : void
            public ReleaseSelection () : void
            public DeactivateInputField ($clearSelection?: boolean) : void
            public OnSubmit ($eventData: UnityEngine.EventSystems.BaseEventData) : void
            public OnCancel ($eventData: UnityEngine.EventSystems.BaseEventData) : void
            public CalculateLayoutInputHorizontal () : void
            public CalculateLayoutInputVertical () : void
            public SetGlobalPointSize ($pointSize: number) : void
            public SetGlobalFontAsset ($fontAsset: TMPro.TMP_FontAsset) : void
        }
        class TMP_InputValidator extends UnityEngine.ScriptableObject
        {
            protected [__keep_incompatibility]: never;
        }
    }
    namespace UnityEngine.TextCore {
        enum OTL_FeatureTag
        { kern = 1801810542, liga = 1818847073, mark = 1835102827, mkmk = 1835756907 }
    }
    namespace TMPro.TMP_Text {
        interface MissingCharacterEventCallback
        { 
        (unicode: number, stringIndex: number, text: string, fontAsset: TMPro.TMP_FontAsset, textComponent: TMPro.TMP_Text) : void; 
        Invoke?: (unicode: number, stringIndex: number, text: string, fontAsset: TMPro.TMP_FontAsset, textComponent: TMPro.TMP_Text) => void;
        }
        var MissingCharacterEventCallback: { new (func: (unicode: number, stringIndex: number, text: string, fontAsset: TMPro.TMP_FontAsset, textComponent: TMPro.TMP_Text) => void): MissingCharacterEventCallback; }
    }
    namespace System.Text {
        class StringBuilder extends System.Object implements System.Runtime.Serialization.ISerializable
        {
            protected [__keep_incompatibility]: never;
        }
    }
    namespace TMPro.TMP_InputField {
        class SubmitEvent extends UnityEngine.Events.UnityEvent$1<string> implements UnityEngine.ISerializationCallbackReceiver
        {
            protected [__keep_incompatibility]: never;
        }
        class SelectionEvent extends UnityEngine.Events.UnityEvent$1<string> implements UnityEngine.ISerializationCallbackReceiver
        {
            protected [__keep_incompatibility]: never;
        }
        class TextSelectionEvent extends UnityEngine.Events.UnityEvent$3<string, number, number> implements UnityEngine.ISerializationCallbackReceiver
        {
            protected [__keep_incompatibility]: never;
        }
        class OnChangeEvent extends UnityEngine.Events.UnityEvent$1<string> implements UnityEngine.ISerializationCallbackReceiver
        {
            protected [__keep_incompatibility]: never;
            public constructor ()
        }
        class TouchScreenKeyboardEvent extends UnityEngine.Events.UnityEvent$1<UnityEngine.TouchScreenKeyboard.Status> implements UnityEngine.ISerializationCallbackReceiver
        {
            protected [__keep_incompatibility]: never;
        }
        interface OnValidateInput
        { 
        (text: string, charIndex: number, addedChar: number) : number; 
        Invoke?: (text: string, charIndex: number, addedChar: number) => number;
        }
        var OnValidateInput: { new (func: (text: string, charIndex: number, addedChar: number) => number): OnValidateInput; }
        enum ContentType
        { Standard = 0, Autocorrected = 1, IntegerNumber = 2, DecimalNumber = 3, Alphanumeric = 4, Name = 5, EmailAddress = 6, Password = 7, Pin = 8, Custom = 9 }
        enum LineType
        { SingleLine = 0, MultiLineSubmit = 1, MultiLineNewline = 2 }
        enum InputType
        { Standard = 0, AutoCorrect = 1, Password = 2 }
        enum CharacterValidation
        { None = 0, Digit = 1, Integer = 2, Decimal = 3, Alphanumeric = 4, Name = 5, Regex = 6, EmailAddress = 7, CustomValidator = 8 }
    }
    namespace UnityEngine.TouchScreenKeyboard {
        enum Status
        { Visible = 0, Done = 1, Canceled = 2, LostFocus = 3 }
    }
    namespace System.Security {
        interface IEvidenceFactory
        {
        }
    }
    namespace System.Globalization {
        class CultureInfo extends System.Object implements System.IFormatProvider, System.ICloneable
        {
            protected [__keep_incompatibility]: never;
        }
    }
}
declare module 'csharp' {
export = CS;
}

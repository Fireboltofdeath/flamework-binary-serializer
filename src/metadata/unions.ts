// This type allows us to detect types like `number & Marker` or `15 & Marker` correctly,
// by mapping the object portion of `T` onto `V`.
type Mask<V, T> = T extends object ? V & Reconstruct<T> : V;

type IsLiteral<T> = T extends undefined
	? true
	: T extends string
	? Mask<string, T> extends T
		? false
		: true
	: T extends number
	? Mask<number, T> extends T
		? false
		: true
	: T extends boolean
	? true
	: false;

export type IsUnion<T, U = T> = T extends T ? (U extends T ? never : true) : never;

type NonUnionKeys<T> = { [k in keyof T]: true extends IsUnion<T[k]> ? never : k }[keyof T];
type LiteralKeys<T> = { [k in keyof T]: true extends IsLiteral<T[k]> ? k : never }[keyof T];

// This type finds all literal keys and excludes union keys.
type DiscriminatorKeys<T> = NonUnionKeys<T> & LiteralKeys<T>;

// This type excludes discriminators that don't exist in every constituent.
type FilterSharedDiscriminators<T> = UnionToIntersection<T extends T ? [DiscriminatorKeys<T>] : never>[never];

// This type excludes discriminators whose values are not unique between all constituents.
type FilterUniqueDiscriminators<T, D extends keyof T, U extends T = T> = D extends D
	? (T extends T ? (T[D] extends Exclude<U, T>[D] ? unknown : D) : never) extends D
		? D
		: never
	: never;

export type FindDiscriminator<T> = FilterUniqueDiscriminators<T, FilterSharedDiscriminators<T>>;

export type IsDiscriminableUnion<T> = true extends IsUnion<T>
	? FindDiscriminator<T> extends never
		? false
		: true
	: false;

// This doesn't check whether T is a union, only that it is comprised of only literal values.
// The literal metadata will check for non-unions itself to optimize single literal values into zero bytes.
// We also exclude plain `boolean` here as that has a more efficient special case.
export type IsLiteralUnion<T> = [boolean, NonNullable<T>] extends [NonNullable<T>, boolean]
	? false
	: (T extends T ? (T extends undefined ? true : IsLiteral<T> extends true ? true : false) : never) extends true
	? true
	: false;

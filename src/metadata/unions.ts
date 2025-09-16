// Extract object branches from a union (excluding primitive objects)
export type ExtractObjectBranches<T> = T extends object ? (T extends boolean | number | string ? never : T) : never;

// Extract primitive branches from a union
export type ExtractPrimitiveBranches<T> = T extends boolean | number | string | undefined ? T : never;

export type FindDiscriminator<T> = FilterUniqueDiscriminators<T, FilterSharedDiscriminators<T>>;

export type IsDiscriminableUnion<T> =
	true extends IsUnion<T> ? (FindDiscriminator<T> extends never ? false : true) : false;
// This doesn't check whether T is a union, only that it is comprised of only
// literal values. The literal metadata will check for non-unions itself to
// optimize single literal values into zero bytes. We also exclude plain `boolean`
// here as that has a more efficient special case.
export type IsLiteralUnion<T> = [boolean, NonNullable<T>] extends [NonNullable<T>, boolean]
	? false
	: (T extends T ? (T extends undefined ? true : IsLiteral<T> extends true ? true : false) : never) extends true
		? true
		: false;

// Check if this is a mixed primitive|object union
export type IsNonDiscriminatedMixedUnion<T> =
	IsUnion<T> extends true
		? IsDiscriminableUnion<T> extends false
			? IsLiteralUnion<T> extends false
				? UnionHasPrimitiveAndObject<T> extends infer U
					? "primitive" extends U
						? "object" extends U
							? true
							: false
						: false
					: false
				: false
			: false
		: false;

export type IsUnion<T, U = T> = T extends T ? (U extends T ? never : true) : never;

// This type finds all literal keys and excludes union keys.
type DiscriminatorKeys<T> = LiteralKeys<T> & NonUnionKeys<T>;

// This type excludes discriminators that don't exist in every constituent.
type FilterSharedDiscriminators<T> = UnionToIntersection<T extends T ? [DiscriminatorKeys<T>] : never>[never];

// This type excludes discriminators whose values are not unique between all
// constituents.
type FilterUniqueDiscriminators<T, D extends keyof T, U extends T = T> = D extends D
	? (T extends T ? (T[D] extends Exclude<U, T>[D] ? unknown : D) : never) extends D
		? D
		: never
	: never;

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

type LiteralKeys<T> = { [k in keyof T]: true extends IsLiteral<T[k]> ? k : never }[keyof T];

// This type allows us to detect types like `number & Marker` or `15 & Marker`
// correctly, by mapping the object portion of `T` onto `V`.
type Mask<V, T> = T extends object ? Reconstruct<T> & V : V;

type NonUnionKeys<T> = { [k in keyof T]: true extends IsUnion<T[k]> ? never : k }[keyof T];

// Helper to detect if a union has both primitive and object types
type UnionHasPrimitiveAndObject<T> = T extends T
	? T extends boolean | number | string
		? "primitive"
		: T extends object
			? "object"
			: "other"
	: never;

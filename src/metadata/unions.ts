type ToSharedValues<T> = UnionToIntersection<T extends T ? [T[keyof T]] : never>[never];

type IsLiteral<T> = T extends undefined
	? true
	: T extends string
	? string extends T
		? false
		: true
	: T extends number
	? number extends T
		? false
		: true
	: T extends boolean
	? true
	: false;

export type IsUnion<T, U = T> = T extends T ? (U extends T ? never : true) : never;

// This type finds all fields that are:
// 1. Shared across every constituent
// 2. Is not a union (as multiple discriminator values are not supported)
// 3. Is a literal (string, number, boolean, undefined)
type FindPossibleDiscriminators<T> = ToSharedValues<
	T extends T
		? {
				[k in keyof T]-?: true extends IsUnion<T[k]> ? never : true extends IsLiteral<T[k]> ? k : never;
		  }
		: never
>;

// This type excludes discriminators whose values are not unique between all constituents.
type FilterUniqueDiscriminators<T, D extends keyof T, U extends T = T> = D extends D
	? (T extends T ? (T[D] extends Exclude<U, T>[D] ? unknown : D) : never) extends D
		? D
		: never
	: never;

export type FindDiscriminator<T> = FilterUniqueDiscriminators<T, FindPossibleDiscriminators<T>>;

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

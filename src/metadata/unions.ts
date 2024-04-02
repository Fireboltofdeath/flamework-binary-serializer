type FilterNever<T> = { [k in { [k in keyof T]: T[k] extends never ? never : k }[keyof T]]: T[k] };

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

export type FindDiscriminator<T> = keyof T &
	keyof (T extends T
		? FilterNever<{ [k in keyof T]: T[k] extends string ? (string extends T[k] ? never : k) : never }>
		: never);

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

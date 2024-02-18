type IsUnion<T, U = T> = T extends T ? (U extends T ? never : true) : never;
type FilterNever<T> = T extends T
	? { [k in { [k in keyof T]: T[k] extends never ? never : k }[keyof T]]: T[k] }
	: never;

export type FindDiscriminator<T> = keyof T &
	keyof FilterNever<
		T extends T ? { [k in keyof T]: T[k] extends string ? (string extends T[k] ? never : k) : never } : never
	>;

export type IsDiscriminableUnion<T> = true extends IsUnion<T>
	? FindDiscriminator<T> extends never
		? false
		: true
	: false;

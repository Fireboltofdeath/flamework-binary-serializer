type Length<T> = T extends { length: infer N extends number } ? N : never;

export type RestType<T extends unknown[]> = T[9e99];
export type HasRest<T extends unknown[]> = RestType<T> extends undefined ? false : true;

// This is a somewhat expensive type, so we only rebuild the tuple if we know `T` has a rest element.
export type SplitRest<T extends unknown[], Acc extends unknown[] = []> = HasRest<T> extends true
	? [...Acc, ...RestType<T>[]] extends T
		? Acc
		: SplitRest<T, [...Acc, T[Length<Acc>]]>
	: T;

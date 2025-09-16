export type HasRest<T extends Array<unknown>> = RestType<T> extends undefined ? false : true;

export type RestType<T extends Array<unknown>> = T[9e99];
// This is a somewhat expensive type, so we only rebuild the tuple if we know `T`
// has a rest element.
export type SplitRest<T extends Array<unknown>, Accumulator extends Array<unknown> = []> =
	HasRest<T> extends true
		? [...Accumulator, ...Array<RestType<T>>] extends T
			? Accumulator
			: SplitRest<T, [...Accumulator, T[Length<Accumulator>]]>
		: T;

type Length<T> = T extends { length: infer N extends number } ? N : never;

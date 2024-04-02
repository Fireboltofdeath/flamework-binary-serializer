import { FindDiscriminator, IsDiscriminableUnion, IsLiteralUnion, type IsUnion } from "./unions";
import { HasRest, RestType, SplitRest } from "./tuples";

type IsNumber<T, K extends string> = `_${K}` extends keyof T ? true : false;
type HasNominal<T> = T extends T ? (T extends `_nominal_${string}` ? true : never) : never;

/**
 * Generates the metadata for arrays and tuples.
 */
type ArrayMetadata<T extends unknown[]> = [T] extends [{ length: number }]
	? [
			"tuple",
			SplitRest<T> extends infer A ? { [k in keyof A]: SerializerMetadata<A[k]> } : never,
			HasRest<T> extends true ? SerializerMetadata<RestType<T>> : undefined,
	  ]
	: ["array", SerializerMetadata<T[number]>];

/**
 * This is the metadata expected by the `createSerializer` function.
 *
 * This can be used in your own user macros to generate serializers for arbitrary types, such as for a networking library.
 */
export type SerializerMetadata<T> = IsLiteralUnion<T> extends true
	? ["literal", NonNullable<T>[], true extends IsUnion<T> ? false : true]
	: unknown extends T
	? ["optional", ["blob"]]
	: undefined extends T
	? ["optional", SerializerMetadata<NonNullable<T>>]
	: IsNumber<T, "f64"> extends true
	? ["f64"]
	: IsNumber<T, "f32"> extends true
	? ["f32"]
	: IsNumber<T, "u8"> extends true
	? ["u8"]
	: IsNumber<T, "u16"> extends true
	? ["u16"]
	: IsNumber<T, "u32"> extends true
	? ["u32"]
	: IsNumber<T, "i8"> extends true
	? ["i8"]
	: IsNumber<T, "i16"> extends true
	? ["i16"]
	: IsNumber<T, "i32"> extends true
	? ["i32"]
	: [T] extends [boolean]
	? ["boolean"]
	: [T] extends [number]
	? ["f64"]
	: [T] extends [string]
	? ["string"]
	: [T] extends [Vector3]
	? ["vector"]
	: [T] extends [unknown[]]
	? ArrayMetadata<T>
	: [T] extends [ReadonlyMap<infer K, infer V>]
	? ["map", SerializerMetadata<K>, SerializerMetadata<V>]
	: [T] extends [ReadonlySet<infer V>]
	? ["set", SerializerMetadata<V>]
	: IsDiscriminableUnion<T> extends true
	? [
			"union",
			FindDiscriminator<T>,
			FindDiscriminator<T> extends infer D
				? (T extends T ? [T[D & keyof T], SerializerMetadata<Omit<T, D & keyof T>>] : never)[]
				: never,
	  ]
	: true extends HasNominal<keyof T>
	? ["blob"]
	: T extends object
	? [
			"object_raw",
			{
				[k in keyof T]-?: [k, SerializerMetadata<T[k]>];
			}[keyof T][],
	  ]
	: ["blob"];

/**
 * This type is essentially a union of all possible values that `SerializerMetadata` can emit.
 *
 * This is necessary due to a TS bug that causes parts of the conditional types to get lost.
 * This may not be necessary when we upgrade to TS 5.4 due to improvements in how TypeScript treats conditional types in such cases.
 */
export type SerializerData =
	| ["f32"]
	| ["f64"]
	| ["u8"]
	| ["u16"]
	| ["u32"]
	| ["i8"]
	| ["i16"]
	| ["i32"]
	| ["boolean"]
	| ["string"]
	| ["vector"]
	| ["object", Array<string | SerializerData>, object]
	| ["object_raw", [string, SerializerData][]]
	| ["union", string, [unknown, SerializerData][]]
	| ["array", SerializerData]
	| ["tuple", SerializerData[], SerializerData | undefined]
	| ["map", SerializerData, SerializerData]
	| ["set", SerializerData]
	| ["optional", SerializerData]
	| ["literal", defined[], boolean]
	| ["blob"];

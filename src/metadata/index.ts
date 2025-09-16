import type { HasRest, RestType, SplitRest } from "./tuples";
import type {
	ExtractObjectBranches,
	ExtractPrimitiveBranches,
	FindDiscriminator,
	IsDiscriminableUnion,
	IsLiteralUnion,
	IsNonDiscriminatedMixedUnion,
	IsUnion,
} from "./unions";

/**
 * This type is essentially a union of all possible values that
 * `SerializerMetadata` can emit.
 *
 * This is necessary due to a TS bug that causes parts of the conditional types
 * to get lost. This may not be necessary when we upgrade to TS 5.4 due to
 * improvements in how TypeScript treats conditional types in such cases.
 */
export type SerializerData =
	| ["array", SerializerData]
	| ["blob"]
	| ["boolean"]
	| ["enum", string]
	| ["f32"]
	| ["f64"]
	| ["i8"]
	| ["i16"]
	| ["i32"]
	| ["literal", Array<defined>, number]
	| ["map", SerializerData, SerializerData]
	| ["mixed_union", [SerializerData, SerializerData]]
	| ["object", Array<SerializerData | string>, object]
	| ["object_raw", Array<[string, SerializerData]>]
	| ["optional", SerializerData]
	| ["packed", SerializerData]
	| ["set", SerializerData]
	| ["string"]
	| ["tuple", Array<SerializerData>, SerializerData | undefined]
	| ["u8"]
	| ["u16"]
	| ["u32"]
	| ["union", string, Array<[unknown, SerializerData]>, number]
	| ["vector"]
	| { [k in keyof DataTypes]: [k] }[keyof DataTypes];

/**
 * Metadata describing how to serialize a type `T`.
 *
 * This is the metadata expected by the `createSerializer` function.
 * It encodes the serialization strategy for `T` so user macros can generate
 * serializers for arbitrary types (for example, to send over the network).
 *
 * @template T - The TypeScript type being described by this metadata.
 */
export type SerializerMetadata<T> =
	IsLiteralUnion<T> extends true
		? ["literal", Array<NonNullable<T>>, true extends IsUnion<T> ? (undefined extends T ? 1 : 0) : -1]
		: unknown extends T
			? ["optional", ["blob"]]
			: ["_packed", T] extends [keyof T, { _packed?: [infer V] }]
				? ["packed", SerializerMetadata<V>]
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
																	: [T] extends [EnumItem]
																		? ["enum", GetEnumType<T>]
																		: [T] extends [DataTypes[keyof DataTypes]]
																			? [ExtractKeys<DataTypes, T>]
																			: [T] extends [Array<unknown>]
																				? ArrayMetadata<T>
																				: [T] extends [
																							ReadonlyMap<
																								infer K,
																								infer V
																							>,
																					  ]
																					? [
																							"map",
																							SerializerMetadata<K>,
																							SerializerMetadata<V>,
																						]
																					: [T] extends [ReadonlySet<infer V>]
																						? ["set", SerializerMetadata<V>]
																						: IsDiscriminableUnion<T> extends true
																							? [
																									"union",
																									FindDiscriminator<T>,
																									FindDiscriminator<T> extends infer D
																										? Array<
																												T extends T
																													? [
																															T[D &
																																keyof T],
																															SerializerMetadata<
																																Omit<
																																	T,
																																	D &
																																		keyof T
																																>
																															>,
																														]
																													: never
																											>
																										: never,
																									-1, // This is the byte size length. This is annoying (and slow) to calculate in TS, so it's done at runtime.
																								]
																							: IsNonDiscriminatedMixedUnion<T> extends true
																								? [
																										"mixed_union",
																										[
																											SerializerMetadata<
																												ExtractPrimitiveBranches<T>
																											>,
																											SerializerMetadata<
																												ExtractObjectBranches<T>
																											>,
																										],
																									]
																								: true extends HasNominal<
																											keyof T
																									  >
																									? ["blob"]
																									: T extends object
																										? [
																												"object_raw",
																												Array<
																													{
																														[k in keyof T]-?: [
																															k,
																															SerializerMetadata<
																																T[k]
																															>,
																														];
																													}[keyof T]
																												>,
																											]
																										: [T] extends [
																													number,
																											  ]
																											? ["f64"]
																											: [
																														T,
																												  ] extends [
																														string,
																												  ]
																												? [
																														"string",
																													]
																												: [
																															T,
																													  ] extends [
																															boolean,
																													  ]
																													? [
																															"boolean",
																														]
																													: [
																															"blob",
																														];

/**
 * Generates the metadata for arrays and tuples.
 *
 * For fixed-length tuple-like arrays this produces a `tuple` metadata entry
 * including per-element metadata and an optional rest-type metadata.
 * For regular (dynamic-length) arrays this produces an `array` metadata
 * entry for the element type.
 *
 * @template T - The array or tuple type to generate metadata for.
 */
type ArrayMetadata<T extends Array<unknown>> = [T] extends [{ length: number }]
	? [
			"tuple",
			SplitRest<T> extends infer A ? { [k in keyof A]: SerializerMetadata<A[k]> } : never,
			HasRest<T> extends true ? SerializerMetadata<RestType<T>> : undefined,
		]
	: ["array", SerializerMetadata<T[number]>];

/**
 * A shortcut for defining Roblox datatypes (which map directly to a simple
 * type.).
 *
 * This may in the future be used to reduce the number of branches inside the
 * serializer.
 */
interface DataTypes {
	cframe: CFrame;
	color3: Color3;
	colorsequence: ColorSequence;
	numbersequence: NumberSequence;
}

type GetEnumType<T> = [T] extends [EnumItem] ? ExtractKeys<Enums, T["EnumType"]> : never;
type HasNominal<T> = T extends T ? (T extends `_nominal_${string}` ? true : never) : never;
type IsNumber<T, K extends string> = `_${K}` extends keyof T ? true : false;

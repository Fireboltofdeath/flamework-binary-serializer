//!optimize 2
import { Modding } from "@flamework/core";
import { FindDiscriminator, IsDiscriminableUnion, IsLiteralUnion } from "./unions";
import { HasRest, RestType, SplitRest } from "./tuples";

type IsNumber<T, K extends string> = `_${K}` extends keyof T ? true : false;
type HasNominal<T> = T extends T ? (T extends `_nominal_${string}` ? true : never) : never;

/**
 * This namespace includes additional types that can be used in the binary serializer.
 */
export namespace DataType {
	export type f32 = number & { _f32?: never };
	export type f64 = number & { _f64?: never };

	export type u8 = number & { _u8?: never };
	export type u16 = number & { _u16?: never };
	export type u32 = number & { _u32?: never };

	export type i8 = number & { _i8?: never };
	export type i16 = number & { _i16?: never };
	export type i32 = number & { _i32?: never };
}

/**
 * A binary serializer.
 */
export interface Serializer<T> {
	/**
	 * Serializes the input into a buffer.
	 *
	 * Result includes a blobs array which is used for things that cannot be put into the buffer.
	 * The blobs array can be sent across the network or otherwise stored and passed into the deserialize function.
	 */
	serialize: (value: T) => { buffer: buffer; blobs: defined[] };

	/**
	 * Deserializes the input back into `T`.
	 *
	 * The blobs array can be omitted, but if the buffer contains blob references then deserialization will error.
	 */
	deserialize: (input: buffer, inputBlobs?: defined[]) => T;
}

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
	? ["literal", NonNullable<T>[]]
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

type SerializerData =
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
	| ["literal", defined[]]
	| ["blob"];

function optimizeSerializerData(data: SerializerData): SerializerData {
	if (data[0] === "object_raw") {
		// We transform objects as an array of tuples, but this is slow to iterate over.
		// We flatten the raw generated metadata into a single array, which can be iterated much quicker.
		// We also create a preallocated object that we can clone as we already know the structure ahead of time.
		const preallocation = new Set<string>();
		const transformed = new Array<string | SerializerData>();
		for (const [key, meta] of data[1]) {
			transformed.push(key, optimizeSerializerData(meta));
			preallocation.add(key);
		}
		data = ["object", transformed, preallocation];
	} else if (data[0] === "array" || data[0] === "optional" || data[0] === "set") {
		data = [data[0], optimizeSerializerData(data[1])];
	} else if (data[0] === "union") {
		data = [
			data[0],
			data[1],
			data[2].map(([key, data]): [unknown, SerializerData] => [key, optimizeSerializerData(data)]),
		];
	} else if (data[0] === "map") {
		data = [data[0], optimizeSerializerData(data[1]), optimizeSerializerData(data[2])];
	} else if (data[0] === "tuple") {
		data = [data[0], data[1].map(optimizeSerializerData), data[2] ? optimizeSerializerData(data[2]) : undefined];
	}

	return data;
}

function createSerializer<T>(meta: SerializerData) {
	let currentSize = 2 ** 8;
	let buf = buffer.create(currentSize);
	let offset!: number;
	let blobs!: defined[];

	meta = optimizeSerializerData(meta);

	function allocate(size: number) {
		offset += size;

		if (offset > currentSize) {
			const newSize = 2 ** math.ceil(math.log(offset) / math.log(2));
			const oldBuffer = buf;

			currentSize = newSize;
			buf = buffer.create(newSize);
			buffer.copy(buf, 0, oldBuffer);
		}
	}

	function serialize(value: unknown, meta: SerializerData) {
		const currentOffset = offset;
		const kind = meta[0];
		if (kind === "f32") {
			allocate(4);
			buffer.writef32(buf, currentOffset, value as number);
		} else if (kind === "f64") {
			allocate(8);
			buffer.writef64(buf, currentOffset, value as number);
		} else if (kind === "u8") {
			allocate(1);
			buffer.writeu8(buf, currentOffset, value as number);
		} else if (kind === "u16") {
			allocate(2);
			buffer.writeu16(buf, currentOffset, value as number);
		} else if (kind === "u32") {
			allocate(4);
			buffer.writeu32(buf, currentOffset, value as number);
		} else if (kind === "i8") {
			allocate(1);
			buffer.writei8(buf, currentOffset, value as number);
		} else if (kind === "i16") {
			allocate(2);
			buffer.writei16(buf, currentOffset, value as number);
		} else if (kind === "i32") {
			allocate(4);
			buffer.writei32(buf, currentOffset, value as number);
		} else if (kind === "boolean") {
			allocate(1);
			buffer.writeu8(buf, currentOffset, value === true ? 1 : 0);
		} else if (kind === "string") {
			const size = (value as string).size();
			allocate(4 + size);
			buffer.writeu32(buf, currentOffset, size);
			buffer.writestring(buf, currentOffset + 4, value as string);
		} else if (kind === "vector") {
			allocate(12);
			buffer.writef32(buf, currentOffset, (value as Vector3).X);
			buffer.writef32(buf, currentOffset + 4, (value as Vector3).Y);
			buffer.writef32(buf, currentOffset + 8, (value as Vector3).Z);
		} else if (kind === "object") {
			const elements = meta[1];
			for (const i of $range(1, elements.size(), 2)) {
				serialize((value as Record<string, unknown>)[elements[i - 1] as string], elements[i] as SerializerData);
			}
		} else if (kind === "array") {
			const serializer = meta[1];
			allocate(4);

			buffer.writeu32(buf, currentOffset, (value as unknown[]).size());

			for (const element of value as unknown[]) {
				serialize(element, serializer);
			}
		} else if (kind === "tuple") {
			const elements = meta[1];
			const restSerializer = meta[2];
			const size = (value as unknown[]).size();

			// We serialize the rest element length first so that the deserializer can allocate accordingly.
			if (restSerializer) {
				allocate(4);
				buffer.writeu32(buf, currentOffset, size - elements.size());
			}

			for (const i of $range(1, size)) {
				const serializer = elements[i - 1] ?? restSerializer;
				if (serializer) {
					serialize((value as unknown[])[i - 1], serializer);
				}
			}
		} else if (kind === "map") {
			const keySerializer = meta[1];
			const valueSerializer = meta[2];
			allocate(4);

			let size = 0;
			for (const [elementIndex, elementValue] of value as Map<unknown, unknown>) {
				size += 1;
				serialize(elementIndex, keySerializer);
				serialize(elementValue, valueSerializer);
			}

			// We already allocated this space before serializing the map, so this is safe.
			buffer.writeu32(buf, currentOffset, size);
		} else if (kind === "set") {
			// We could just generate `Map<V, true>` for sets, but this is more efficient as it omits serializing a boolean per value.
			const valueSerializer = meta[1];
			allocate(4);

			let size = 0;
			for (const elementValue of value as Set<unknown>) {
				size += 1;
				serialize(elementValue, valueSerializer);
			}

			// We already allocated this space before serializing the set, so this is safe.
			buffer.writeu32(buf, currentOffset, size);
		} else if (kind === "optional") {
			allocate(1);
			if (value !== undefined) {
				buffer.writeu8(buf, currentOffset, 1);
				serialize(value, meta[1]);
			} else {
				buffer.writeu8(buf, currentOffset, 0);
			}
		} else if (kind === "union") {
			allocate(1);

			const tagName = meta[1];
			const tagged = meta[2];
			const objectTag = (value as Map<unknown, unknown>).get(tagName);

			let tagIndex = 0;
			for (const i of $range(1, tagged.size())) {
				if (tagged[i - 1][0] === objectTag) {
					tagIndex = i - 1;
					break;
				}
			}

			buffer.writeu8(buf, currentOffset, tagIndex);

			serialize(value, tagged[tagIndex][1]);
		} else if (kind === "literal") {
			const literals = meta[1];
			const index = literals.indexOf(value as defined);
			allocate(1);

			// We support `undefined` as a literal, but `indexOf` will actually return -1
			// This is fine, though, as -1 will serialize as 255 which is guarantee to be undefined with the 8 bit size limit.
			buffer.writeu8(buf, currentOffset, index);
		} else if (kind === "blob") {
			// Value will always be defined because if it isn't, it will be wrapped in `optional`
			blobs.push(value!);
		} else {
			error(`unexpected kind: ${kind}`);
		}
	}

	return (value: T) => {
		offset = 0;
		blobs = [];
		serialize(value, meta);

		const trim = buffer.create(offset);
		buffer.copy(trim, 0, buf, 0, offset);

		return {
			buffer: trim,
			blobs: blobs,
		};
	};
}

function createDeserializer<T>(meta: SerializerData) {
	let buf!: buffer;
	let offset!: number;
	let blobs: defined[] | undefined;
	let blobIndex = 0;

	meta = optimizeSerializerData(meta);

	function deserialize(meta: SerializerData): unknown {
		const currentOffset = offset;
		const kind = meta[0];
		if (kind === "f32") {
			offset += 4;
			return buffer.readf32(buf, currentOffset);
		} else if (kind === "f64") {
			offset += 8;
			return buffer.readf64(buf, currentOffset);
		} else if (kind === "u8") {
			offset += 1;
			return buffer.readu8(buf, currentOffset);
		} else if (kind === "u16") {
			offset += 2;
			return buffer.readu16(buf, currentOffset);
		} else if (kind === "u32") {
			offset += 4;
			return buffer.readu32(buf, currentOffset);
		} else if (kind === "i8") {
			offset += 1;
			return buffer.readi8(buf, currentOffset);
		} else if (kind === "i16") {
			offset += 2;
			return buffer.readi16(buf, currentOffset);
		} else if (kind === "i32") {
			offset += 4;
			return buffer.readi32(buf, currentOffset);
		} else if (kind === "boolean") {
			offset += 1;
			return buffer.readu8(buf, currentOffset) === 1;
		} else if (kind === "string") {
			const length = buffer.readu32(buf, currentOffset);
			offset += 4 + length;

			return buffer.readstring(buf, currentOffset + 4, length);
		} else if (kind === "vector") {
			offset += 12;

			return new Vector3(
				buffer.readf32(buf, currentOffset),
				buffer.readf32(buf, currentOffset + 4),
				buffer.readf32(buf, currentOffset + 8),
			);
		} else if (kind === "object") {
			const elements = meta[1];
			const obj = table.clone(meta[2]) as Map<unknown, unknown>;
			for (const i of $range(1, elements.size(), 2)) {
				(obj as never as Record<string, unknown>)[elements[i - 1] as string] = deserialize(
					elements[i] as SerializerData,
				);
			}
			return obj;
		} else if (kind === "array") {
			const deserializer = meta[1];
			const length = buffer.readu32(buf, currentOffset);
			const array = new Array<defined>(length);
			offset += 4;

			for (const i of $range(1, length)) {
				array.push(deserialize(deserializer)!);
			}

			return array;
		} else if (kind === "tuple") {
			const elements = meta[1];
			const restDeserializer = meta[2];

			let restLength = 0;
			if (restDeserializer) {
				offset += 4;
				restLength = buffer.readu32(buf, currentOffset);
			}

			const tuple = new Array<defined>(elements.size() + restLength);

			for (const element of elements) {
				tuple.push(deserialize(element) as defined);
			}

			if (restDeserializer) {
				for (const _ of $range(1, restLength)) {
					tuple.push(deserialize(restDeserializer) as defined);
				}
			}

			return tuple;
		} else if (kind === "map") {
			const keyDeserializer = meta[1];
			const valueDeserializer = meta[2];
			const length = buffer.readu32(buf, currentOffset);
			const map = new Map<unknown, unknown>();
			offset += 4;

			for (const i of $range(1, length)) {
				map.set(deserialize(keyDeserializer), deserialize(valueDeserializer));
			}

			return map;
		} else if (kind === "set") {
			const valueDeserializer = meta[1];
			const length = buffer.readu32(buf, currentOffset);
			const set = new Set<unknown>();
			offset += 4;

			for (const i of $range(1, length)) {
				set.add(deserialize(valueDeserializer));
			}

			return set;
		} else if (kind === "optional") {
			offset += 1;
			return buffer.readu8(buf, currentOffset) === 1 ? deserialize(meta[1]) : undefined;
		} else if (kind === "union") {
			offset += 1;

			const tagIndex = buffer.readu8(buf, currentOffset);
			const tag = meta[2][tagIndex];
			const object = deserialize(tag[1]);
			(object as Record<string, unknown>)[meta[1]] = tag[0];

			return object;
		} else if (kind === "literal") {
			offset += 1;
			return meta[1][buffer.readu8(buf, currentOffset)];
		} else if (kind === "blob") {
			blobIndex++;
			return blobs![blobIndex - 1];
		} else {
			error(`unexpected kind: ${kind}`);
		}
	}

	return (input: buffer, inputBlobs?: defined[]) => {
		blobs = inputBlobs;
		buf = input;
		offset = 0;
		blobIndex = 0;
		return deserialize(meta) as T;
	};
}

/**
 * Creates a binary serializer automatically from a given type.
 *
 * This generates the {@link SerializerMetadata} type,
 * which you can reuse in your own user macros to generate arbitrary serializers (e.g for a networking library.)
 *
 * Disclaimer: this serializer depends on the order of emit, but this isn't guaranteed to be stable across compiles.
 * This means two binary serializers for the type `T` may be incompatible,
 * if they're not created within the same TS file (and thereof might not be compiled at the same time.)
 *
 * @metadata macro
 */
export function createBinarySerializer<T>(meta?: Modding.Many<SerializerMetadata<T>>): Serializer<T> {
	return {
		serialize: createSerializer(meta as never),
		deserialize: createDeserializer(meta as never),
	};
}

import { Modding } from "@flamework/core";
import type { SerializerData, SerializerMetadata } from "./metadata";
import { createSerializer } from "./serialization/createSerializer";
import { createDeserializer } from "./serialization/createDeserializer";

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
	const optimized = optimizeSerializerData(meta as never);
	return {
		serialize: createSerializer(optimized),
		deserialize: createDeserializer(optimized),
	};
}

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
			data[2].size() <= 256 ? 1 : 2,
		];
	} else if (data[0] === "map") {
		data = [data[0], optimizeSerializerData(data[1]), optimizeSerializerData(data[2])];
	} else if (data[0] === "tuple") {
		data = [data[0], data[1].map(optimizeSerializerData), data[2] ? optimizeSerializerData(data[2]) : undefined];
	} else if (data[0] === "literal") {
		// Since `undefined` is not included in the size of `data[1]`,
		// we add the existing value of `data[3]` (which is 1 if undefined is in the union) to `data[1]`
		// to determine the final required size.
		// A size of -1 means this isn't a union.
		data = [data[0], data[1], data[2] === -1 ? 0 : data[2] + data[1].size() <= 256 ? 1 : 2];
	} else if (data[0] === "packed") {
		data = [data[0], data[1], optimizeSerializerData(data[2]), math.ceil(data[1].size() / 8)];
	}

	return data;
}

import type { Modding } from "@flamework/core";

import type { SerializerMetadata } from "./metadata";
import { processSerializerData } from "./processSerializerData";
import { createDeserializer } from "./serialization/createDeserializer";
import { createSerializer } from "./serialization/createSerializer";

export interface Serialized {
	readonly blobs: Array<defined>;
	readonly buffer: buffer;
}

/**
 * A binary serializer for a type `T`.
 *
 * @template T - The type serialized/deserialized by this serializer.
 */
export interface Serializer<T> {
	/**
	 * Deserializes the input back into `T`.
	 *
	 * The blobs array can be omitted, but if the buffer contains blob references
	 * then deserialization will error.
	 */
	readonly deserialize: (input: buffer, inputBlobs?: Array<defined>) => T;

	/**
	 * Serializes the input into a buffer.
	 *
	 * Result includes a blobs array which is used for things that cannot be put
	 * into the buffer. The blobs array can be sent across the network or
	 * otherwise stored and passed into the deserialize function.
	 */
	readonly serialize: (value: T) => Serialized;
}

/**
 * Creates a binary serializer automatically from a given type.
 *
 * This generates the {@link SerializerMetadata} type, which you can reuse in
 * your own user macros to generate arbitrary serializers (for example, for a
 * networking library).
 *
 * Disclaimer: this serializer depends on the order of emit, which may not be
 * stable across separate compilation units. Two serializers for the same type
 * `T` produced in different files may be incompatible.
 *
 * @template T - The TypeScript type to create a serializer for.
 * @param meta - Optional precomputed metadata or macro argument used to
 *   construct the serializer. When omitted, metadata will be inferred.
 * @returns A `Serializer<T>` that can serialize and deserialize values of
 *   type `T`.
 * @metadata macro
 */
export function createBinarySerializer<T>(meta?: Modding.Many<SerializerMetadata<T>>): Serializer<T> {
	const processed = processSerializerData(meta as never);
	return {
		deserialize: createDeserializer(processed),
		serialize: createSerializer(processed),
	};
}

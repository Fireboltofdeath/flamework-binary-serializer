import { Modding } from "@flamework/core";
import type { SerializerMetadata } from "./metadata";
import { createSerializer } from "./serialization/createSerializer";
import { createDeserializer } from "./serialization/createDeserializer";
import { processSerializerData } from "./processSerializerData";

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
	const processed = processSerializerData(meta as never);
	return {
		serialize: createSerializer(processed),
		deserialize: createDeserializer(processed),
	};
}

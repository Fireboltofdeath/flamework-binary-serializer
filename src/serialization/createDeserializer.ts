//!native
//!optimize 2
import type { SerializerData } from "../metadata";

export function createDeserializer<T>(meta: SerializerData) {
	let buf!: buffer;
	let offset!: number;
	let blobs: defined[] | undefined;
	let blobIndex = 0;

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
			const byteSize = meta[3];
			const tagIndex = byteSize === 1 ? buffer.readu8(buf, currentOffset) : buffer.readu16(buf, currentOffset);
			offset += byteSize;

			const tag = meta[2][tagIndex];
			const object = deserialize(tag[1]);
			(object as Record<string, unknown>)[meta[1]] = tag[0];

			return object;
		} else if (kind === "literal") {
			const literals = meta[1];
			const byteSize = meta[2];
			if (byteSize === 1) {
				offset += 1;
				return literals[buffer.readu8(buf, currentOffset)];
			} else if (byteSize === 2) {
				offset += 2;
				return literals[buffer.readu16(buf, currentOffset)];
			} else {
				return literals[0];
			}
		} else if (kind === "blob") {
			blobIndex++;
			return blobs![blobIndex - 1];
		} else if (kind === "packed") {
			const bitfields = meta[1];
			const objectType = meta[2];
			const bytes = meta[3];
			offset += bytes;

			// We already moved the offset to the right, so we can do this to get access to an object to write to.
			const object = deserialize(objectType);
			const bitfieldCount = bitfields.size();

			for (const byte of $range(0, bytes - 1)) {
				const currentByte = buffer.readu8(buf, currentOffset + byte);

				for (const bit of $range(0, math.min(7, bitfieldCount - byte * 8 - 1))) {
					const value = (currentByte >>> bit) % 2 === 1;
					(object as Record<string, boolean>)[bitfields[bit + byte * 8]] = value;
				}
			}

			return object;
		} else if (kind === "cframe") {
			offset += 4 * 6;

			const position = new Vector3(
				buffer.readf32(buf, currentOffset),
				buffer.readf32(buf, currentOffset + 4),
				buffer.readf32(buf, currentOffset + 8),
			);

			const rotation = new Vector3(
				buffer.readf32(buf, currentOffset + 12),
				buffer.readf32(buf, currentOffset + 16),
				buffer.readf32(buf, currentOffset + 20),
			);

			return CFrame.fromAxisAngle(rotation.Unit, rotation.Magnitude).add(position);
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

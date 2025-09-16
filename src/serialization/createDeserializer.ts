//!native
//!optimize 2

import { AXIS_ALIGNED_ORIENTATIONS } from "../constants";
import type { SerializerData } from "../metadata";
import type { ProcessedSerializerData } from "../processSerializerData";

export function createDeserializer<T>(
	info: ProcessedSerializerData,
): (input: buffer, inputBlobs?: Array<defined>) => T {
	const bits = table.create<boolean>(math.ceil(info.minimumPackedBits / 8) * 8);
	let bitIndex = 0;
	let buf!: buffer;
	let offset!: number;
	let blobs: Array<defined> | undefined;
	let blobIndex = 0;
	let packing = false;

	function deserialize(meta: SerializerData): unknown {
		const currentOffset = offset;
		const kind = meta[0];
		if (kind === "f32") {
			offset += 4;
			return buffer.readf32(buf, currentOffset);
		}
		if (kind === "f64") {
			offset += 8;
			return buffer.readf64(buf, currentOffset);
		}
		if (kind === "u8") {
			offset += 1;
			return buffer.readu8(buf, currentOffset);
		}
		if (kind === "u16") {
			offset += 2;
			return buffer.readu16(buf, currentOffset);
		}
		if (kind === "u32") {
			offset += 4;
			return buffer.readu32(buf, currentOffset);
		}
		if (kind === "i8") {
			offset += 1;
			return buffer.readi8(buf, currentOffset);
		}
		if (kind === "i16") {
			offset += 2;
			return buffer.readi16(buf, currentOffset);
		}
		if (kind === "i32") {
			offset += 4;
			return buffer.readi32(buf, currentOffset);
		}
		if (kind === "boolean" && packing) {
			bitIndex += 1;
			return bits[bitIndex - 1];
		}
		if (kind === "boolean") {
			offset += 1;
			return buffer.readu8(buf, currentOffset) === 1;
		}
		if (kind === "string") {
			const length = buffer.readu32(buf, currentOffset);
			offset += 4 + length;

			return buffer.readstring(buf, currentOffset + 4, length);
		}
		if (kind === "vector") {
			offset += 12;

			return new Vector3(
				buffer.readf32(buf, currentOffset),
				buffer.readf32(buf, currentOffset + 4),
				buffer.readf32(buf, currentOffset + 8),
			);
		}
		if (kind === "object") {
			const elements = meta[1];
			const object = table.clone(meta[2]) as Map<unknown, unknown>;
			for (const index of $range(1, elements.size(), 2)) {
				(object as never as Record<string, unknown>)[elements[index - 1] as string] = deserialize(
					elements[index] as SerializerData,
				);
			}
			return object;
		}
		if (kind === "array") {
			const deserializer = meta[1];
			const length = buffer.readu32(buf, currentOffset);
			const array = new Array<defined>(length);
			offset += 4;

			// eslint-disable-next-line shopify/prefer-module-scope-constants -- not one.
			for (const _ of $range(1, length)) array.push(deserialize(deserializer)!);

			return array;
		}
		if (kind === "tuple") {
			const [, elements, restDeserializer] = meta;

			let restLength = 0;
			if (restDeserializer) {
				offset += 4;
				restLength = buffer.readu32(buf, currentOffset);
			}

			const tuple = new Array<defined>(elements.size() + restLength);

			for (const element of elements) tuple.push(deserialize(element) as defined);

			if (restDeserializer) {
				// eslint-disable-next-line shopify/prefer-module-scope-constants -- not one.
				for (const _ of $range(1, restLength)) tuple.push(deserialize(restDeserializer) as defined);
			}

			return tuple;
		}
		if (kind === "map") {
			const [, keyDeserializer, valueDeserializer] = meta;
			const length = buffer.readu32(buf, currentOffset);
			const map = new Map<unknown, unknown>();
			offset += 4;

			// eslint-disable-next-line shopify/prefer-module-scope-constants -- not one.
			for (const _ of $range(1, length)) map.set(deserialize(keyDeserializer), deserialize(valueDeserializer));

			return map;
		}
		if (kind === "set") {
			const valueDeserializer = meta[1];
			const length = buffer.readu32(buf, currentOffset);
			const set = new Set<unknown>();
			offset += 4;

			// eslint-disable-next-line shopify/prefer-module-scope-constants -- not one.
			for (const _ of $range(1, length)) set.add(deserialize(valueDeserializer));
			return set;
		}
		if (kind === "optional" && packing) {
			bitIndex += 1;
			return bits[bitIndex - 1] ? deserialize(meta[1]) : undefined;
		}
		if (kind === "optional") {
			offset += 1;
			return buffer.readu8(buf, currentOffset) === 1 ? deserialize(meta[1]) : undefined;
		}
		if (kind === "union") {
			const byteSize = meta[3];

			let tagIndex;
			if (byteSize === 1) {
				offset += 1;
				tagIndex = buffer.readu8(buf, currentOffset);
			} else if (byteSize === 2) {
				offset += 2;
				tagIndex = buffer.readu16(buf, currentOffset);
			} else {
				bitIndex += 1;
				tagIndex = bits[bitIndex - 1] ? 0 : 1;
			}

			const tag = meta[2][tagIndex];
			const object = deserialize(tag[1]);
			(object as Record<string, unknown>)[meta[1]] = tag[0];

			return object;
		}
		if (kind === "literal") {
			const [, literals, byteSize] = meta;
			if (byteSize === 1) {
				offset += 1;
				return literals[buffer.readu8(buf, currentOffset)];
			}
			if (byteSize === 2) {
				offset += 2;
				return literals[buffer.readu16(buf, currentOffset)];
			}
			if (byteSize === -1) {
				bitIndex += 1;
				return bits[bitIndex - 1] ? literals[0] : literals[1];
			}
			return literals[0];
		}
		if (kind === "mixed_union") {
			const [primitiveMetadata, objectMetadata] = meta[1];

			// Read type discriminator
			const typeDiscriminator = buffer.readu8(buf, currentOffset);
			offset += 1;

			// Deserialize as object
			if (typeDiscriminator === 1) return deserialize(objectMetadata);

			// Deserialize as primitive
			return deserialize(primitiveMetadata);
		}
		if (kind === "blob") {
			blobIndex += 1;
			return blobs![blobIndex - 1];
		}
		if (kind === "packed") {
			const innerType = meta[1];
			const wasPacking = packing;
			packing = true;

			const value = deserialize(innerType);
			packing = wasPacking;

			return value;
		}
		if (kind === "enum") {
			const index = buffer.readu8(buf, currentOffset);
			offset += 1;

			return info.sortedEnums[meta[1]][index];
		}
		if (kind === "cframe" && packing) {
			bitIndex += 1;

			// This is an unoptimized CFrame.
			if (!bits[bitIndex - 1]) return deserializeCFrame();

			const packed = buffer.readu8(buf, currentOffset);
			offset += 1;

			const optimizedPosition = packed & 0x60;
			const optimizedRotation = packed & 0x1f;

			let position;
			if (optimizedPosition === 0x20) position = Vector3.zero;
			else if (optimizedPosition === 0x60) position = Vector3.one;
			else {
				position = new Vector3(
					buffer.readf32(buf, offset),
					buffer.readf32(buf, offset + 4),
					buffer.readf32(buf, offset + 8),
				);

				offset += 12;
			}

			if (optimizedRotation !== 0x1f) return AXIS_ALIGNED_ORIENTATIONS[optimizedRotation].add(position);

			const axisRotation = new Vector3(
				buffer.readf32(buf, offset),
				buffer.readf32(buf, offset + 4),
				buffer.readf32(buf, offset + 8),
			);

			offset += 12;

			if (axisRotation.Magnitude === 0) return new CFrame(position);
			return CFrame.fromAxisAngle(axisRotation.Unit, axisRotation.Magnitude).add(position);
		}

		if (kind === "cframe") return deserializeCFrame();

		if (kind === "colorsequence") {
			const keypointCount = buffer.readu8(buf, currentOffset);
			const keypoints = new Array<ColorSequenceKeypoint>();
			offset += 1 + keypointCount * 7;

			for (const index of $range(1, keypointCount)) {
				const keypointOffset = currentOffset + 1 + 7 * (index - 1);
				const time = buffer.readf32(buf, keypointOffset);
				const value = Color3.fromRGB(
					buffer.readu8(buf, keypointOffset + 4),
					buffer.readu8(buf, keypointOffset + 5),
					buffer.readu8(buf, keypointOffset + 6),
				);

				keypoints.push(new ColorSequenceKeypoint(time, value));
			}

			return new ColorSequence(keypoints);
		}
		if (kind === "numbersequence") {
			const keypointCount = buffer.readu8(buf, currentOffset);
			const keypoints = new Array<NumberSequenceKeypoint>();
			offset += 1 + keypointCount * 8;

			for (const index of $range(1, keypointCount)) {
				const keypointOffset = currentOffset + 1 + 8 * (index - 1);
				const time = buffer.readf32(buf, keypointOffset);
				const value = buffer.readf32(buf, keypointOffset + 4);

				keypoints.push(new NumberSequenceKeypoint(time, value));
			}

			return new NumberSequence(keypoints);
		}
		if (kind === "color3") {
			offset += 3;

			return Color3.fromRGB(
				buffer.readu8(buf, currentOffset),
				buffer.readu8(buf, currentOffset + 1),
				buffer.readu8(buf, currentOffset + 2),
			);
		}
		error(`unexpected kind: ${kind}`);
	}

	function deserializeCFrame(): CFrame {
		const currentOffset = offset;
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

		return rotation.Magnitude === 0
			? new CFrame(position)
			: CFrame.fromAxisAngle(rotation.Unit, rotation.Magnitude).add(position);
	}

	function readBits(): void {
		const guaranteedBytes = info.minimumPackedBytes;

		while (true) {
			const currentByte = buffer.readu8(buf, offset);
			const guaranteedByte = offset < guaranteedBytes;

			for (const bit of $range(guaranteedByte ? 0 : 1, 7)) {
				const value = (currentByte >>> bit) % 2 === 1;
				bits.push(value);
			}

			offset += 1;

			// Variable bit indicated the end.
			if (!guaranteedByte && currentByte % 2 === 0) break;

			// We only have guaranteed bits and we reached the end.
			if (!info.containsUnknownPacking && offset === guaranteedBytes) break;
		}
	}

	return (input: buffer, inputBlobs?: Array<defined>): T => {
		blobs = inputBlobs;
		buf = input;
		offset = 0;
		blobIndex = 0;
		bitIndex = 0;

		if (info.containsPacking) {
			table.clear(bits);
			readBits();
		}

		return deserialize(info.data) as T;
	};
}

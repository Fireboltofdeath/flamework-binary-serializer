//!native
//!optimize 2
import type { SerializerData } from "../metadata";
import type { ProcessedSerializerData } from "../processSerializerData";

export function createDeserializer<T>(info: ProcessedSerializerData) {
	let buf!: buffer;
	let offset!: number;
	let blobs: defined[] | undefined;
	let blobIndex = 0;
	let packing = false;
	let bits!: boolean[];
	let bitIndex = 0;

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
		} else if (kind === "boolean" && packing) {
			bitIndex++;
			return bits[bitIndex - 1];
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
		} else if (kind === "optional" && packing) {
			bitIndex++;
			return bits[bitIndex - 1] ? deserialize(meta[1]) : undefined;
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
			const innerType = meta[1];
			const wasPacking = packing;
			packing = true;

			const value = deserialize(innerType);
			packing = wasPacking;

			return value;
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

			return rotation.Magnitude === 0
				? new CFrame(position)
				: CFrame.fromAxisAngle(rotation.Unit, rotation.Magnitude).add(position);
		} else if (kind === "colorsequence") {
			const keypointCount = buffer.readu8(buf, currentOffset);
			const keypoints = new Array<ColorSequenceKeypoint>();
			offset += 1 + keypointCount * 16;

			for (const i of $range(1, keypointCount)) {
				const keypointOffset = currentOffset + 1 + 16 * (i - 1);
				const time = buffer.readf32(buf, keypointOffset);
				const value = new Color3(
					buffer.readf32(buf, keypointOffset + 4),
					buffer.readf32(buf, keypointOffset + 8),
					buffer.readf32(buf, keypointOffset + 12),
				);

				keypoints.push(new ColorSequenceKeypoint(time, value));
			}

			return new ColorSequence(keypoints);
		} else if (kind === "numbersequence") {
			const keypointCount = buffer.readu8(buf, currentOffset);
			const keypoints = new Array<NumberSequenceKeypoint>();
			offset += 1 + keypointCount * 8;

			for (const i of $range(1, keypointCount)) {
				const keypointOffset = currentOffset + 1 + 8 * (i - 1);
				const time = buffer.readf32(buf, keypointOffset);
				const value = buffer.readf32(buf, keypointOffset + 4);

				keypoints.push(new NumberSequenceKeypoint(time, value));
			}

			return new NumberSequence(keypoints);
		} else if (kind === "color3") {
			offset += 12;

			return new Color3(
				buffer.readf32(buf, currentOffset),
				buffer.readf32(buf, currentOffset + 4),
				buffer.readf32(buf, currentOffset + 8),
			);
		} else {
			error(`unexpected kind: ${kind}`);
		}
	}

	return (input: buffer, inputBlobs?: defined[]) => {
		blobs = inputBlobs;
		buf = input;
		offset = 0;
		blobIndex = 0;

		if (info.containsPacking) {
			let byteCount;
			if (info.packingBits !== undefined) {
				byteCount = math.ceil(info.packingBits / 8);
			} else {
				byteCount = buffer.readu8(buf, 0);
				offset++;
			}

			bits = table.create(byteCount * 8);

			for (const _ of $range(0, byteCount - 1)) {
				const currentByte = buffer.readu8(buf, offset);

				for (const bit of $range(0, 7)) {
					const value = (currentByte >>> bit) % 2 === 1;
					bits.push(value);
				}

				offset += 1;
			}
		}

		return deserialize(info.data) as T;
	};
}

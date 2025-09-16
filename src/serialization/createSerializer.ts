//!native
//!optimize 2

import { AXIS_ALIGNED_ORIENTATIONS } from "../constants";
import type { SerializerData } from "../metadata";
import type { ProcessedSerializerData } from "../processSerializerData";

export function createSerializer<T>(info: ProcessedSerializerData) {
	const bits = table.create<boolean>(info.minimumPackedBits);
	let currentSize = 2 ** 8;
	let buf = buffer.create(currentSize);
	let offset!: number;
	let blobs!: Array<defined>;
	let packing = false;

	function allocate(size: number): void {
		offset += size;

		if (offset > currentSize) {
			const newSize = 2 ** math.ceil(math.log(offset) / math.log(2));
			const oldBuffer = buf;

			currentSize = newSize;
			buf = buffer.create(newSize);
			buffer.copy(buf, 0, oldBuffer);
		}
	}

	function serialize(value: unknown, meta: SerializerData): void {
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
		} else if (kind === "boolean" && packing) {
			bits.push(value as boolean);
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
			for (const index of $range(1, elements.size(), 2)) {
				serialize(
					(value as Record<string, unknown>)[elements[index - 1] as string],
					elements[index] as SerializerData,
				);
			}
		} else if (kind === "array") {
			const serializer = meta[1];
			allocate(4);

			buffer.writeu32(buf, currentOffset, (value as Array<unknown>).size());

			for (const element of value as Array<unknown>) serialize(element, serializer);
		} else if (kind === "tuple") {
			const [, elements, restSerializer] = meta;
			const size = (value as Array<unknown>).size();

			// We serialize the rest element length first so that the
			// deserializer can allocate accordingly.
			if (restSerializer) {
				allocate(4);
				buffer.writeu32(buf, currentOffset, size - elements.size());
			}

			for (const index of $range(1, size)) {
				const serializer = elements[index - 1] ?? restSerializer;
				if (serializer) serialize((value as Array<unknown>)[index - 1], serializer);
			}
		} else if (kind === "map") {
			const [, keySerializer, valueSerializer] = meta;
			allocate(4);

			let size = 0;
			for (const [elementIndex, elementValue] of value as Map<unknown, unknown>) {
				size += 1;
				serialize(elementIndex, keySerializer);
				serialize(elementValue, valueSerializer);
			}

			// We already allocated this space before serializing the map, so
			// this is safe.
			buffer.writeu32(buf, currentOffset, size);
		} else if (kind === "set") {
			// We could just generate `Map<V, true>` for sets, but this is more
			// efficient as it omits serializing a boolean per value.
			const valueSerializer = meta[1];
			allocate(4);

			let size = 0;
			for (const elementValue of value as Set<unknown>) {
				size += 1;
				serialize(elementValue, valueSerializer);
			}

			// We already allocated this space before serializing the set, so
			// this is safe.
			buffer.writeu32(buf, currentOffset, size);
		} else if (kind === "optional" && packing) {
			if (value !== undefined) {
				bits.push(true);
				serialize(value, meta[1]);
			} else bits.push(false);
		} else if (kind === "optional") {
			allocate(1);
			if (value !== undefined) {
				buffer.writeu8(buf, currentOffset, 1);
				serialize(value, meta[1]);
			} else buffer.writeu8(buf, currentOffset, 0);
		} else if (kind === "union") {
			const [, tagName, tagged, byteSize] = meta;
			const objectTag = (value as Map<unknown, unknown>).get(tagName);

			let tagIndex = 0;
			let tagMetadata!: SerializerData;
			for (const index of $range(1, tagged.size())) {
				const tagObject = tagged[index - 1];
				if (tagObject[0] === objectTag) {
					tagIndex = index - 1;
					tagMetadata = tagObject[1];
					break;
				}
			}

			if (byteSize === 1) {
				allocate(1);
				buffer.writeu8(buf, currentOffset, tagIndex);
			} else if (byteSize === 2) {
				allocate(2);
				buffer.writeu16(buf, currentOffset, tagIndex);
			} else if (byteSize === -1) bits.push(tagIndex === 0);

			serialize(value, tagMetadata);
		} else if (kind === "literal") {
			// We support `undefined` as a literal, but `indexOf` will actually
			// return -1 This is fine, though, as -1 will serialize as the max
			// integer which will be undefined on unions that do not exceed the
			// size limit.
			const [, literals, byteSize] = meta;
			if (byteSize === 1) {
				const index = literals.indexOf(value as defined);
				allocate(1);
				buffer.writeu8(buf, currentOffset, index);
			} else if (byteSize === 2) {
				const index = literals.indexOf(value as defined);
				allocate(2);
				buffer.writeu16(buf, currentOffset, index);
			} else if (byteSize === -1) bits.push(value === literals[0]);
		} else if (kind === "mixed_union") {
			const [primitiveMetadata, objectMetadata] = meta[1];

			// Use typeof to determine if value is primitive or object
			if (typeOf(value) === "table") {
				// Serialize as object with type discriminator 1
				allocate(1);
				buffer.writeu8(buf, currentOffset, 1);
				serialize(value, objectMetadata);
			} else {
				// Serialize as primitive with type discriminator 0
				allocate(1);
				buffer.writeu8(buf, currentOffset, 0);
				serialize(value, primitiveMetadata);
			}
		} else if (kind === "blob") {
			// Value will always be defined because if it isn't, it will be
			// wrapped in `optional`
			blobs.push(value!);
		} else if (kind === "packed") {
			const innerType = meta[1];
			const wasPacking = packing;
			packing = true;

			serialize(value, innerType);
			packing = wasPacking;
		} else if (kind === "enum") {
			const enumIndex = info.sortedEnums[meta[1]].indexOf(value as EnumItem);
			allocate(1);

			buffer.writeu8(buf, currentOffset, enumIndex);
		} else if (kind === "cframe" && packing) {
			// 1-5: Orientation, 6-7: Position, 8: unused
			let optimizedPosition = false;
			let optimizedRotation = false;
			let packed = 0;

			const cframe = value as CFrame;

			if (cframe.Position === Vector3.zero) {
				optimizedPosition = true;
				packed += 0x20;
			} else if (cframe.Position === Vector3.one) {
				optimizedPosition = true;
				packed += 0x20;
				packed += 0x40;
			}

			const specialCase = AXIS_ALIGNED_ORIENTATIONS.indexOf(cframe.Rotation);
			if (specialCase !== -1) {
				optimizedRotation = true;
				packed += specialCase;
			} else packed += 0x1f;

			const optimized = optimizedPosition || optimizedRotation;
			bits.push(optimized);

			allocate((optimized ? 1 : 0) + (optimizedPosition ? 0 : 12) + (optimizedRotation ? 0 : 12));

			let newOffset = currentOffset;

			if (optimized) {
				buffer.writeu8(buf, newOffset, packed);
				newOffset += 1;
			}

			if (!optimizedPosition) {
				buffer.writef32(buf, newOffset, cframe.X);
				buffer.writef32(buf, newOffset + 4, cframe.Y);
				buffer.writef32(buf, newOffset + 8, cframe.Z);
				newOffset += 12;
			}

			if (!optimizedRotation) {
				const [axis, angle] = cframe.ToAxisAngle();
				buffer.writef32(buf, newOffset, axis.X * angle);
				buffer.writef32(buf, newOffset + 4, axis.Y * angle);
				buffer.writef32(buf, newOffset + 8, axis.Z * angle);
			}
		} else if (kind === "cframe") {
			allocate(4 * 6);

			buffer.writef32(buf, currentOffset, (value as CFrame).X);
			buffer.writef32(buf, currentOffset + 4, (value as CFrame).Y);
			buffer.writef32(buf, currentOffset + 8, (value as CFrame).Z);

			const [axis, angle] = (value as CFrame).ToAxisAngle();
			buffer.writef32(buf, currentOffset + 12, axis.X * angle);
			buffer.writef32(buf, currentOffset + 16, axis.Y * angle);
			buffer.writef32(buf, currentOffset + 20, axis.Z * angle);
		} else if (kind === "colorsequence") {
			const keypoints = (value as ColorSequence).Keypoints;
			const keypointCount = keypoints.size();
			allocate(1 + keypointCount * 7);

			buffer.writeu8(buf, currentOffset, keypointCount);

			for (const index of $range(1, keypointCount)) {
				const keypointOffset = currentOffset + 1 + 7 * (index - 1);
				const keypoint = keypoints[index - 1];
				buffer.writef32(buf, keypointOffset, keypoint.Time);
				buffer.writeu8(buf, keypointOffset + 4, keypoint.Value.R * 255);
				buffer.writeu8(buf, keypointOffset + 5, keypoint.Value.G * 255);
				buffer.writeu8(buf, keypointOffset + 6, keypoint.Value.B * 255);
			}
		} else if (kind === "numbersequence") {
			const keypoints = (value as NumberSequence).Keypoints;
			const keypointCount = keypoints.size();
			allocate(1 + keypointCount * 8);

			buffer.writeu8(buf, currentOffset, keypointCount);

			for (const index of $range(1, keypointCount)) {
				const keypointOffset = currentOffset + 1 + 8 * (index - 1);
				const keypoint = keypoints[index - 1];
				buffer.writef32(buf, keypointOffset, keypoint.Time);
				buffer.writef32(buf, keypointOffset + 4, keypoint.Value);
			}
		} else if (kind === "color3") {
			allocate(3);

			buffer.writeu8(buf, currentOffset, (value as Color3).R * 255);
			buffer.writeu8(buf, currentOffset + 1, (value as Color3).G * 255);
			buffer.writeu8(buf, currentOffset + 2, (value as Color3).B * 255);
		} else error(`unexpected kind: ${kind}`);
	}

	function writeBits(
		bitsBuffer: buffer,
		bitsOffset: number,
		bitOffset: number,
		bytes: number,
		variable: boolean,
	): void {
		const bitSize = bits.size();

		for (const byte of $range(0, bytes - 1)) {
			let currentByte = 0;

			for (const bit of $range(variable ? 1 : 0, math.min(7, bitSize - bitOffset))) {
				currentByte += (bits[bitOffset] ? 1 : 0) << bit;
				bitOffset += 1;
			}

			if (variable && byte !== bytes - 1) currentByte += 1;
			buffer.writeu8(bitsBuffer, bitsOffset, currentByte);
			bitsOffset += 1;
		}
	}

	function calculatePackedBytes(): LuaTuple<[number, number, number]> {
		const minimumBytes = info.minimumPackedBytes;

		if (info.containsUnknownPacking) {
			const variableBytes = math.max(1, math.ceil((bits.size() - minimumBytes * 8) / 7));
			const totalByteCount = minimumBytes + variableBytes;

			return $tuple(minimumBytes, variableBytes, totalByteCount);
		}

		return $tuple(minimumBytes, 0, minimumBytes);
	}

	return (value: T) => {
		offset = 0;
		blobs = [];
		table.clear(bits);
		serialize(value, info.data);

		if (info.containsPacking) {
			const [minimumBytes, variableBytes, totalBytes] = calculatePackedBytes();
			const trim = buffer.create(offset + totalBytes);
			buffer.copy(trim, totalBytes, buf, 0, offset);

			if (minimumBytes > 0) writeBits(trim, 0, 0, minimumBytes, false);
			if (variableBytes > 0) writeBits(trim, minimumBytes, minimumBytes * 8, variableBytes, true);
			return { blobs, buffer: trim };
		}

		const trim = buffer.create(offset);
		buffer.copy(trim, 0, buf, 0, offset);

		return { blobs, buffer: trim };
	};
}

//!native
//!optimize 2
import type { SerializerData } from "../metadata";

export function createSerializer<T>(meta: SerializerData) {
	let currentSize = 2 ** 8;
	let buf = buffer.create(currentSize);
	let offset!: number;
	let blobs!: defined[];

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
			const tagName = meta[1];
			const tagged = meta[2];
			const byteSize = meta[3];
			const objectTag = (value as Map<unknown, unknown>).get(tagName);
			allocate(byteSize);

			let tagIndex = 0;
			let tagMetadata!: SerializerData;
			for (const i of $range(1, tagged.size())) {
				const tagObject = tagged[i - 1];
				if (tagObject[0] === objectTag) {
					tagIndex = i - 1;
					tagMetadata = tagObject[1];
					break;
				}
			}

			if (byteSize === 1) {
				buffer.writeu8(buf, currentOffset, tagIndex);
			} else {
				buffer.writeu16(buf, currentOffset, tagIndex);
			}

			serialize(value, tagMetadata);
		} else if (kind === "literal") {
			// We support `undefined` as a literal, but `indexOf` will actually return -1
			// This is fine, though, as -1 will serialize as the max integer which will be undefined on unions that do not exceed the size limit.
			const literals = meta[1];
			const byteSize = meta[2];
			if (byteSize === 1) {
				const index = literals.indexOf(value as defined);
				allocate(1);

				buffer.writeu8(buf, currentOffset, index);
			} else if (byteSize === 2) {
				const index = literals.indexOf(value as defined);
				allocate(2);

				buffer.writeu16(buf, currentOffset, index);
			}
		} else if (kind === "blob") {
			// Value will always be defined because if it isn't, it will be wrapped in `optional`
			blobs.push(value!);
		} else if (kind === "packed") {
			const bitfields = meta[1];
			const objectType = meta[2];
			const bytes = meta[3];
			allocate(bytes);

			const bitfieldCount = bitfields.size();
			for (const byte of $range(0, bytes - 1)) {
				let currentByte = 0;

				for (const bit of $range(0, math.min(7, bitfieldCount - byte * 8 - 1))) {
					const field = (value as Record<string, boolean>)[bitfields[bit + byte * 8]];
					currentByte += (field ? 1 : 0) << bit;
				}

				buffer.writeu8(buf, currentOffset + byte, currentByte);
			}

			serialize(value, objectType);
		} else if (kind === "cframe") {
			allocate(4 * 6);

			buffer.writef32(buf, currentOffset, (value as CFrame).X);
			buffer.writef32(buf, currentOffset + 4, (value as CFrame).Y);
			buffer.writef32(buf, currentOffset + 8, (value as CFrame).Z);

			const [axis, angle] = (value as CFrame).ToAxisAngle();
			buffer.writef32(buf, currentOffset + 12, axis.X * angle);
			buffer.writef32(buf, currentOffset + 16, axis.Y * angle);
			buffer.writef32(buf, currentOffset + 20, axis.Z * angle);
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

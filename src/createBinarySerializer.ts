//!optimize 2
import { Modding } from "@flamework/core";
import { FindDiscriminator, IsDiscriminableUnion } from "./discriminators";

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

type IsNumber<T, K extends string> = `_${K}` extends keyof T ? true : false;
export type SerializerMetadata<T> = undefined extends T
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
	: [T] extends [(infer V)[]]
	? ["array", SerializerMetadata<V>]
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
				[k in keyof T]: [k, SerializerMetadata<T[k]>];
			}[keyof T][],
	  ]
	: ["blob"];

type HasNominal<T> = T extends T ? (T extends `_nominal_${string}` ? true : never) : never;

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
	| ["object", Array<string | SerializerData>, object]
	| ["object_raw", [string, SerializerData][]]
	| ["union", string, [unknown, SerializerData][]]
	| ["array", SerializerData]
	| ["optional", SerializerData]
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
	} else if (data[0] === "array" || data[0] === "optional") {
		data = [data[0], optimizeSerializerData(data[1])];
	} else if (data[0] === "union") {
		data = [
			data[0],
			data[1],
			data[2].map(([key, data]): [unknown, SerializerData] => [key, optimizeSerializerData(data)]),
		];
	}

	return data;
}

function createSerializer(meta: SerializerData) {
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
		} else if (kind === "blob") {
			// Value will always be defined because if it isn't, it will be wrapped in `optional`
			blobs.push(value!);
		} else {
			error(`unexpected kind: ${kind}`);
		}
	}

	return (value: unknown) => {
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

/** @metadata macro */
export function createBinarySerializer<T>(meta?: Modding.Many<SerializerMetadata<T>>) {
	return {
		serialize: createSerializer(meta as never),
		deserialize: createDeserializer<T>(meta as never),
	};
}

import { getSortedEnumItems } from "./constants";
import type { SerializerData } from "./metadata";

const enum IterationFlag {
	Default = 0,
	SizeUnknown = 1 << 0,
	Packed = 1 << 1,
}

export interface ProcessedInfo {
	containsPacking: boolean;
	containsUnknownPacking: boolean;
	flags: IterationFlag;
	minimumPackedBits: number;
	minimumPackedBytes: number;
	sortedEnums: Record<string, Array<EnumItem>>;
}

export interface ProcessedSerializerData extends ProcessedInfo {
	data: SerializerData;
}

export function processSerializerData(rawData: SerializerData): ProcessedSerializerData {
	const processedInfo: ProcessedSerializerData = {
		containsPacking: false,
		containsUnknownPacking: false,
		data: rawData,
		flags: IterationFlag.Default,
		minimumPackedBits: 0,
		minimumPackedBytes: 0,
		sortedEnums: {},
	};

	processedInfo.data = iterateSerializerData(rawData, processedInfo);
	processedInfo.minimumPackedBytes = getMinimumPackedBytes(processedInfo);
	return processedInfo;
}

function addPackedBit(info: ProcessedInfo): void {
	if ((info.flags & IterationFlag.Packed) === 0) return;
	info.containsPacking = true;

	if ((info.flags & IterationFlag.SizeUnknown) !== 0) info.containsUnknownPacking = true;
	else {
		// We only keep track of guaranteed packing bits, which we can use
		// for optimization.
		info.minimumPackedBits += 1;
	}
}

function getMinimumPackedBytes(info: ProcessedSerializerData): number {
	return math.max(0, math.ceil(info.minimumPackedBits / 8) - (info.containsUnknownPacking ? 1 : 0));
}

/**
 * Run a second pass over `SerializerData` to compute derived information and
 * perform light optimizations that are hard or impossible to express in types.
 *
 * The pass performs several tasks:
 * 1. Optimize object metadata into a flattened representation for faster
 *    runtime iteration.
 * 2. Calculate union sizes (1 byte / 2 bytes / packable) for efficient
 *    encoding.
 * 3. Track packing opportunities (bits) to compute minimum packed bytes.
 *
 * @param data - The serializer metadata to process.
 * @param info - Mutable accumulator that collects global processing state
 *   (flags, packed bit counts, sorted enums, etc.). This function mutates
 *   `info` as it walks `data`.
 * @returns The transformed `SerializerData` after processing. May differ from
 *   the input `data` when optimizations or size annotations are applied.
 */
function iterateSerializerData(data: SerializerData, info: ProcessedInfo): SerializerData {
	const { flags } = info;
	const kind = data[0];

	switch (kind) {
		case "array":
		case "set": {
			info.flags |= IterationFlag.SizeUnknown;
			data = [kind, iterateSerializerData(data[1], info)];
			break;
		}

		case "boolean": {
			addPackedBit(info);
			break;
		}

		case "cframe": {
			addPackedBit(info);
			break;
		}

		case "enum": {
			// Calculate the sorted enum items so that we can send a single byte
			// for an enum.
			info.sortedEnums[data[1]] ??= getSortedEnumItems(Enum[data[1] as never]);
			break;
		}

		case "literal": {
			// Whenever we only have two options, we can use a single bit.
			// We exclude undefined using `data[2] === 0` as it complicates thing.
			if ((info.flags & IterationFlag.Packed) !== 0 && data[1].size() === 2 && data[2] === 0) {
				addPackedBit(info);

				// We use `-1` as the size to signify that this union can be
				// packed, as it's not a valid value otherwise.
				return [kind, data[1], -1];
			}

			// Since `undefined` is not included in the size of `data[1]`,
			// we add the existing value of `data[3]` (which is 1 if undefined is
			// in the union) to `data[1]` to determine the final required size. A
			// size of -1 means this isn't a union.
			data = [kind, data[1], data[2] === -1 ? 0 : data[2] + data[1].size() <= 256 ? 1 : 2];

			break;
		}

		case "map": {
			info.flags |= IterationFlag.SizeUnknown;
			data = [kind, iterateSerializerData(data[1], info), iterateSerializerData(data[2], info)];
			break;
		}

		case "mixed_union": {
			const [primitiveMetadata, objectMetadata] = data[1];
			data = [
				kind,
				[iterateSerializerData(primitiveMetadata, info), iterateSerializerData(objectMetadata, info)],
			];

			break;
		}

		case "object_raw": {
			// We transform objects as an array of tuples, but this is slow to
			// iterate over. We flatten the raw generated metadata into a single
			// array, which can be iterated much quicker. We also create a
			// preallocated object that we can clone as we already know the
			// structure ahead of time.
			const preallocation = new Set<string>();
			const transformed = new Array<SerializerData | string>();
			for (const [key, meta] of data[1]) {
				transformed.push(key, iterateSerializerData(meta, info));
				preallocation.add(key);
			}

			data = ["object", transformed, preallocation];
			break;
		}

		case "optional": {
			addPackedBit(info);
			info.flags |= IterationFlag.SizeUnknown;

			data = [kind, iterateSerializerData(data[1], info)];
			break;
		}

		case "packed": {
			info.flags |= IterationFlag.Packed;
			data = [kind, iterateSerializerData(data[1], info)];
			break;
		}

		case "tuple": {
			const fixedElements = data[1].map((v) => iterateSerializerData(v, info));

			let restElement;
			if (data[2] !== undefined) {
				info.flags |= IterationFlag.SizeUnknown;
				restElement = iterateSerializerData(data[2], info);
			}

			data = [kind, fixedElements, restElement];
			break;
		}

		case "union": {
			// Whenever we only have two options, we can use a single bit.
			// We use a byte size of `-1` to indicate a packable union.
			const isPackable = (info.flags & IterationFlag.Packed) !== 0 && data[2].size() === 2;
			if (isPackable) addPackedBit(info);

			info.flags |= IterationFlag.SizeUnknown;

			data = [
				kind,
				data[1],
				data[2].map(([key, serializerData]): [unknown, SerializerData] => [
					key,
					iterateSerializerData(serializerData, info),
				]),
				isPackable ? -1 : data[2].size() <= 256 ? 1 : 2,
			];

			break;
		}

		// No default
	}

	info.flags = flags;

	return data;
}

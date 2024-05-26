import type { SerializerData } from "./metadata";

const enum IterationFlags {
	Default = 0,
	SizeUnknown = 1 << 0,
	Packed = 1 << 1,
}

export interface ProcessedInfo {
	flags: IterationFlags;
	containsPacking: boolean;
	containsUnknownPacking: boolean;
	minimumPackedBits: number;
	minimumPackedBytes: number;
}

export interface ProcessedSerializerData extends ProcessedInfo {
	data: SerializerData;
}

function addPackedBit(info: ProcessedInfo) {
	if ((info.flags & IterationFlags.Packed) !== 0) {
		if ((info.flags & IterationFlags.SizeUnknown) !== 0) {
			info.containsUnknownPacking = true;
		} else {
			// We only keep track of guaranteed packing bits, which we can use for optimization.
			info.minimumPackedBits += 1;
		}
	}
}

/**
 * This runs an additional pass over the SerializerData to perform calculations not feasible type-wise:
 * 1. Optimize objects
 * 2. Calculate union sizes
 * 3. Calculate packing
 */
function iterateSerializerData(data: SerializerData, info: ProcessedInfo): SerializerData {
	const flags = info.flags;
	const kind = data[0];

	if (kind === "object_raw") {
		// We transform objects as an array of tuples, but this is slow to iterate over.
		// We flatten the raw generated metadata into a single array, which can be iterated much quicker.
		// We also create a preallocated object that we can clone as we already know the structure ahead of time.
		const preallocation = new Set<string>();
		const transformed = new Array<string | SerializerData>();
		for (const [key, meta] of data[1]) {
			transformed.push(key, iterateSerializerData(meta, info));
			preallocation.add(key);
		}

		data = ["object", transformed, preallocation];
	} else if (kind === "optional") {
		addPackedBit(info);
		info.flags |= IterationFlags.SizeUnknown;

		data = [kind, iterateSerializerData(data[1], info)];
	} else if (kind === "array" || kind === "set") {
		info.flags |= IterationFlags.SizeUnknown;

		data = [kind, iterateSerializerData(data[1], info)];
	} else if (kind === "union") {
		info.flags |= IterationFlags.SizeUnknown;

		data = [
			kind,
			data[1],
			data[2].map(([key, data]): [unknown, SerializerData] => [key, iterateSerializerData(data, info)]),
			data[2].size() <= 256 ? 1 : 2,
		];
	} else if (kind === "map") {
		info.flags |= IterationFlags.SizeUnknown;

		data = [kind, iterateSerializerData(data[1], info), iterateSerializerData(data[2], info)];
	} else if (kind === "tuple") {
		const fixedElements = data[1].map((v) => iterateSerializerData(v, info));

		let restElement;
		if (data[2] !== undefined) {
			info.flags |= IterationFlags.SizeUnknown;

			restElement = iterateSerializerData(data[2], info);
		}

		data = [kind, fixedElements, restElement];
	} else if (kind === "literal") {
		// Since `undefined` is not included in the size of `data[1]`,
		// we add the existing value of `data[3]` (which is 1 if undefined is in the union) to `data[1]`
		// to determine the final required size.
		// A size of -1 means this isn't a union.
		data = [kind, data[1], data[2] === -1 ? 0 : data[2] + data[1].size() <= 256 ? 1 : 2];
	} else if (kind === "packed") {
		info.flags |= IterationFlags.Packed;
		info.containsPacking = true;

		data = [kind, iterateSerializerData(data[1], info)];
	} else if (kind === "boolean") {
		addPackedBit(info);
	}

	info.flags = flags;

	return data;
}

function getMinimumPackedBytes(info: ProcessedSerializerData) {
	return math.max(0, math.ceil(info.minimumPackedBits / 8) - (info.containsUnknownPacking ? 1 : 0));
}

export function processSerializerData(rawData: SerializerData): ProcessedSerializerData {
	const processedInfo: ProcessedSerializerData = {
		data: rawData,
		flags: IterationFlags.Default,
		containsPacking: false,
		containsUnknownPacking: false,
		minimumPackedBits: 0,
		minimumPackedBytes: 0,
	};

	processedInfo.data = iterateSerializerData(rawData, processedInfo);
	processedInfo.minimumPackedBytes = getMinimumPackedBytes(processedInfo);
	return processedInfo;
}

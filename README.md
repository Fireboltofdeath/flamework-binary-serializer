# flamework-binary-serializer
This is a small and simple library that allows you to specify a small and optimized structure for binary data.

This package is **not** an official Flamework package, but it does use Flamework to automatically generate a description given any arbitrary TS type.
You should refer to the [Flamework documentation](https://flamework.fireboltofdeath.dev/) for installation steps.

## Demo

Documentation is not planned, but here's an example of how to use the library.

You should only call `createBinarySerializer` once, most likely as an export of a shared file.

Serialization returns a buffer and a blobs array. The blobs array contains things that we leave Roblox to serialize (instances, `unknown` values, etc.)

```ts
import { DataType, createBinarySerializer } from "@rbxts/flamework-binary-serializer";

export interface Data {
	optional?: boolean;
	f64: number;
	f32: DataType.f32;

	u8: DataType.u8;
	u16: DataType.u16;
	u32: DataType.u32;

	i8: DataType.i8;
	i16: DataType.i16;
	i32: DataType.i32;

	vector: Vector3;
	cframe: CFrame;
	color3: Color3;
	colorSequence: ColorSequence;
	numberSequence: NumberSequence;
	enum: Enum.KeyCode;

	boolean: boolean;
	string: string;
	array: number[];

	// flamework-binary-serializer will optimize the `type` field into a single byte.
	// The rest of the object will serialize like a normal object, but without the `type` field.
	union: { type: "string"; value: string } | { type: "number"; value: number } | { type: "boolean"; value: boolean };
	unionOfStrings: "a" | "b" | "c" | "d" | "e" | "a very large string that will not exist in the serialized output!";
	unionOfPrimitives: 1 | 2 | "a" | "b" | true | undefined;

	tuple: [string, number, boolean];
	tupleWithRest: [string, number, boolean, ...string[]];

	// flamework-binary-serializer will use Roblox's serialization for types it does not recognize
	blob: Instance;
	unknown: unknown;

	map: Map<Instance, boolean>;
	set: Set<{ type: "string"; value: string } | { type: "number"; value: number }>;

	packed: DataType.Packed<PackedObject>;
}

// This interface will take up a byte and 8-10 bits.
// 1 byte for the i8, 8 bits (1 byte) for 8 booleans, and 1-2 bits for the optional field.
// Without packing, this interface would take up to 11 bytes.
//
// Packing also optimizes `optional` values by using a single bit for the presence of the value.
// Packing recursively applies to the entire object, including things like arrays, other objects, etc.
//
// Packing additionally optimizes CFrames by optimizing out axis-aligned orientation or default positions.
// This does add an extra bit of overhead per CFrame, but due to the size of an unoptimized CFrame, this is insignificant.
//
// Packing also optimizes discriminated and literal unions with two constituents by using a single bit for the discriminator.
interface PackedObject {
	num: DataType.i8;
	a: boolean;
	b: boolean;
	c: boolean;
	d: boolean;
	e: boolean;
	f: boolean;
	g: boolean;
	h: boolean;

	// This only takes up to 2 bits to encode in a packed type!
	i?: boolean;
}

const testData: Data = {
	f64: 1552983.573,
	f32: 1552983.573,

	u8: 175,
	u16: 5892,
	u32: 850928,

	i8: 175,
	i16: 5892,
	i32: 850928,

	vector: new Vector3(4, 2, 0),
	cframe: new CFrame(6, 6, 6).mul(CFrame.fromOrientation(math.rad(15), math.rad(25), math.rad(35))),
	color3: new Color3(0.5258, 0.1919, 0.666),
	colorSequence: new ColorSequence([
		new ColorSequenceKeypoint(0, new Color3(1, 0, 0)),
		new ColorSequenceKeypoint(0.5, new Color3(0, 1, 0)),
		new ColorSequenceKeypoint(1, new Color3(0, 0, 1)),
	]),
	numberSequence: new NumberSequence([
		new NumberSequenceKeypoint(0, 0.2),
		new NumberSequenceKeypoint(0.5, 1.75),
		new NumberSequenceKeypoint(1, 250),
	]),
	enum: Enum.KeyCode.W,

	boolean: true,
	string: "hello i am a string!",
	array: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],

	union: { type: "string", value: "hey, I am a string!" },
	unionOfStrings: "a very large string that will not exist in the serialized output!",
	unionOfPrimitives: true,

	tuple: ["tuple!", 15, true],
	tupleWithRest: ["tuple!!", 25, false, "various", "strings", "go", "here !"],

	blob: game.GetService("Workspace").Terrain,
	unknown: ["hey i can be any value, and I will serialize correctly!"],

	map: new Map(),
	set: new Set(),

	packed: {
		num: 35,
		a: true,
		b: false,
		c: true,
		d: false,
		e: true,
		f: false,
		g: true,
		h: false,
	},
};

testData.map.set(testData.blob, true);
testData.set.add({ type: "string", value: "yo!" });
testData.set.add({ type: "number", value: 69420 });

const serializer = createBinarySerializer<Data>();

const serialized = serializer.serialize(testData);
print("serializing", "blob:", serialized.blobs);
print(buffer.tostring(serialized.buffer));

print("deserialized", serializer.deserialize(serialized.buffer, serialized.blobs));
print("original value", testData);
```

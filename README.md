# flamework-binary-serializer
This is a small and simple library that allows you to specify a small and optimized structure for binary data.

This package is **not** an unofficial Flamework package, but it does use Flamework to automatically generate a description given any arbitrary TS type.
You should refer to the [Flamework documentation](https://flamework.fireboltofdeath.dev/) for installation steps.

## Demo

Documentation is not planned, but here's an example of how to use the library.

You should only call `createBinarySerializer` once, most likely as an export of a shared file.

Serialization returns a buffer and a blobs array. The blobs array contains things that we leave Roblox to serialize (instances, `unknown` values, etc.)

```ts
import { DataType, createBinarySerializer } from "@rbxts/flamework-binary-serializer";

export interface Data {
	optional?: boolean;
	f64?: number;
	f32?: DataType.f32;

	u8: DataType.u8;
	u16: DataType.u16;
	u32: DataType.u32;

	i8: DataType.i8;
	i16: DataType.i16;
	i32: DataType.i32;

	boolean: boolean;
	string: string;
	array: number[];

	// flamework-binary-serializer will optimize the `type` field into a single byte.
	// The rest of the object will serialize like a normal object, but without the `type` field.
	union: { type: "string"; value: string } | { type: "number"; value: number } | { type: "boolean"; value: boolean };

	// flamework-binary-serializer will use Roblox's serialization for types it does not recognize
	blob: Instance;
	unknown: unknown;
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

	boolean: true,
	string: "hello i am a string!",
	array: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
	union: { type: "string", value: "hey, I am a string!" },

	blob: game.GetService("Workspace").Terrain,
	unknown: ["hey i can be any value, and I will serialize correctly!"],
};

const serializer = createBinarySerializer<Data>();

const serialized = serializer.serialize(testData);
print("serializing", "blob:", serialized.blobs);
print(buffer.tostring(serialized.buffer));

print("deserialized", serializer.deserialize(serialized.buffer, serialized.blobs));
print("original value", testData);
```

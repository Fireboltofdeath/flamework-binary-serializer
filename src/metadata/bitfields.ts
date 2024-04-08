import type { DataType } from "../dataType";

// We only support packing booleans in packed structs at the moment.
export type ExtractBitFields<T> = ExtractMembers<T, boolean>;
export type ExcludeBitFields<T> = ExcludeMembers<T, boolean>;

export type RawType<T> = Omit<T, keyof DataType.Packed & keyof T>;

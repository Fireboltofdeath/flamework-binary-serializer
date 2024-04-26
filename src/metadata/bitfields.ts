import type { DataType } from "../dataType";

// We only support packing booleans in packed structs at the moment.
// We cannot use ExtractMembers and ExcludeMembers as they can leak `undefined`
export type ExtractBitFields<T> = Pick<T, ExtractKeys<T, boolean> & keyof T>;
export type ExcludeBitFields<T> = Omit<T, ExtractKeys<T, boolean> & keyof T>;

export type RawType<T> = Omit<T, keyof DataType.Packed & keyof T>;

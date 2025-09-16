/**
 * This namespace includes additional types that can be used in the binary
 * serializer.
 */
export namespace DataType {
	export type f32 = number & { _f32?: never };
	export type f64 = number & { _f64?: never };

	export type u8 = number & { _u8?: never };
	export type u16 = number & { _u16?: never };
	export type u32 = number & { _u32?: never };

	export type i8 = number & { _i8?: never };
	export type i16 = number & { _i16?: never };
	export type i32 = number & { _i32?: never };

	export type Packed<T> = T & { _packed?: [T] };
}

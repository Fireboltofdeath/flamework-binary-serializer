// This does not account for potential floating point drift but this is likely not an issue for axis aligned orientations.
export const AXIS_ALIGNED_ORIENTATIONS = [
	[0, 0, 0],
	[0, 180, 0],
	[90, 0, 0],
	[-90, -180, 0],
	[0, 180, 180],
	[0, 0, 180],
	[-90, 0, 0],
	[90, 180, 0],
	[0, 180, 90],
	[0, 0, -90],
	[0, 90, 90],
	[0, -90, -90],
	[0, 0, 90],
	[0, -180, -90],
	[0, -90, 90],
	[0, 90, -90],
	[-90, -90, 0],
	[90, 90, 0],
	[0, -90, 0],
	[0, 90, 0],
	[90, -90, 0],
	[-90, 90, 0],
	[0, 90, 180],
	[0, -90, -180],
].map(([x, y, z]) => CFrame.Angles(math.rad(x), math.rad(y), math.rad(z)));

/**
 * Returns a consistently ordered array for a specific Enum.
 *
 * We can't send Enum values over the network as the values aren't always within the 8 bit limit,
 * so instead we send the EnumItem's position in the array returned here.
 */
export function getSortedEnumItems(enumObject: Enum) {
	const enumItems = enumObject.GetEnumItems();
	enumItems.sort((a, b) => a.Value < b.Value);

	return enumItems;
}

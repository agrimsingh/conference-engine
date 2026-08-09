type ZipEntry = { path: string; bytes: Uint8Array; modifiedAt?: number };

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
	let value = n;
	for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
	return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(value: number): { date: number; time: number } {
	const date = new Date(value);
	const year = Math.max(1980, date.getUTCFullYear());
	return { date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(), time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2) };
}

function u16(value: number): Uint8Array { return Uint8Array.of(value & 255, (value >>> 8) & 255); }
function u32(value: number): Uint8Array { return Uint8Array.of(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255); }
function join(parts: Uint8Array[]): Uint8Array { const size = parts.reduce((sum, part) => sum + part.length, 0); const output = new Uint8Array(size); let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; } return output; }

/** Standards-compatible ZIP using the store method; R2 content is already compressed in many common deliverable formats. */
export function buildStoredZip(entries: readonly ZipEntry[]): Uint8Array {
	const encoder = new TextEncoder();
	const local: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;
	for (const entry of entries) {
		const name = encoder.encode(entry.path.replace(/^\/+|\.\.(?:\/|$)/g, "_"));
		const crc = crc32(entry.bytes);
		const stamp = dosDateTime(entry.modifiedAt ?? Date.now());
		const header = join([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(stamp.time), u16(stamp.date), u32(crc), u32(entry.bytes.length), u32(entry.bytes.length), u16(name.length), u16(0), name]);
		local.push(header, entry.bytes);
		central.push(join([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(stamp.time), u16(stamp.date), u32(crc), u32(entry.bytes.length), u32(entry.bytes.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
		offset += header.length + entry.bytes.length;
	}
	const directory = join(central);
	return join([...local, directory, u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(directory.length), u32(offset), u16(0)]);
}

export function safeZipSegment(value: string, fallback: string): string {
	return value.trim().replace(/[^a-zA-Z0-9._ -]+/g, "_").replace(/\s+/g, " ").slice(0, 100) || fallback;
}

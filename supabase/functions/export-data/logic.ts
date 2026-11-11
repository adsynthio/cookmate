// export-data logic (KIT-121): turn the household's rows into files and pack them into a zip.
// The zip is "stored" (no compression): exports are small JSON, and a tiny writer here avoids a dependency.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d: Date): [number, number] {
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2);
  const date = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return [time, date];
}

/** A zip archive of these files (UTF-8 names, no compression). */
export function zip(files: { name: string; data: Uint8Array }[], at: Date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const [time, date] = dosTime(at);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // names are UTF-8
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, f.data.length, true);
    lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local, f.data);
    centrals.push(central);
    offset += local.length + f.data.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + end.length);
  let at2 = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at2);
    at2 += part.length;
  }
  return out;
}

const README = `Cookmate data export

Everything Cookmate keeps about this household, one JSON file per table: the household, its members, their
taste and voice settings, consents, the kitchen (items and their history), memories, cooking sessions and
feedback, suggestions, shopping lists, saved dishes and the household's own recipes.

Not included: the shared recipe catalogue (it is the same for everyone) and internal AI request logs, which
hold no content and are deleted after 90 days.

This link stops working 24 hours after it was made. To delete everything, use You > Privacy > Delete my account.
`;

/** The files in an export: a README, then one JSON file per table, in a stable order. */
export function exportFiles(data: Record<string, unknown[]>, at: Date): { name: string; data: Uint8Array }[] {
  const enc = new TextEncoder();
  const stamp = at.toISOString().slice(0, 10);
  return [
    { name: `cookmate-${stamp}/README.txt`, data: enc.encode(README) },
    ...Object.keys(data)
      .sort()
      .map((table) => ({ name: `cookmate-${stamp}/${table}.json`, data: enc.encode(JSON.stringify(data[table], null, 2)) })),
  ];
}

export function exportPath(householdId: string, exportId: string): string {
  return `${householdId}/${exportId}.zip`;
}

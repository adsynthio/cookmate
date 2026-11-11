import { assertEquals } from "jsr:@std/assert@1";

import { crc32, exportFiles, exportPath, zip } from "./logic.ts";

Deno.test("crc32 matches the standard check value", () => {
  assertEquals(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

Deno.test("export files: readme first, one JSON per table in order", () => {
  const files = exportFiles({ memories: [{ statement: "Extra garlic" }], households: [{ name: "Asha" }] }, new Date("2026-11-11T10:00:00Z"));
  assertEquals(files.map((f) => f.name), ["cookmate-2026-11-11/README.txt", "cookmate-2026-11-11/households.json", "cookmate-2026-11-11/memories.json"]);
  assertEquals(JSON.parse(new TextDecoder().decode(files[2]!.data)), [{ statement: "Extra garlic" }]);
  assertEquals(exportPath("h1", "e1"), "h1/e1.zip");
});

Deno.test("zip opens with a standard unzip tool", async () => {
  const files = exportFiles({ households: [{ name: "आशा का घर" }] }, new Date("2026-11-11T10:00:00Z"));
  const bytes = zip(files, new Date("2026-11-11T10:00:00Z"));
  const dir = await Deno.makeTempDir();
  await Deno.writeFile(`${dir}/x.zip`, bytes);
  const test = await new Deno.Command("python3", { args: ["-I", "-c", "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print('\\n'.join(z.namelist())); print(z.read(z.namelist()[1]).decode())", `${dir}/x.zip`], stdout: "piped" }).output();
  const out = new TextDecoder().decode(test.stdout);
  assertEquals(test.code, 0);
  assertEquals(out.includes("cookmate-2026-11-11/households.json"), true);
  assertEquals(out.includes("आशा का घर"), true);
});

import { assertEquals } from "jsr:@std/assert@1";

import { thinkingOff } from "./thinking.ts";

Deno.test("Sonnet 5.5 turns thinking off with between_tools ('disabled' is a 400 there)", () => {
  assertEquals(thinkingOff("claude-sonnet-5-5"), { thinking: { type: "between_tools" } });
});

Deno.test("Haiku 5.5 keeps 'disabled'", () => {
  assertEquals(thinkingOff("claude-haiku-5-5"), { thinking: { type: "disabled" } });
});

Deno.test("Opus 5.x can't turn thinking off, so the field is left out", () => {
  assertEquals(thinkingOff("claude-opus-5-5"), {});
  assertEquals(thinkingOff("claude-opus-5"), {});
});

Deno.test("every model the functions use gets a setting it accepts", async () => {
  // Read the model ids straight from the function sources, so a new Sonnet call can't slip back to "disabled".
  const sources: string[] = [];
  for await (const dir of Deno.readDir(new URL("..", import.meta.url))) {
    if (!dir.isDirectory) continue;
    for await (const f of Deno.readDir(new URL(`../${dir.name}/`, import.meta.url))) {
      if (f.isFile && f.name.endsWith(".ts") && !f.name.endsWith(".test.ts") && !(dir.name === "_shared" && f.name === "thinking.ts")) {
        sources.push(await Deno.readTextFile(new URL(`../${dir.name}/${f.name}`, import.meta.url)));
      }
    }
  }
  const all = sources.join("\n");
  assertEquals(/thinking:\s*\{\s*type:\s*"disabled"/.test(all), false, "use ...thinkingOff(MODEL), not a literal thinking setting");
});

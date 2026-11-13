import { assertEquals } from "jsr:@std/assert@1";

import { buildIndex } from "../_shared/pantryParse.ts";
import { fromModel, fromOpenFoodFacts, MAX_IMAGE_CHARS, readBody } from "./logic.ts";

const index = buildIndex([
  { name: "toor dal", aliases: ["arhar dal", "tuvar dal"], latn: "toor dal", hi: "तूर दाल" },
  { name: "paneer", aliases: [], latn: "paneer", hi: "पनीर" },
  { name: "egg", aliases: ["anda", "eggs"], latn: "anda", hi: "अंडा" },
]);

Deno.test("requests: photo kinds need an image, barcodes need 8 to 14 digits", () => {
  assertEquals(readBody({ kind: "fridge", household_id: "h" }).ok, false);
  assertEquals(readBody({ kind: "bill", household_id: "h", image: "data:image/jpeg;base64,AAAA" }), {
    ok: true,
    body: { kind: "bill", householdId: "h", image: "AAAA", mediaType: "image/jpeg" },
  });
  assertEquals(readBody({ kind: "barcode", household_id: "h", code: "890 1234 5678 90" }), {
    ok: true,
    body: { kind: "barcode", householdId: "h", code: "8901234567890" },
  });
  assertEquals(readBody({ kind: "barcode", household_id: "h", code: "123" }).ok, false);
  assertEquals(readBody({ kind: "selfie", household_id: "h", image: "A" }).ok, false);
  const big = readBody({ kind: "fridge", household_id: "h", image: "A".repeat(MAX_IMAGE_CHARS + 1) });
  assertEquals(big.ok ? 0 : big.status, 413);
});

Deno.test("model output: unknown keys are dropped, bad amounts cleared, repeats merged", () => {
  const items = fromModel(
    [
      { said: "eggs", ingredient_key: "egg", quantity: 4, unit: "piece", location_kind: "fridge", state: null, confidence: 0.95 },
      { said: "egg", ingredient_key: "egg", quantity: 2, unit: "piece", location_kind: "fridge", state: null, confidence: 0.8 },
      { said: "mystery jar", ingredient_key: "unicorn", quantity: -1, unit: "jar", location_kind: "pantry", state: null, confidence: 1 },
      { said: "  ", ingredient_key: null, quantity: null, unit: null, location_kind: null, state: null, confidence: 1 },
    ],
    new Set(["egg", "paneer"]),
  );
  assertEquals(items.length, 2);
  assertEquals(items[0]!.quantity, 6);
  assertEquals(items[0]!.confidence, 0.8);
  assertEquals(items[1]!.ingredientKey, null);
  assertEquals(items[1]!.quantity, null);
  assertEquals(items[1]!.unit, null);
  assertEquals(Math.round(items[1]!.confidence * 10) / 10, 0.7);
});

Deno.test("barcodes: a packet's name maps to the catalog and its size becomes the amount", () => {
  const dal = fromOpenFoodFacts({ product_name: "Tata Sampann Unpolished Toor Dal", quantity: "1 kg" }, index);
  assertEquals(dal?.ingredientKey, "toor dal");
  assertEquals([dal?.quantity, dal?.unit], [1, "kg"]);
  const paneer = fromOpenFoodFacts({ product_name_en: "Amul Malai Paneer", quantity: "200 gm" }, index);
  assertEquals([paneer?.ingredientKey, paneer?.quantity, paneer?.unit], ["paneer", 200, "g"]);
  const odd = fromOpenFoodFacts({ product_name: "Chocolate wafer" }, index);
  assertEquals([odd?.ingredientKey, odd?.confidence], [null, 0.5]);
  assertEquals(fromOpenFoodFacts({ quantity: "500 g" }, index), null);
});

Deno.test("one photo mode: any picture, no need to say what it is", () => {
  assertEquals(readBody({ kind: "photo", household_id: "h", image: "AAAA" }), {
    ok: true,
    body: { kind: "photo", householdId: "h", image: "AAAA", mediaType: "image/jpeg" },
  });
});

// F9: grocery app search links.
import assert from "node:assert/strict";
import { test } from "node:test";

import { STORES, storeSearchUrl } from "./grocery.ts";

test("each store gets its own search link with the item encoded", () => {
  assert.equal(storeSearchUrl("blinkit", "toor dal"), "https://blinkit.com/s/?q=toor%20dal");
  assert.equal(storeSearchUrl("zepto", "  green   chilli "), "https://www.zeptonow.com/search?query=green%20chilli");
  assert.ok(storeSearchUrl("bigbasket", "a&b=c").endsWith("a%26b%3Dc"), "special characters can't change the link");
  for (const s of STORES) assert.ok(storeSearchUrl(s, "x").startsWith("https://"));
});

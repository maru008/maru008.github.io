import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../assets/js/researchmap.js", import.meta.url), "utf8");
const window = {
  location: { href: "https://example.test/publications.html", origin: "https://example.test", search: "" },
  localStorage: { getItem: () => null },
};
const currentYearElement = {};
const document = {
  documentElement: {},
  querySelectorAll: (selector) => selector === "[data-current-year]" ? [currentYearElement] : [],
};
const context = vm.createContext({ Date, Intl, URL, URLSearchParams, document, window });
vm.runInContext(source, context);

const { isFutureDate } = window.ResearchmapData;
const today = new Date(2026, 8, 14);

test("footer year is filled from the current year", () => {
  assert.equal(currentYearElement.textContent, String(new Date().getFullYear()));
});

test("future dates are detected at the available precision", () => {
  assert.equal(isFutureDate("2026-09-15", today), true);
  assert.equal(isFutureDate("2026-10", today), true);
  assert.equal(isFutureDate("2027", today), true);
});

test("today, past, open-ended, and invalid dates are not future", () => {
  assert.equal(isFutureDate("2026-09-14", today), false);
  assert.equal(isFutureDate("2026-09", today), false);
  assert.equal(isFutureDate("2026", today), false);
  assert.equal(isFutureDate("9999", today), false);
  assert.equal(isFutureDate("not-a-date", today), false);
});

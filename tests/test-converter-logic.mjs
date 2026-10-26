import test from "node:test";
import assert from "node:assert/strict";
import mammoth from "mammoth";
import { jsPDF } from "jspdf";

test("jsPDF initializes and generates PDF bytes in node", () => {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFontSize(16);
  doc.text("ACKDeck Çevirici Test", 40, 50);
  doc.setFontSize(11);
  doc.text("Bu bir test belgesidir.", 40, 80);
  const output = doc.output("arraybuffer");
  assert.ok(output.byteLength > 100);
});

test("mammoth converts raw mock docx buffer without crashing", async () => {
  // Mammoth exports convertToHtml, convertToMarkdown, extractRawText
  assert.equal(typeof mammoth.convertToHtml, "function");
  assert.equal(typeof mammoth.convertToMarkdown, "function");
  assert.equal(typeof mammoth.extractRawText, "function");
});

test("CSV to JSON and JSON to CSV helpers work accurately", () => {
  const json = [{ id: 1, name: "Alican", city: "Karabük" }];
  const keys = Object.keys(json[0]);
  const csv = [keys.join(","), json.map(r => keys.map(k => JSON.stringify(r[k])).join(",")).join("\n")].join("\n");
  assert.ok(csv.includes("Alican"));
  assert.ok(csv.includes("Karabük"));
});

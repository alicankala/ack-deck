import test from "node:test";
import assert from "node:assert/strict";
import { setupModules } from "./helpers.mjs";

const plain = (v) => JSON.parse(JSON.stringify(v));
const { extractSeriesBaseTitle, groupMediaSeries, buildMediaSections } = setupModules().load(
  "../shared/mediaGrouping"
);

test("extractSeriesBaseTitle normalizes franchise titles", () => {
  assert.equal(extractSeriesBaseTitle("The Hunger Games: Catching Fire"), "The Hunger Games");
  assert.equal(extractSeriesBaseTitle("The Hunger Games: Mockingjay - Part 2"), "The Hunger Games");
  assert.equal(extractSeriesBaseTitle("John Wick - Chapter 2"), "John Wick");
  assert.equal(extractSeriesBaseTitle("Safe"), "Safe");
});

test("groupMediaSeries groups multi-entry series chronologically and keeps singles separate", () => {
  const sample = [
    { id: "5", type: "movie", title: "The Hunger Games: The Ballad of Songbirds & Snakes", year: "2023", status: "planned", createdAt: 5, updatedAt: 5 },
    { id: "4", type: "movie", title: "The Hunger Games: Mockingjay - Part 2", year: "2015", status: "planned", createdAt: 4, updatedAt: 4 },
    { id: "1", type: "movie", title: "The Hunger Games", year: "2012", status: "planned", createdAt: 1, updatedAt: 1 },
    { id: "2", type: "movie", title: "The Hunger Games: Catching Fire", year: "2013", status: "planned", createdAt: 2, updatedAt: 2 },
    { id: "6", type: "game", title: "Kingdom Come: Deliverance II", year: "2025", status: "planned", createdAt: 6, updatedAt: 6 },
  ];

  const grouped = groupMediaSeries(sample);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].kind, "series");
  assert.equal(grouped[0].title, "The Hunger Games");
  assert.equal(grouped[0].yearRange, "2012–2023");
  assert.deepEqual(
    plain(grouped[0].items.map((i) => i.year)),
    ["2012", "2013", "2015", "2023"]
  );
  assert.equal(grouped[1].kind, "single");
  assert.equal(grouped[1].item.id, "6");
});

test("buildMediaSections orders sections Devam Ediyor -> Listemde -> Bitirildi", () => {
  const sample = [
    { id: "1", type: "movie", title: "Safe", year: "2012", status: "completed", createdAt: 1, updatedAt: 1 },
    { id: "2", type: "movie", title: "The Hunger Games: Catching Fire", year: "2013", status: "planned", createdAt: 2, updatedAt: 2 },
    { id: "3", type: "movie", title: "The Hunger Games", year: "2012", status: "in_progress", createdAt: 3, updatedAt: 3 },
  ];

  const sections = buildMediaSections(sample, { groupSeries: true });
  assert.deepEqual(
    plain(sections.map((s) => s.status)),
    ["in_progress", "planned", "completed"]
  );
  assert.equal(sections[0].label, "Devam Ediyor");
  assert.equal(sections[1].label, "Listemde");
  assert.equal(sections[2].label, "Bitirildi");
});

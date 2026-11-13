import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  genericSoftwareIconUrl,
  localSoftwareIconUrl,
  softwareArtworkById,
  softwareArtworkCatalogIds
} from "../../src/workbench/softwareArtworkRegistry.ts";
import { publicSoftwareIconUrl, SoftwareArtwork } from "../../src/workbench/SoftwareArtwork.tsx";

test("every managed OPL catalog identity has bundled PNG artwork", () => {
  assert.ok(softwareArtworkCatalogIds.length > 0);
  assert.equal(new Set(softwareArtworkCatalogIds).size, softwareArtworkCatalogIds.length);
  for (const id of softwareArtworkCatalogIds) {
    const icon = localSoftwareIconUrl(id);
    assert.ok(icon, `${id} must resolve to bundled artwork`);
    assert.match(icon, /\.png$/i, `${id} must use PNG artwork`);
  }
  assert.equal(new Set(softwareArtworkCatalogIds.map(id => softwareArtworkById[id])).size, softwareArtworkCatalogIds.length, "catalog entries should remain visually distinct");
  assert.match(genericSoftwareIconUrl, /\.png$/i);
});

test("remote artwork accepts immutable PNG/WebP only", () => {
  const png = `https://raw.githubusercontent.com/owner/app/${"a".repeat(40)}/plugins/app/assets/icon.png`;
  const webp = `https://raw.githubusercontent.com/owner/app/${"a".repeat(40)}/plugins/app/assets/icon.webp`;
  assert.equal(publicSoftwareIconUrl(png), png);
  assert.equal(publicSoftwareIconUrl(webp), webp);
  for (const value of [
    png.replace(/\.png$/, ".svg"),
    png.replace("raw.githubusercontent.com", "example.com"),
    `${png}?token=secret`,
    "file:///private/icon.png"
  ]) assert.equal(publicSoftwareIconUrl(value), undefined);
  assert.equal(publicSoftwareIconUrl(png, true), undefined);
});

test("artwork rendering never falls back to initials or type SVG", () => {
  const managed = renderToStaticMarkup(createElement(SoftwareArtwork, { identity: "mas", label: "Med Auto Science", kind: "agent" }));
  const unknown = renderToStaticMarkup(createElement(SoftwareArtwork, { identity: "pdf", label: "PDF", kind: "skill", iconUrl: "https://example.com/icon.svg" }));
  assert.match(managed, /data-artwork-source="bundled"/);
  assert.match(unknown, /data-artwork-source="generic"/);
  assert.match(managed, /<img[^>]+\.png/);
  assert.match(unknown, /<img[^>]+\.png/);
  assert.doesNotMatch(`${managed}${unknown}`, /opl-package-initials|opl-package-type-icon|<svg/);
});

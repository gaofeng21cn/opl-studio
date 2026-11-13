import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderer } from "./build-renderer.mjs";
import { rendererCacheKey, verifyRendererCache, sealRendererCache } from './desktop/renderer-build-cache.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "dist", "desktop");
let key = null;
try { key = rendererCacheKey({ studioRoot: root }); }
catch { console.warn('Renderer cache identity unavailable; compiling from source.'); }
const reusable = key !== null && verifyRendererCache(outDir, key);
if (process.argv.includes('--reuse-required') && !reusable) throw new Error('Requested compiled renderer does not match current inputs and bytes');
const metadata = reusable ? { cache: 'verified_hit', key } : buildRenderer({ outDir, htmlName: "index.html", jsName: "renderer.js" });
if (!reusable && key !== null) sealRendererCache(outDir, key);
console.log(JSON.stringify({ status: "desktop_renderer_build_passed", shared_renderer: true, ...metadata }, null, 2));

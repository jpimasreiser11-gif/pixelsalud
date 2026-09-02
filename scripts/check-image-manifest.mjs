import { access, readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("ops/images/manifest.json", "utf8"));
if (manifest.version !== 1 || !Array.isArray(manifest.publishedAssets)) {
  throw new Error("Invalid VARINO image manifest contract");
}

for (const asset of manifest.publishedAssets) {
  const required = ["file", "kind", "model", "license", "seed", "promptFile", "reviewed", "depictsRealClient"];
  for (const key of required) if (!(key in asset)) throw new Error(`${asset.file || "asset"}: missing ${key}`);
  if (asset.reviewed !== true) throw new Error(`${asset.file}: asset is not reviewed`);
  if (asset.depictsRealClient !== false) throw new Error(`${asset.file}: real-client depiction is forbidden without separate evidence`);
  await access(asset.file);
  await access(asset.promptFile);
}

if (manifest.status.startsWith("blocked") && manifest.publishedAssets.length !== 0) {
  throw new Error("A blocked manifest cannot publish generated raster assets");
}

const publicSource = await Promise.all([
  readFile("src/pages/index.astro", "utf8"),
  readFile("src/pages/servicios.astro", "utf8"),
  readFile("src/pages/experiencia.astro", "utf8"),
]);
if (manifest.status.startsWith("blocked") && publicSource.some((source) => /<img\b/i.test(source))) {
  throw new Error("Public pages reference raster images while provenance is blocked");
}

console.log(`Image manifest passed: ${manifest.publishedAssets.length} generated raster assets; fallback=${manifest.fallback}.`);

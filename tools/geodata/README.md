# India place atlas (offline birth-place search)

The customer app's birth-place picker searches an **offline** atlas bundled at
`apps/customer/assets/geo/` (sharded by the first two letters of the place name).
It is generated from the **GeoNames India** dump so it works with no network and
no rate limits — ~548k cities, towns and villages, each with coordinates + state.

## Regenerate
1. Download the GeoNames India dump: https://download.geonames.org/export/dump/IN.zip
2. Unzip and gzip the `IN.txt` into place:
   `gzip -c /path/to/IN.txt > tools/geodata/IN.txt.gz`
   (the raw dump is intentionally NOT committed — only the generated shards are)
3. Run: `node tools/geodata/build_atlas.js`
4. Commit the updated `apps/customer/assets/geo/`.

Runtime search + the online fallback live in
`apps/customer/lib/data/place_search_service.dart`.

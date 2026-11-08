# Project notes

- The single public site route is `/`; `/v1` redirects there for existing links.
- The interactive plant source data, CC0 license, original file hashes, and optimized geometry manifest are kept in `public/tengri/plant/`.
- The opening robotics image source and license are recorded in `public/tengri/media-sources.json`.
- Run `npm run typecheck` and `npm run build` when you want to check the project.

## Road rendering repair

The Infrastructure source contains 44 road-bed faces sharing the same height as 2,359 road-detail faces. `decodePlantSurface` separates the road beds by 15 mm using independent vertices, preserving the road details, equipment, and source asset. Both plant views use this decoder. The earlier global surface-offset adjustment and Infrastructure wireframe lift were removed.

- `node scripts/check-plant-roads.mjs` reproduces the original overlapping faces at three road locations, confirms their separation, and checks that other sections and source data remain unchanged.
- TypeScript checking passed.
- The Infrastructure view was isolated and rotated in a browser before and after the repair. The repaired road layers rendered throughout the drag with no uncaught browser errors.

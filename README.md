# Tengri

A Next.js 16, React 19, and TypeScript site for world models that help robots learn, test, and work in real factories.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:3000. For production, run `npm run build` then `npm start`.

## Site

- The home page is the Tengri site. The former `/v1` URL redirects to `/`.
- The navigation links to the interactive factory models, the platform overview, and contact details.
- `components/tengri/FactoryBlueprint.tsx` renders the interactive plant. Geometry and camera behavior live in `plantScene.ts`, `plantCamera.ts`, and `plantData.ts`.
- `components/tengri/Platform.tsx` describes the capture, simulate, and deploy workflow.
- `components/TengriMotion.tsx` loads the page's navigation, reveal, statement, and footer motion.
- `content/tengri.ts` holds the site description, contact email, and platform copy.

## Plant media

`public/tengri/plant/` contains the 16 sections of Stefan Johnsen's Falcon Gas Processing Plant, a fictional industrial reference released under CC0-1.0. The manifest records source file names, hashes, geometry counts, and sizes; the license is included alongside the data.

The plant conversion scripts are in `scripts/`. `prepare-plant.mjs` extracts optimized edges, `prepare-plant-surfaces.mjs` extracts simplified solid geometry, and the render scripts generate the plant preview images.

The opening factory image is by Hyundai Motor Group and is used under the Pexels License. Source and license details are recorded in `public/tengri/media-sources.json`.

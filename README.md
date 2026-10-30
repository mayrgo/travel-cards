# Travel Cards

A personal travel atlas: a live day/night globe, a place journal, future trip pins, and postcards. The current prototype runs as a static site and keeps place data in browser local storage.

## Run locally

Open `index.html` in a modern browser, or serve the folder over HTTP (for example `python3 -m http.server 8000`) and visit `http://localhost:8000`. The 3D globe uses Three.js from jsDelivr and Earth day/night textures from the Three.js examples site, so those assets need an internet connection.

## Prototype notes

- Drag the globe to rotate it; use the plus/minus controls or scroll to zoom.
- The terminator uses the current UTC time and an approximate solar ephemeris. City lights show on the night side.
- Add places to either the visited or planned list. These records are saved in this browser only.
- The photo picker previews images in the current session. A durable photo library and sync are not connected yet.
- Example destinations and counts are demo content. Replace them with your own places.

## Suggested integrations and data

1. **Globe and boundaries:** Three.js is a good fit for a custom shaded sphere and shader-driven day/night. For a mature, zoomable geographic map, MapLibre GL JS with OpenStreetMap-derived vector tiles is a strong alternative. Natural Earth is useful for country outlines and GeoJSON; OpenStreetMap can supply cities, parks, and named landmarks. Keep region geometry separate from visit records so the visit rule can be country, city, or individual point.
2. **Day/night and city glow:** Compute the solar direction locally from UTC (as this prototype does), and use a public Earth-at-night raster such as NASA/NOAA imagery for the light texture. Verify imagery license, attribution, resolution, and refresh cadence before production.
3. **Places and search:** Start with curated destination data and geocoding through Nominatim for a personal prototype; follow the public service usage policy and avoid bulk or high-volume use. For production traffic, host data or select a geocoding provider with an appropriate service plan.
4. **Photos:** For an individual, use local uploads first, with IndexedDB for durable browser storage. For multi-device sync, use a private object bucket (Supabase Storage or Cloudflare R2) plus a small database for photo metadata and place links. An Apple Photos import or Google Photos integration would depend on their current API and permission constraints; a simple upload/export workflow is the least brittle start.
5. **Sync and backup:** Supabase (Postgres, Auth, Storage) is a practical single-vendor option for private cross-device sync. Keep an export-to-JSON/GeoJSON feature so the atlas remains portable.

## A flexible way to define “visited”

Store a visit as an entity with a `scope`: `country`, `city`, `area`, or `point`. Countries can be marked visited after one qualifying trip; cities can track repeat visits; an area or point can represent a trail, island, museum, or natural landmark. Attach dates, notes, photos, and optional geometry to each visit. That lets the map color an entire country while still showing separately visited places inside it.

## Next steps

- Replace demo locations with editable searchable records and a map click-to-pin flow.
- Add GeoJSON boundaries and a visit-scope editor, then color visited geometry on the globe.
- Persist photos in IndexedDB and add place/date associations.
- Add export/import, then authentication and private sync if cross-device access is wanted.

# Travel Cards

A personal travel atlas: a live day/night globe, a place journal, future trip pins, and postcards. The static site is published with GitHub Pages. Place data is stored in IndexedDB on this browser; use **Export data** / **Import** in the header to move a versioned JSON backup between devices.

## Run locally

Open `index.html` in a modern browser, or serve the folder over HTTP (for example `python3 -m http.server 8000`) and visit `http://localhost:8000`. The 3D globe uses Three.js from jsDelivr and Earth day/night textures from the Three.js examples site, so those assets need an internet connection.

## Prototype notes

- Drag the globe to rotate it; use the plus/minus controls or scroll to zoom.
- Add a place, type a name, choose **Find on map**, select a result, then choose what the map should fill: country, city/municipality, area, or exact point. Region scopes require polygon geometry; if search returns only a point, choose **Exact place** or select a result with a boundary.
- The terminator uses UTC solar declination and equation of time, aligned to the Earth texture. The globe stays still until you drag it, so turning it changes the view without changing the simulated time. City lights show only on the dark side.
- Optional city checklists group several city targets and show visited progress. Countries use a single-entry completion rule; visits and future trip plans are separate records.
- The browser model separates geographic regions, coverage targets, visit records, and goal groups. A region stores GeoJSON and source metadata; targets carry the completion rule; visits preserve dates and notes.
- Add places to either the visited or planned list. These records are saved in this browser only.
- Export and import a versioned JSON backup from the header. The format includes a schema version for future server migration.
- The photo picker previews images in the current session. A durable photo library and sync are not connected yet.
- Place lookup is an explicit user search against the public Nominatim service, requesting available GeoJSON geometry for city boundaries. It caches results locally, does not autocomplete, and displays OpenStreetMap attribution. Follow its [usage policy](https://operations.osmfoundation.org/policies/nominatim/) and replace the endpoint with a self-hosted or provider service if usage grows.
- The atlas starts empty. Personal data stays in IndexedDB on this browser; the public GitHub repository does not contain personal travel records.

## Suggested integrations and data

1. **Globe and boundaries:** Three.js renders the custom day/night globe and spherical GeoJSON. Country, city, area, and point are separate region scopes; regions keep their boundary source and geometry, targets carry completion rules, visits capture real trips, and city groups support a finite checklist. For broader tile-driven mapping, MapLibre GL JS remains a possible renderer adapter.
2. **Day/night and city glow:** Compute the solar direction locally from UTC (as this prototype does), and use a public Earth-at-night raster such as NASA/NOAA imagery for the light texture. Verify imagery license, attribution, resolution, and refresh cadence before production.
3. **Places and search:** Start with curated destination data and geocoding through Nominatim for a personal prototype; follow the public service usage policy and avoid bulk or high-volume use. For production traffic, host data or select a geocoding provider with an appropriate service plan.
4. **Photos:** For an individual, use local uploads first, with IndexedDB for durable browser storage. For multi-device sync, use a private object bucket (Supabase Storage or Cloudflare R2) plus a small database for photo metadata and place links. An Apple Photos import or Google Photos integration would depend on their current API and permission constraints; a simple upload/export workflow is the least brittle start.
5. **Sync and backup:** GitHub Pages serves only the static app; it does not store personal edits. The IndexedDB adapter in `data-store.js` is the migration seam: replace it with a REST API when the personal server is available. A self-hosted API plus PostgreSQL/PostGIS and private Immich asset references is a portable setup. Keep the JSON export so the atlas remains portable.

## Personal server migration

Docker is available on the home server. A practical self-hosted version can use Docker Compose with a private API and PostgreSQL/PostGIS for regions and goals; mount database backups to a known storage volume. The versioned JSON backup is the import format, and `data-store.js` is the browser/server boundary.

Immich is already available for the photo library, so the preferred photo workflow is to associate an atlas place with an Immich asset rather than duplicate the whole library. Confirm Immich API access, reverse-proxy routing, and authentication before implementing it. Any Immich credential belongs in the server-side environment, never in this public static site. The screenshot does not establish a public server address, HTTPS, or proxy configuration; until those are known, keep personal data and service credentials off GitHub Pages.

## A flexible way to define “visited”

Store regions, targets, visits, and groups separately. A target records its unit (`country`, `city`, `area`, or `point`) and completion rule; a visit records its date, note, and future photo references. A country target can use a single qualifying visit, while each city target can be tracked separately. Parent links let a country and its cities be colored at different levels.

## Next steps

- Add editing and deletion for regions, targets, visits, and city groups.
- Add manual boundary drawing for places without a suitable sourced polygon.
- Persist photo previews in IndexedDB, then add Immich asset linking when the server is available.
- When the personal server is available, add a REST storage adapter and import the JSON backup; then add authentication and private photo sync.

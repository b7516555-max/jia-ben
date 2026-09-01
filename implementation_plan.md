# Jia-ben Place Enrichment Engine

## Architecture

- Plain HTML and JavaScript on GitHub Pages.
- Firestore collection: `artifacts/letseat-366e9/public/data/jiaPlaces`.
- Firestore quota collection: `artifacts/letseat-366e9/public/data/placesApiUsage`.
- Commercial secrets remain in Apps Script Properties and are accessed only through the existing `doPost` router.
- Google Maps, Places, and Places Photos remain disabled.

## Runtime flow

1. Open a restaurant detail.
2. Resolve its existing `jiaPlaceId` and read the Firebase document.
3. Detect only missing `photo`, `address`, `phone`, `website`, `openingHours`, and `price` fields.
4. Respect the 24-hour cooldown.
5. Enrich in order: Nominatim, Overpass, Foursquare, HERE, Geoapify.
6. Check Firestore quota before every request. Missing commercial keys return `disabled_no_key` and do not make a provider request.
7. Merge only missing fields and write the normalized result back to `jiaPlaces`.

## Media and community data

- Block legacy Google Places photo endpoints from rendering, proxying, preloading, or caching.
- Keep blocked URLs only under `legacyMedia.googlePhotos`.
- Preserve safe user uploads from Google Drive; do not block all `googleusercontent.com` URLs.
- Placeholders are labelled `示意圖片` and never counted as community photos.
- Jia-ben ratings and user-entered per-person spend are aggregated separately from external ratings and price levels.

## Safety gates

- `jiaPlaces` must remain exactly 52 before, after, and after rerun.
- No old collection or legacy field is deleted.
- No commercial secret is committed.
- No Google Maps, Places, or Places Photos network request is allowed.

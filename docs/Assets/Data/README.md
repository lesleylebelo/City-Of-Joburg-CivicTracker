# Johannesburg map source

The landing-page street map uses the City of Johannesburg Corporate Geo-Informatics boundary, downloaded on 16 November 2026:

- [CITY, layer 0](https://ags.joburg.org.za/server/rest/services/FeatureServices/CGIS_CORE_DATA/FeatureServer/0)
- [REGION, layer 1](https://ags.joburg.org.za/server/rest/services/FeatureServices/CGIS_CORE_DATA/FeatureServer/1)

Both GeoJSON files use WGS84 longitude/latitude (`outSR=4326`). The city has `CITY_ID=COJ`; its seven region records also have `CITY_ID=COJ`. The service does not supply a boundary effective date, so the retrieval date must not be described as a legal boundary revision date. Verify the source again before treating this snapshot as current regulatory data.

To refresh, query each layer's `/query` endpoint with `where=CITY_ID='COJ'`, `outFields=*`, `outSR=4326`, and `f=geojson`. Save the results to the corresponding GeoJSON files, update the retrieval date here and in the SVG description, then run from the repository root:

```powershell
node scripts/build-johannesburg-map.cjs
node scripts/build-johannesburg-map.cjs --check
```

The builder maintains the static SVG fallback for browsers without JavaScript. It verifies the municipality and region IDs, projects the geometry to Web Mercator, places labels inside their regions, and clips every region and label to the municipal polygon.

## Interactive street map

`docs/Assets/JS/johannesburg-map.js` uses locally vendored Leaflet 1.9.4 and the saved municipal GeoJSON. It requests visible street tiles from `https://tile.openstreetmap.org/{z}/{x}/{y}.png` when the map approaches the viewport. Roads and local place labels come from OpenStreetMap, not Google Maps. An internet connection is required for street tiles; no API key or SQL Server is needed.

Every tile is drawn to a transparent canvas through the municipal polygon using the even-odd clipping rule. Neighbouring geography is never painted, including during movement and zoom. A dotted red outline marks the boundary. Leaflet's rectangular `maxBounds` limits panning; the polygon clip, rather than those rectangular bounds, ensures nothing outside Johannesburg appears. Users can zoom to street level, navigate with touch/mouse/keyboard, and reset to the whole municipality. Wheel zoom becomes active while the map has keyboard focus, so scrolling the landing page normally does not change the zoom.

The panel aligns with the landing page's content width. Its initial view fits the complete municipal boundary, and users can zoom into local streets. The “Show all Johannesburg” control restores the complete outline. OpenStreetMap and City GIS attribution sit inside the map. Loading and success announcements are available to assistive technology without a visible block below the map; errors and retry controls appear only when loading fails.

The map retains visible [OpenStreetMap attribution](https://www.openstreetmap.org/copyright), browser HTTP caching, and the normal browser Referer. It does not bulk-download, prefetch, or offer offline tile downloads. `keepBuffer: 0` avoids requesting an extra tile buffer. The tile URL is configured on the map element's `data-tile-url` attribute so a different licensed provider can be configured later, with its matching attribution. Tile hosting is subject to the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/), including best-effort availability; heavier traffic should use a suitable hosted provider. Failed tiles produce a visible retry action. Do not remove attribution or apply a no-referrer policy to this page.

This map does not display live issue reports, validate report coordinates, or change server authorization. The existing address-name filter must not be mistaken for polygon-based server enforcement. Requests to the tile provider disclose the normal browser connection metadata and viewed tile coordinates; no CivicTrack account data is sent by this component.

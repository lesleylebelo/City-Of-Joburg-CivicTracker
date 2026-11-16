# Johannesburg map source

The landing-page map uses the City of Johannesburg Corporate Geo-Informatics public GIS service, downloaded on 16 November 2026:

- [CITY, layer 0](https://ags.joburg.org.za/server/rest/services/FeatureServices/CGIS_CORE_DATA/FeatureServer/0)
- [REGION, layer 1](https://ags.joburg.org.za/server/rest/services/FeatureServices/CGIS_CORE_DATA/FeatureServer/1)

Both GeoJSON files use WGS84 longitude/latitude (`outSR=4326`). The city has `CITY_ID=COJ`; its seven region records also have `CITY_ID=COJ`. The service does not supply a boundary effective date, so the retrieval date must not be described as a legal boundary revision date. Verify the source again before treating this snapshot as current regulatory data.

To refresh, query each layer's `/query` endpoint with `where=CITY_ID='COJ'`, `outFields=*`, `outSR=4326`, and `f=geojson`. Save the results to the corresponding GeoJSON files, update the retrieval date here and in the SVG description, then run from the repository root:

```powershell
node scripts/build-johannesburg-map.cjs
node scripts/build-johannesburg-map.cjs --check
```

The builder verifies the municipality and region IDs, projects the geometry to Web Mercator, places labels inside their regions, and clips every region and label to the municipal polygon. The SVG has a transparent exterior: no world basemap, tiles, neighbouring municipalities, or external runtime map service are displayed or requested. The full outline is always visible; there is no panning beyond the city.

This is a static administrative reference map, not live report data or a street map. It does not change report-location validation or server authorization. The existing address-name filter must not be mistaken for polygon-based server enforcement.

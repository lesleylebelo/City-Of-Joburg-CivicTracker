// Rebuild with: node scripts/build-johannesburg-map.cjs
// Source and refresh instructions: README.md#map-sources-and-third-party-attribution
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'docs/Assets/Data', name), 'utf8').replace(/^\uFEFF/, ''));
const city = read('johannesburg-boundary.geojson');
const regions = read('johannesburg-regions.geojson');
assert.equal(city.features.length, 1, 'The map must contain exactly one municipality');
assert.equal(city.features[0].properties.CITY_ID, 'COJ');
assert.equal(regions.features.length, 7, 'Expected Johannesburg regions A–G');
assert.deepEqual(regions.features.map(f => f.properties.REGION_ID).sort(), [1, 2, 3, 4, 5, 6, 7]);
assert.ok(regions.features.every(f => f.properties.CITY_ID === 'COJ'));

const rings = geometry => {
    assert.ok(['Polygon', 'MultiPolygon'].includes(geometry.type));
    return geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
};
// Web Mercator preserves the local shape, rather than stretching longitude/latitude.
const project = ([longitude, latitude]) => [longitude * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360))];
const boundary = rings(city.features[0].geometry).map(r => r.map(project));
const points = boundary.flat();
const minX = Math.min(...points.map(p => p[0])), maxX = Math.max(...points.map(p => p[0]));
const minY = Math.min(...points.map(p => p[1])), maxY = Math.max(...points.map(p => p[1]));
const width = 600, margin = 20, scale = (width - margin * 2) / (maxX - minX);
const height = Math.ceil((maxY - minY) * scale + margin * 2);
const screen = ([x, y]) => [(x - minX) * scale + margin, (y - minY) * scale + margin];
const outline = rs => rs.map(r => r.map((p, i) => `${i ? 'L' : 'M'}${screen(p).map(n => n.toFixed(2)).join(' ')}`).join('') + 'Z').join('');
const inside = (point, ring) => {
    let contained = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x, y] = point, [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) contained = !contained;
    }
    return contained;
};
const inRings = (point, rs) => rs.reduce((value, r) => value !== inside(point, r), false);
const segmentDistance = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
// Choose an interior label point, including concave regions and polygon holes.
const labelPoint = (rs, halfWidth = 58, halfHeight = 17) => {
    const ps = rs.flat();
    const left = Math.min(...ps.map(p => p[0])), right = Math.max(...ps.map(p => p[0]));
    const top = Math.min(...ps.map(p => p[1])), bottom = Math.max(...ps.map(p => p[1]));
    let best, clearance = -1;
    for (let x = 0; x < 40; x++) for (let y = 0; y < 40; y++) {
        const p = [left + (x + .5) / 40 * (right - left), top + (y + .5) / 40 * (bottom - top)];
        if (!inRings(p, rs) || !inRings(p, boundary)) continue;
        // Reserve room for the full label, not just its centre point.
        const labelBox = [-halfWidth, 0, halfWidth].flatMap(dx => [-halfHeight, 0, halfHeight].map(dy => [p[0] + dx / scale, p[1] + dy / scale]));
        if (!labelBox.every(corner => inRings(corner, rs) && inRings(corner, boundary))) continue;
        const distance = Math.min(...rs.flatMap(r => r.slice(1).map((b, i) => segmentDistance(p, r[i], b))));
        if (distance > clearance) { best = p; clearance = distance; }
    }
    return best && screen(best);
};
const fills = ['#343c31', '#29332e', '#3b3e31', '#303a35', '#394035', '#2e3730', '#373a2f'];
const regionPaths = [], labels = [];
for (const feature of regions.features.sort((a, b) => a.properties.REGION_ID - b.properties.REGION_ID)) {
    const id = feature.properties.REGION_ID;
    const rs = rings(feature.geometry).map(r => r.map(project));
    const horizontalLabel = labelPoint(rs);
    const position = horizontalLabel || labelPoint(rs, 36, 32);
    assert.ok(position, 'Each complete region label must fit inside its region and Johannesburg');
    const [x, y] = position;
    regionPaths.push(`<path data-region="${id}" d="${outline(rs)}" fill="${fills[id - 1]}" fill-rule="evenodd" stroke="#929b84" stroke-width="1.2"/>`);
    const letter = String.fromCharCode(64 + id);
    const text = horizontalLabel ? `Region ${letter}` : `<tspan x="${x.toFixed(2)}" dy="-12" font-size="20">Region</tspan><tspan x="${x.toFixed(2)}" dy="28" font-size="28">${letter}</tspan>`;
    labels.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" fill="#f5c518" font-family="Segoe UI,Arial,sans-serif" font-size="25" font-weight="700">${text}</text>`);
}
const d = outline(boundary);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="map-title map-description">
<title id="map-title">City of Johannesburg Metropolitan Municipality</title>
<desc id="map-description">Johannesburg's municipal boundary and seven administrative regions, A to G. No neighbouring municipalities are displayed. Source: City of Johannesburg Corporate Geo-Informatics, retrieved 16 November 2026.</desc>
<defs><clipPath id="johannesburg-only"><path d="${d}" clip-rule="evenodd"/></clipPath></defs>
<g clip-path="url(#johannesburg-only)"><path d="${d}" fill="#30382e" fill-rule="evenodd"/>
${regionPaths.join('\n')}
${labels.join('\n')}
</g>
<path d="${d}" fill="none" stroke="#f5c518" stroke-width="2.5" stroke-linejoin="round"/>
</svg>
`;
const destination = path.join(root, 'docs/Assets/Images/johannesburg-map.svg');
if (process.argv.includes('--check')) {
    assert.equal(fs.readFileSync(destination, 'utf8'), svg, 'Run the map builder to refresh the SVG');
    console.log('Map verified: one Johannesburg boundary, seven regions, interior labels, polygon clipping.');
} else {
    fs.writeFileSync(destination, svg);
    console.log(`Built Johannesburg-only SVG map (${Math.round(Buffer.byteLength(svg) / 1024)} KB).`);
}

/* Johannesburg-only street map. Tiles are clipped before they are displayed. */
(() => {
    'use strict';
    const scriptUrl = document.currentScript.src;
    const host = document.getElementById('johannesburg-street-map');
    const status = document.getElementById('johannesburg-map-status');
    const retry = document.getElementById('johannesburg-map-retry');
    const controls = [...document.querySelectorAll('[data-map-action]')];
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let map, tiles, starting = false;
    const failedTiles = new Set();
    const message = 'Johannesburg street map loaded.';
    const showTileStatus = () => {
        status.textContent = failedTiles.size ? 'Some streets could not load. Check your connection and retry.' : message;
        status.dataset.state = failedTiles.size ? 'error' : 'ready';
        retry.hidden = !failedTiles.size;
    };

    async function start() {
        if (starting) return;
        if (tiles) {
            failedTiles.clear();
            status.dataset.state = 'loading';
            status.textContent = 'Loading streets and local places…';
            retry.hidden = true;
            tiles.redraw();
            return;
        }
        starting = true;
        status.dataset.state = 'loading';
        status.textContent = 'Loading Johannesburg street map…';
        retry.hidden = true;
        try {
            if (!window.L) throw new Error('Map library unavailable');
            const response = await fetch(new URL('../Data/johannesburg-boundary.geojson', scriptUrl));
            if (!response.ok) throw new Error('Boundary unavailable');
            const data = await response.json();
            if (data.features?.length !== 1 || data.features[0].properties.CITY_ID !== 'COJ') throw new Error('Unexpected municipality');
            const geometry = data.features[0].geometry;
            if (!['Polygon', 'MultiPolygon'].includes(geometry.type)) throw new Error('Invalid boundary');
            const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
            const boundary = L.geoJSON(data, {
                interactive: false,
                style: { color: '#ef4444', weight: 3, dashArray: '1 7', lineCap: 'round', fill: false, smoothFactor: 0 }
            });
            const bounds = boundary.getBounds();
            map = L.map(host, {
                maxBounds: bounds, maxBoundsViscosity: 1, maxZoom: 19,
                zoomControl: false, scrollWheelZoom: false,
                zoomAnimation: !reducedMotion, fadeAnimation: !reducedMotion,
                markerZoomAnimation: false, attributionControl: true
            });
            map.attributionControl.setPrefix(false);
            map.attributionControl.setPosition('topright');
            const reset = () => map.fitBounds(bounds, { padding: [24, 24], animate: false });
            reset();
            const updateMinimumZoom = () => {
                // getBoundsZoom honours the current minimum: release the previous
                // desktop limit before calculating a smaller mobile overview.
                map.setMinZoom(0);
                map.setMinZoom(Math.max(0, map.getBoundsZoom(bounds, false, L.point(48, 48))));
            };
            updateMinimumZoom();

            // Unlike an opaque overlay, per-tile clipping never reveals neighbouring
            // geography during loading, dragging, pinch gestures, or zoom animation.
            const clippedTiles = L.GridLayer.extend({
                createTile(coords, done) {
                    const canvas = document.createElement('canvas');
                    const size = this.getTileSize();
                    canvas.width = size.x;
                    canvas.height = size.y;
                    canvas.setAttribute('aria-hidden', 'true');
                    const context = canvas.getContext('2d');
                    context.beginPath();
                    for (const ring of rings) {
                        ring.forEach(([longitude, latitude], index) => {
                            const p = L.CRS.EPSG3857.latLngToPoint(L.latLng(latitude, longitude), coords.z);
                            context[index ? 'lineTo' : 'moveTo'](p.x - coords.x * size.x, p.y - coords.y * size.y);
                        });
                        context.closePath();
                    }
                    context.clip('evenodd');
                    const image = new Image();
                    image.crossOrigin = 'anonymous';
                    image.referrerPolicy = 'strict-origin-when-cross-origin';
                    const key = `${coords.z}/${coords.x}/${coords.y}`;
                    image.onload = () => {
                        context.drawImage(image, 0, 0, size.x, size.y);
                        failedTiles.delete(key);
                        showTileStatus();
                        host.dataset.mapReady = 'true';
                        done(null, canvas);
                    };
                    image.onerror = () => {
                        failedTiles.add(key);
                        showTileStatus();
                        done(new Error('Street tile unavailable'), canvas);
                    };
                    // Browser HTTP caching and the normal Referer are preserved.
                    image.src = L.Util.template(host.dataset.tileUrl, coords);
                    return canvas;
                }
            });
            tiles = new clippedTiles({
                bounds, noWrap: true, tileSize: 256, maxZoom: 19,
                keepBuffer: 0, updateWhenIdle: true,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> | <a href="https://ags.joburg.org.za/server/rest/services/FeatureServices/CGIS_CORE_DATA/FeatureServer" target="_blank" rel="noopener noreferrer">City GIS boundary</a>'
            }).addTo(map);
            boundary.addTo(map);
            const updateControls = () => {
                controls.find(b => b.dataset.mapAction === 'zoom-in').disabled = map.getZoom() >= map.getMaxZoom();
                controls.find(b => b.dataset.mapAction === 'zoom-out').disabled = map.getZoom() <= map.getMinZoom();
            };
            controls.forEach(button => {
                button.disabled = false;
                button.addEventListener('click', () => {
                    const action = button.dataset.mapAction;
                    if (action === 'reset') reset();
                    else if (action === 'zoom-in') map.zoomIn();
                    else map.zoomOut();
                });
            });
            host.addEventListener('focusin', () => map.scrollWheelZoom.enable());
            host.addEventListener('focusout', () => map.scrollWheelZoom.disable());
            map.on('zoomend', updateControls);
            new ResizeObserver(() => {
                const showingWholeCity = map.getZoom() === map.getMinZoom();
                map.invalidateSize({ pan: false });
                updateMinimumZoom();
                if (showingWholeCity) reset();
                updateControls();
            }).observe(host);
            updateControls();
            host.dataset.mapInitialized = 'true';
        } catch {
            if (map) map.remove();
            map = null;
            tiles = null;
            controls.forEach(button => { button.disabled = true; });
            status.textContent = 'The street map could not load. Check your connection and retry.';
            status.dataset.state = 'error';
            retry.hidden = false;
        } finally {
            starting = false;
        }
    }
    retry.addEventListener('click', start);
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); start(); }
        }, { rootMargin: '200px' });
        observer.observe(host);
    } else start();
})();

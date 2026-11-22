const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { MAX_IMAGE_BYTES, validateImage } = require('./image_validation');

const unavailable = () => Object.assign(new Error('Image storage unavailable.'), { status: 503 });
const missing = () => Object.assign(new Error('Image not found.'), { status: 404, code: 'ENOENT' });

function createSupabaseImageStorage(env = process.env, request = globalThis.fetch) {
    let project;
    try { project = new URL(env.SUPABASE_URL); } catch { throw new Error('Configure private Supabase image storage.'); }
    const key = env.SUPABASE_SECRET_KEY;
    const bucket = env.SUPABASE_IMAGE_BUCKET || 'civictrack-issue-images';
    if (project.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(project.hostname) ||
        project.port || project.username || project.password || project.pathname !== '/' || project.search || project.hash ||
        !/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key || '') || !/^[a-z0-9][a-z0-9-]{2,62}$/.test(bucket)) {
        throw new Error('Configure private Supabase image storage.');
    }
    const timeout = /^\d+$/.test(env.IMAGE_STORAGE_TIMEOUT_MS || '') ? Number(env.IMAGE_STORAGE_TIMEOUT_MS) : 15000;
    if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 60000) throw new Error('Invalid image storage timeout.');
    const base = project.origin + '/storage/v1';
    function identifier(id) {
        if (typeof id !== 'string' || !/^issue-[A-Za-z0-9-]+\.(?:png|jpe?g|gif|webp)$/i.test(id)) throw missing();
        return encodeURIComponent(id);
    }
    async function send(route, options = {}) {
        try {
            return await request(base + route, { ...options, redirect: 'error',
                signal: AbortSignal.timeout(timeout),
                headers: { ...options.headers, apikey: key } });
        } catch { throw unavailable(); }
    }
    async function checkReady() {
        const response = await send('/bucket/' + bucket);
        if (!response.ok) { await response.body?.cancel(); throw unavailable(); }
        let metadata;
        try { metadata = await response.json(); } catch { throw unavailable(); }
        const allowed = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
        if (metadata.id !== bucket || metadata.public !== false || Number(metadata.file_size_limit) !== MAX_IMAGE_BYTES ||
            !Array.isArray(metadata.allowed_mime_types) || metadata.allowed_mime_types.length !== allowed.size ||
            new Set(metadata.allowed_mime_types).size !== allowed.size ||
            !metadata.allowed_mime_types.every(type => allowed.has(type))) throw unavailable();
    }
    async function isMissing(response) {
        if (response.status === 404) { await response.body?.cancel(); return true; }
        // Storage also reports missing keys as HTTP 400 with statusCode="404".
        if (response.status === 400) {
            try { const body = await response.json(); return String(body.statusCode) === '404' || body.code === 'NoSuchKey'; }
            catch { return false; }
        }
        await response.body?.cancel();
        return false;
    }
    return {
        checkReady,
        async saveImage(file) {
            validateImage(file);
            const id = 'issue-' + randomUUID() + path.extname(file.originalname).toLowerCase();
            await checkReady();
            const response = await send('/object/' + bucket + '/' + identifier(id), {
                method: 'POST', headers: { 'Content-Type': file.mimetype, 'x-upsert': 'false', 'Cache-Control': 'no-store' },
                body: file.buffer
            });
            await response.body?.cancel();
            if (!response.ok) throw unavailable();
            return id;
        },
        async getImageStream(id) {
            const name = identifier(id);
            await checkReady();
            const response = await send('/object/authenticated/' + bucket + '/' + name);
            if (!response.ok) { if (await isMissing(response)) throw missing(); throw unavailable(); }
            if (!response.body || Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
                await response.body?.cancel(); throw unavailable();
            }
            let received = 0;
            const source = Readable.fromWeb(response.body);
            const bounded = new Transform({ transform(chunk, encoding, callback) {
                received += chunk.length;
                callback(received > MAX_IMAGE_BYTES ? unavailable() : null, received > MAX_IMAGE_BYTES ? undefined : chunk);
            } });
            source.on('error', () => bounded.destroy(unavailable()));
            bounded.on('close', () => source.destroy());
            return source.pipe(bounded);
        },
        async deleteImage(id) {
            const name = identifier(id);
            await checkReady();
            const response = await send('/object/' + bucket + '/' + name, { method: 'DELETE' });
            if (!response.ok) { if (await isMissing(response)) return; throw unavailable(); }
            await response.body?.cancel();
        }
    };
}
module.exports = { createSupabaseImageStorage };

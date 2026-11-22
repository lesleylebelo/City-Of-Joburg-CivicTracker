const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSupabaseImageStorage } = require('../supabase_image_storage');
const { createImageStorage, MAX_IMAGE_BYTES } = require('../image_storage');
const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=', 'base64');
const file = { originalname: 'fixture.png', mimetype: 'image/png', buffer: bytes };
const env = { SUPABASE_URL: 'https://fixtureproject.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_' + 'x'.repeat(32),
    SUPABASE_IMAGE_BUCKET: 'civictrack-issue-images' };
const metadata = () => ({ id: env.SUPABASE_IMAGE_BUCKET, public: false, file_size_limit: MAX_IMAGE_BYTES,
    allowed_mime_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] });
async function collect(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

test('Supabase private storage round-trips bytes without signed/public URLs or overwrite and survives an adapter restart', async () => {
    const objects = new Map(), calls = [];
    const request = async (url, options) => {
        const route = new URL(url).pathname;
        calls.push({ route, options });
        assert.equal(options.headers.apikey, env.SUPABASE_SECRET_KEY);
        assert.equal(options.headers.Authorization, undefined);
        assert.equal(options.redirect, 'error');
        if (route.includes('/bucket/')) return Response.json(metadata());
        const id = route.split('/').at(-1);
        if (options.method === 'POST') {
            assert.equal(options.headers['x-upsert'], 'false');
            assert.ok(!objects.has(id));
            objects.set(id, Buffer.from(options.body));
            return Response.json({ Key: id });
        }
        if (options.method === 'DELETE') { objects.delete(id); return Response.json({ message: 'deleted' }); }
        assert.ok(route.includes('/object/authenticated/'));
        return objects.has(id) ? new Response(objects.get(id)) : Response.json({ statusCode: '404' }, { status: 400 });
    };
    const first = createSupabaseImageStorage(env, request);
    const id = await first.saveImage(file);
    assert.match(id, /^issue-[a-f0-9-]+\.png$/);
    const restarted = createSupabaseImageStorage(env, request);
    assert.deepEqual(await collect(await restarted.getImageStream(id)), bytes);
    await restarted.deleteImage(id);
    await restarted.deleteImage(id);
    await assert.rejects(restarted.getImageStream(id), { status: 404, code: 'ENOENT' });
    assert.ok(calls.every(call => !call.route.includes('/public/') && !call.route.includes('/sign/')));
});

test('invalid uploads and image paths are rejected before sending server credentials anywhere', async () => {
    let calls = 0;
    const storage = createSupabaseImageStorage(env, async () => { calls++; throw new Error('Do not contact storage.'); });
    await assert.rejects(storage.saveImage({ ...file, buffer: Buffer.from('not an image') }), { status: 400 });
    for (const id of ['../outside.png', '..\\outside.png', '.hidden', 'https://elsewhere.example/image.png', 'issue-test.png?x=1']) {
        await assert.rejects(storage.getImageStream(id), { status: 404 });
        await assert.rejects(storage.deleteImage(id), { status: 404 });
    }
    assert.equal(calls, 0);
    for (const patch of [{ SUPABASE_URL: 'http://fixtureproject.supabase.co' },
        { SUPABASE_URL: 'https://fixtureproject.supabase.co.evil.example' },
        { SUPABASE_URL: 'https://fixtureproject.supabase.co/path' }, { SUPABASE_SECRET_KEY: 'sb_publishable_fake' },
        { SUPABASE_IMAGE_BUCKET: '../other' }]) {
        assert.throws(() => createSupabaseImageStorage({ ...env, ...patch }));
    }
});

test('public/misconfigured buckets and provider errors fail closed with generic output and no disk fallback', async () => {
    for (const patch of [{ public: true }, { file_size_limit: null }, { allowed_mime_types: ['image/svg+xml'] },
        { id: 'other-bucket' }]) {
        let objectCalls = 0;
        const storage = createSupabaseImageStorage(env, async url => {
            if (!url.includes('/bucket/')) objectCalls++;
            return Response.json({ ...metadata(), ...patch });
        });
        await assert.rejects(storage.saveImage(file), { status: 503 });
        assert.equal(objectCalls, 0);
    }
    const failing = createSupabaseImageStorage(env, async () => { throw new Error(env.SUPABASE_SECRET_KEY); });
    await assert.rejects(failing.checkReady(), { message: 'Image storage unavailable.', status: 503 });
    assert.throws(() => createImageStorage({ NODE_ENV: 'production', IMAGE_STORAGE_PROVIDER: 'local' }));
    assert.throws(() => createImageStorage({ IMAGE_STORAGE_PROVIDER: 'unknown' }));
});

test('storage bounds declared and streamed image sizes and propagates read failures safely', async () => {
    const id = 'issue-fixture.png';
    for (const response of [
        () => new Response(bytes, { headers: { 'content-length': String(MAX_IMAGE_BYTES + 1) } }),
        () => new Response(new ReadableStream({ start(controller) {
            controller.enqueue(new Uint8Array(MAX_IMAGE_BYTES));
            controller.enqueue(new Uint8Array(1));
            controller.close();
        } }))
    ]) {
        const storage = createSupabaseImageStorage(env, async url => url.includes('/bucket/') ? Response.json(metadata()) : response());
        await assert.rejects(async () => collect(await storage.getImageStream(id)), { status: 503 });
    }
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createLocalImageStorage, MAX_IMAGE_BYTES } = require('../image_storage');

async function withStorage(check) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'civictrack-images-'));
    try { await check(createLocalImageStorage(root), root); }
    finally {
        // Remove only files in this test's own uniquely created directory; no recursive deletion.
        for (const entry of await fs.readdir(root)) await fs.unlink(path.join(root, entry));
        await fs.rmdir(root);
    }
}
const fixtures = [
    ['jpg', 'image/jpeg', Buffer.from('ffd8ffe000104a4649460001ffd9', 'hex')],
    ['png', 'image/png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=', 'base64')],
    ['gif', 'image/gif', Buffer.from('GIF89a', 'ascii')],
    ['webp', 'image/webp', Buffer.from('524946460400000057454250', 'hex')]
];

test('allowed signatures round-trip through local save, private stream and idempotent delete', async () => {
    await withStorage(async storage => {
        for (const [extension, mimetype, buffer] of fixtures) {
            const id = await storage.saveImage({ originalname: 'fixture.' + extension, mimetype, buffer });
            assert.match(id, new RegExp('^issue-[0-9]+-[0-9]+\\.' + extension + '$'));
            const chunks = [];
            for await (const chunk of await storage.getImageStream(id)) chunks.push(chunk);
            assert.deepEqual(Buffer.concat(chunks), buffer);
            await storage.deleteImage(id);
            await storage.deleteImage(id);
            await assert.rejects(storage.getImageStream(id), { code: 'ENOENT' });
        }
    });
});

test('spoofed MIME/extension, truncated signatures and oversized images leave no files', async () => {
    await withStorage(async (storage, root) => {
        for (const file of [
            { originalname: 'fake.png', mimetype: 'image/png', buffer: Buffer.from('<script>bad</script>') },
            { originalname: 'fake.jpg', mimetype: 'image/jpeg', buffer: fixtures[1][2] },
            { originalname: 'fake.svg', mimetype: 'image/png', buffer: fixtures[1][2] },
            { originalname: 'fake.png', mimetype: 'image/png', buffer: fixtures[1][2].subarray(0, 4) },
            { originalname: 'fake.png', mimetype: 'image/png', buffer: Buffer.alloc(MAX_IMAGE_BYTES + 1) }
        ]) {
            await assert.rejects(storage.saveImage(file), { status: 400, message: 'Only image files allowed!' });
            assert.deepEqual(await fs.readdir(root), []);
        }
    });
});

test('storage cannot read or delete outside its directory or access hidden files', async () => {
    await withStorage(async storage => {
        for (const id of ['../outside.png', '..\\outside.png', '.hidden', '/absolute.png']) {
            await assert.rejects(storage.getImageStream(id), { status: 404 });
            await assert.rejects(storage.deleteImage(id), { status: 404 });
        }
    });
});

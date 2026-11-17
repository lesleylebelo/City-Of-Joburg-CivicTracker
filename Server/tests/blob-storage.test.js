const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBlobImageStorage, createBlobContainerProvider } = require('../blob_image_storage');
const { createImageStorage, MAX_IMAGE_BYTES } = require('../image_storage');
const { fakeContainer } = require('./helpers/blob.cjs');
const file = { originalname: '../../resident-private-name.PNG', mimetype: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=', 'base64') };

test('blob save uses opaque type-derived names and correct MIME; read/delete preserve the interface', async () => {
    const fake = fakeContainer();
    const storage = createBlobImageStorage(async () => fake.client);
    const id = await storage.saveImage(file);
    assert.match(id, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.png$/);
    assert.equal(fake.state.blobs.get(id).contentType, 'image/png');
    const chunks = [];
    for await (const chunk of await storage.getImageStream(id)) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), file.buffer);
    await storage.deleteImage(id);
    await storage.deleteImage(id);
    assert.equal(fake.state.blobs.size, 0);
    await assert.rejects(storage.getImageStream(id), { code: 'ENOENT', message: 'Image not found.' });
});

test('shared signatures, MIME/extension and 5 MiB limit reject before any Blob access', async () => {
    const fake = fakeContainer();
    const storage = createBlobImageStorage(async () => fake.client);
    for (const bad of [
        { ...file, buffer: Buffer.from('not an image') },
        { ...file, buffer: Buffer.alloc(MAX_IMAGE_BYTES + 1) },
        { ...file, originalname: 'fixture.jpg' },
        { ...file, mimetype: 'image/jpeg' }
    ]) await assert.rejects(storage.saveImage(bad), { status: 400, message: 'Only image files allowed!' });
    assert.equal(fake.state.calls.length, 0);
    for (const id of ['../other.png', '..\\other.png', '.hidden.png', 'https://other.test/photo.png']) {
        await assert.rejects(storage.getImageStream(id), { status: 404 });
        await assert.rejects(storage.deleteImage(id), { status: 404 });
    }
    assert.equal(fake.state.calls.length, 0);
});

test('public containers and storage outages fail closed, recover, and never create or change ACLs', async () => {
    const fake = fakeContainer();
    const storage = createBlobImageStorage(async () => fake.client);
    for (const access of ['blob', 'container']) {
        fake.state.publicAccess = access;
        await assert.rejects(storage.saveImage(file), { status: 503, message: 'Image storage unavailable.' });
        await assert.rejects(storage.getImageStream('fixture.png'), { status: 503 });
        await assert.rejects(storage.deleteImage('fixture.png'), { status: 503 });
    }
    assert.equal(fake.state.blobs.size, 0);
    assert.ok(fake.state.calls.every(call => call.operation === 'properties'));
    fake.state.publicAccess = undefined;
    fake.state.unavailable = true;
    await assert.rejects(storage.saveImage(file), { status: 503 });
    fake.state.unavailable = false;
    assert.ok(await storage.saveImage(file));
});

test('mode defaults to local and Blob selection uses the injected container without network', async () => {
    const local = createImageStorage({});
    assert.equal(typeof local.saveImage, 'function');
    assert.throws(() => createImageStorage({ IMAGE_STORAGE: 'other' }), /Invalid IMAGE_STORAGE/);
    const fake = fakeContainer();
    const storage = createImageStorage({ IMAGE_STORAGE: 'blob' }, { getContainer: async () => fake.client });
    const id = await storage.saveImage(file);
    assert.ok(fake.state.blobs.has(id));
});

test('hosted configuration uses DefaultAzureCredential lazily and reuses the client', async () => {
    const fake = fakeContainer();
    let credentials = 0, constructions = 0;
    class Credential { constructor() { credentials++; } }
    class Service {
        constructor(url, credential) {
            constructions++;
            assert.equal(url, 'https://account.blob.core.windows.net');
            assert.ok(credential instanceof Credential);
        }
        getContainerClient(name) { assert.equal(name, 'private-images'); return fake.client; }
        static fromConnectionString() { assert.fail('Hosted path must not use a connection string'); }
    }
    const provider = createBlobContainerProvider({ AZURE_STORAGE_ACCOUNT_URL: 'https://account.blob.core.windows.net',
        AZURE_STORAGE_CONTAINER: 'private-images' }, { BlobServiceClient: Service, DefaultAzureCredential: Credential });
    assert.equal(constructions, 0);
    assert.equal(await provider(), fake.client);
    assert.equal(await provider(), fake.client);
    assert.equal(constructions, 1);
    assert.equal(credentials, 1);
});

test('only loopback emulator connection strings are accepted; account-key hosted paths and ambiguous fields are rejected', async () => {
    const fake = fakeContainer();
    let emulatorCalls = 0;
    class Service {
        static fromConnectionString() { emulatorCalls++; return { getContainerClient: () => fake.client }; }
    }
    const dependencies = { BlobServiceClient: Service };
    for (const connection of ['UseDevelopmentStorage=true', 'BlobEndpoint=http://127.0.0.1:10000/fixture']) {
        const provider = createBlobContainerProvider({ AZURE_STORAGE_CONTAINER: 'private-images', AZURE_STORAGE_CONNECTION_STRING: connection }, dependencies);
        assert.equal(await provider(), fake.client);
    }
    assert.equal(emulatorCalls, 2);
    for (const connection of ['BlobEndpoint=https://account.blob.core.windows.net',
        'UseDevelopmentStorage=true;DevelopmentStorageProxyUri=https://remote.example.invalid',
        'UseDevelopmentStorage=true;BlobEndpoint=https://remote.example.invalid',
        'BlobEndpoint=https://remote.example.invalid;BlobEndpoint=http://localhost:10000/fixture']) {
        const provider = createBlobContainerProvider({ AZURE_STORAGE_CONTAINER: 'private-images', AZURE_STORAGE_CONNECTION_STRING: connection }, dependencies);
        await assert.rejects(provider(), { status: 503, message: 'Image storage unavailable.' });
    }
    assert.equal(emulatorCalls, 2);
});

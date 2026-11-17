const { randomUUID } = require('node:crypto');
const { validateImage } = require('./image_validation');

const unavailable = () => Object.assign(new Error('Image storage unavailable.'), { status: 503 });
function localEndpoint(value) {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) &&
            ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
            !url.username && !url.password && !url.search && !url.hash;
    } catch { return false; }
}

function createBlobContainerProvider(env = process.env, dependencies = {}) {
    let container;
    return async () => {
        if (container) return container;
        try {
            if (!/^(?!.*--)[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.AZURE_STORAGE_CONTAINER || '')) throw unavailable();
            const { BlobServiceClient } = dependencies.BlobServiceClient ? dependencies : require('@azure/storage-blob');
            const connection = env.AZURE_STORAGE_CONNECTION_STRING;
            let service;
            if (connection) {
                // Account keys are never accepted for hosted endpoints. No values are logged.
                const entries = connection.split(';').filter(Boolean).map(part => {
                    const index = part.indexOf('=');
                    if (index < 1) throw unavailable();
                    return [part.slice(0, index).toLowerCase(), part.slice(index + 1)];
                });
                const fields = Object.fromEntries(entries);
                if (Object.keys(fields).length !== entries.length) throw unavailable();
                if ('usedevelopmentstorage' in fields) {
                    if (!/^UseDevelopmentStorage=true(?:;DevelopmentStorageProxyUri=[^;]+)?;?$/.test(connection)) throw unavailable();
                    if (fields.developmentstorageproxyuri && !localEndpoint(fields.developmentstorageproxyuri)) throw unavailable();
                } else if (!localEndpoint(fields.blobendpoint)) throw unavailable();
                service = BlobServiceClient.fromConnectionString(connection);
            } else {
                const url = new URL(env.AZURE_STORAGE_ACCOUNT_URL);
                if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw unavailable();
                const { DefaultAzureCredential } = dependencies.DefaultAzureCredential ? dependencies : require('@azure/identity');
                service = new BlobServiceClient(url.origin, new DefaultAzureCredential());
            }
            container = service.getContainerClient(env.AZURE_STORAGE_CONTAINER);
            return container;
        } catch { throw unavailable(); }
    };
}

function createBlobImageStorage(getContainer) {
    async function privateContainer() {
        try {
            const client = await getContainer();
            // Never create a container or change ACLs. The operator must provision it privately.
            const properties = await client.getProperties();
            if (properties.blobPublicAccess) throw unavailable();
            return client;
        } catch { throw unavailable(); }
    }
    function checkId(id) {
        if (typeof id !== 'string' || id.length > 255 || !/^[a-z0-9][a-z0-9._-]*\.(jpe?g|png|gif|webp)$/i.test(id)) {
            throw Object.assign(new Error('Invalid image identifier.'), { status: 404 });
        }
    }
    return {
        async saveImage(file) {
            const { contentType, extension } = validateImage(file);
            const id = randomUUID() + extension; // Extension comes from a fixed type map, never the submitted name.
            const container = await privateContainer();
            try {
                await container.getBlockBlobClient(id).uploadData(file.buffer, {
                    conditions: { ifNoneMatch: '*' }, blobHTTPHeaders: { blobContentType: contentType }
                });
                return id;
            } catch { throw unavailable(); }
        },
        async getImageStream(id) {
            checkId(id);
            const container = await privateContainer();
            try {
                const response = await container.getBlockBlobClient(id).download();
                if (!response.readableStreamBody) throw unavailable();
                return response.readableStreamBody;
            } catch (error) {
                if (error.code === 'BlobNotFound') throw Object.assign(new Error('Image not found.'), { code: 'ENOENT' });
                throw unavailable();
            }
        },
        async deleteImage(id) {
            checkId(id);
            const container = await privateContainer();
            try { await container.getBlockBlobClient(id).deleteIfExists(); }
            catch { throw unavailable(); }
        }
    };
}
module.exports = { createBlobImageStorage, createBlobContainerProvider };

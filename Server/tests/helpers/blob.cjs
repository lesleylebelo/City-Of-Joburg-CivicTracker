const { Readable } = require('node:stream');

// In-memory Azure Blob shape. No SDK authentication, network or container creation.
function fakeContainer() {
    const state = { blobs: new Map(), calls: [], publicAccess: undefined, unavailable: false };
    const client = {
        async getProperties() {
            state.calls.push({ operation: 'properties' });
            if (state.unavailable) throw new Error('Simulated storage outage');
            return { blobPublicAccess: state.publicAccess };
        },
        getBlockBlobClient(id) {
            return {
                async uploadData(bytes, options) {
                    state.calls.push({ operation: 'save', id });
                    if (state.blobs.has(id) && options.conditions.ifNoneMatch === '*') {
                        throw Object.assign(new Error('Already exists'), { statusCode: 412 });
                    }
                    state.blobs.set(id, { bytes: Buffer.from(bytes), contentType: options.blobHTTPHeaders.blobContentType });
                },
                async download() {
                    state.calls.push({ operation: 'read', id });
                    if (!state.blobs.has(id)) throw Object.assign(new Error('Missing fixture'), { code: 'BlobNotFound', statusCode: 404 });
                    return { readableStreamBody: Readable.from([state.blobs.get(id).bytes]) };
                },
                async deleteIfExists() {
                    state.calls.push({ operation: 'delete', id });
                    return { succeeded: state.blobs.delete(id) };
                }
            };
        }
    };
    return { state, client };
}
module.exports = { fakeContainer };

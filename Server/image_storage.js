const fs = require('node:fs');
const path = require('node:path');

const { MAX_IMAGE_BYTES, acceptsImageType, validateImage } = require('./image_validation');

// Both providers retain private /uploads URLs; Express authorizes every read.
function createLocalImageStorage(root = path.join(__dirname, 'uploads')) {
    function imagePath(id) {
        if (typeof id !== 'string' || !id || id.startsWith('.') || /[\\/]/.test(id) || id !== path.basename(id)) {
            throw Object.assign(new Error('Invalid image identifier.'), { status: 404 });
        }
        return path.join(root, id);
    }
    return {
        async saveImage(file) {
            validateImage(file);
            const id = 'issue-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
            await fs.promises.mkdir(root, { recursive: true });
            const destination = imagePath(id);
            // Exclusive creation prevents overwriting a pre-existing report photo.
            const handle = await fs.promises.open(destination, 'wx');
            try { await handle.writeFile(file.buffer); }
            catch (error) {
                await handle.close();
                await fs.promises.unlink(destination).catch(() => {});
                throw error;
            }
            await handle.close();
            return id;
        },
        async getImageStream(id) {
            const handle = await fs.promises.open(imagePath(id), 'r');
            return handle.createReadStream();
        },
        async deleteImage(id) {
            try { await fs.promises.unlink(imagePath(id)); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
    };
}
function createImageStorage(env = process.env, request) {
    const provider = env.IMAGE_STORAGE_PROVIDER || 'local';
    if (provider === 'supabase') return require('./supabase_image_storage').createSupabaseImageStorage(env, request);
    if (provider !== 'local' || env.NODE_ENV === 'production') {
        throw new Error('Production requires durable private Supabase image storage.');
    }
    return { ...createLocalImageStorage(), async checkReady() {} };
}
module.exports = { ...createImageStorage(), createImageStorage, createLocalImageStorage, acceptsImageType, MAX_IMAGE_BYTES };

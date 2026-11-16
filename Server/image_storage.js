const fs = require('node:fs');
const path = require('node:path');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const types = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp'
};
function acceptsImageType(file) {
    return types[path.extname(file.originalname).toLowerCase()] === file.mimetype;
}
function imageType(bytes) {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
    if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif';
    if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return null;
}

// Routes depend only on these three operations. A future private Blob adapter can
// implement the same contract without exposing storage paths or changing URLs.
function createLocalImageStorage(root = path.join(__dirname, 'uploads')) {
    function imagePath(id) {
        if (typeof id !== 'string' || !id || id.startsWith('.') || /[\\/]/.test(id) || id !== path.basename(id)) {
            throw Object.assign(new Error('Invalid image identifier.'), { status: 404 });
        }
        return path.join(root, id);
    }
    return {
        async saveImage(file) {
            if (!Buffer.isBuffer(file.buffer) || file.buffer.length > MAX_IMAGE_BYTES ||
                !acceptsImageType(file) || imageType(file.buffer) !== file.mimetype) {
                throw Object.assign(new Error('Only image files allowed!'), { status: 400, imageValidation: true });
            }
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
module.exports = { ...createLocalImageStorage(), createLocalImageStorage, acceptsImageType, MAX_IMAGE_BYTES };

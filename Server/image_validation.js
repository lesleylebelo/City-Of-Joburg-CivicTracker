const path = require('node:path');
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const types = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
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
function validateImage(file) {
    if (!Buffer.isBuffer(file.buffer) || file.buffer.length > MAX_IMAGE_BYTES ||
        !acceptsImageType(file) || imageType(file.buffer) !== file.mimetype) {
        throw Object.assign(new Error('Only image files allowed!'), { status: 400, imageValidation: true });
    }
    return { contentType: file.mimetype, extension: extensions[file.mimetype] };
}
module.exports = { MAX_IMAGE_BYTES, acceptsImageType, validateImage };

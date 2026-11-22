const { IncomingMessage, ServerResponse } = require('node:http');
const { Duplex, Writable } = require('node:stream');

// In-memory test transport: do not forward HTTP/1 framing to its response.
const hopByHop = new Set(['connection', 'keep-alive', 'proxy-authenticate',
    'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

function createHandler(expressApp) {
    return async function handle(request) {
        const url = new URL(request.url);
        const body = Buffer.from(await request.arrayBuffer());
        // These are real Node request/response types with an in-memory transport.
        // No listener, socket connection or outbound HTTP request is opened.
        const socket = new Duplex({ read() {}, write(chunk, encoding, callback) { callback(); } });
        socket.encrypted = url.protocol === 'https:';
        const req = new IncomingMessage(socket);
        req.method = request.method;
        req.url = url.pathname + url.search;
        req.httpVersion = '1.1';
        req.httpVersionMajor = 1;
        req.httpVersionMinor = 1;
        req.headers = {};
        for (const [name, value] of request.headers) {
            const key = name.toLowerCase();
            if (!hopByHop.has(key) && key !== 'host' && key !== 'content-length') req.headers[key] = value;
        }
        req.headers.host = url.host;
        if (body.length || request.headers.has('content-length') || request.headers.has('transfer-encoding')) {
            req.headers['content-length'] = String(body.length);
        }
        req.rawHeaders = Object.entries(req.headers).flat();

        return new Promise((resolve, reject) => {
            const chunks = [];
            const res = new ServerResponse(req);
            const writeHead = res.writeHead;
            res.writeHead = function (status, message, fields) {
                const headers = typeof message === 'string' ? fields : message;
                if (Array.isArray(headers)) {
                    for (let i = 0; i < headers.length; i += 2) res.setHeader(headers[i], headers[i + 1]);
                } else if (headers) {
                    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
                }
                return writeHead.call(res, status, typeof message === 'string' ? message : undefined);
            };
            const sink = new Writable({
                write(chunk, encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); }
            });
            const fail = () => {
                req.destroy();
                socket.destroy();
                reject(new Error('Unable to complete the HTTP response.'));
            };
            sink.on('error', fail);
            req.on('error', fail);
            res.on('error', fail);
            sink.on('drain', () => res.emit('drain'));
            sink.on('finish', () => {
                const headers = new Headers();
                for (const [name, value] of Object.entries(res.getHeaders())) {
                    if (!hopByHop.has(name)) {
                        for (const item of Array.isArray(value) ? value : [value]) headers.append(name, String(item));
                    }
                }
                res.emit('finish');
                res.emit('close');
                socket.destroy();
                resolve({ status: res.statusCode, headers, body: Buffer.concat(chunks), enableContentNegotiation: false });
            });
            res.write = (chunk, encoding, callback) => {
                if (!res.headersSent) res.writeHead(res.statusCode);
                return sink.write(chunk, encoding, callback);
            };
            res.end = (chunk, encoding, callback) => {
                if (!res.headersSent) res.writeHead(res.statusCode);
                res.finished = true;
                // HTTP statuses with no entity body must remain empty.
                if (req.method === 'HEAD' || [204, 304].includes(res.statusCode)) sink.end(callback);
                else sink.end(chunk, encoding, callback);
                return res;
            };
            res.flushHeaders = () => { if (!res.headersSent) res.writeHead(res.statusCode); };
            res.destroy = () => { sink.destroy(new Error('Response stream failed.')); return res; };
            Object.defineProperty(res, 'writableEnded', { get: () => sink.writableEnded });
            Object.defineProperty(res, 'writableFinished', { get: () => sink.writableFinished });
            try {
                expressApp(req, res);
                req.push(body.length ? body : null);
                if (body.length) req.push(null);
                req.complete = true;
            } catch { fail(); }
        });
    };
}

module.exports = { createHandler };

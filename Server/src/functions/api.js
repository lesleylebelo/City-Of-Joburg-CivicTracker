const { app } = require('@azure/functions');
const expressApp = require('../../app');
const { createHandler } = require('../http-adapter');

app.http('civictrack', {
    route: '{*path}',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: createHandler(expressApp)
});

/**
 * Vercel Serverless Function Entrypoint
 * Routes all incoming /api/* requests to the Express application.
 */

// Tell the server it is running in Vercel environment
process.env.VERCEL = process.env.VERCEL || '1';

const app = require('../server/src/index');

module.exports = app;

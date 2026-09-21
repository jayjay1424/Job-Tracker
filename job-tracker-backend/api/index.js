// Vercel serverless entry — re-exports Express app from src/index.js
// For single-app deployment (ONE), this file is the Vercel function.
// The app in src/index.js now exports without starting a server when required.
const app = require('../src/index');
module.exports = app;

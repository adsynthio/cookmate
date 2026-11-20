// Adds the web base path for the hosted web app (GitHub Pages serves it under /cookmate/app). Native builds and local
// development leave WEB_BASE_URL unset, so app.json is used as it is.
module.exports = ({ config }) =>
  process.env.WEB_BASE_URL
    ? { ...config, experiments: { ...config.experiments, baseUrl: process.env.WEB_BASE_URL } }
    : config;

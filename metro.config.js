const { getDefaultConfig } = require('expo/metro-config');

const { devInboxMiddleware } = require('./scripts/dev-inbox-proxy.cjs');

const config = getDefaultConfig(__dirname);
const enhance = config.server.enhanceMiddleware;

// See scripts/dev-inbox-proxy.cjs. The web sign-in screen reads the local
// inbox through this prefix; the phone reads Mailpit directly.
config.server.enhanceMiddleware = (metroMiddleware, server) => {
  const stacked = enhance ? enhance(metroMiddleware, server) : metroMiddleware;
  return (req, res, next) => devInboxMiddleware(req, res, () => stacked(req, res, next));
};

module.exports = config;

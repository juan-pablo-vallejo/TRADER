// Expo's own Metro configuration with Sentry's serializer, which gives each bundle and its
// source map the same debug id: that id is how Sentry finds the map for a stack it is sent
// (docs.sentry.io, React Native, Expo, read 2026-11-20). Nothing else is changed.
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

module.exports = getSentryExpoConfig(__dirname);

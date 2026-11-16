// The development identity's headers (core/dev-identity.ts): what a development build sends
// in place of a provider's session. They are names, not secrets, and the server honours them
// only where TRADER_DEV_IDENTITY is enabled and never in a production build. Part of the
// client-safe contract so the phone's development sign-in and the server agree on them.
export const DEV_SUBJECT_HEADER = "x-trader-dev-subject";
export const DEV_EMAIL_HEADER = "x-trader-dev-email";
export const DEV_PHONE_HEADER = "x-trader-dev-phone";

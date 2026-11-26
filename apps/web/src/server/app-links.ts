// Where the phone app is got from, for `/get`: the TestFlight link and the Play testing
// link, each a public address in a variable of its own. Read per request, by name through
// the environment handed in, so a build inlines neither and a link can change without one.
// A value that is not an https address is no link: the page then says to ask the office.
type Env = Record<string, string | undefined>;

type AppLinks = { ios: string | null; android: string | null };

const link = (value: string | undefined): string | null => {
  const typed = (value ?? "").trim();
  if (typed === "") return null;
  try {
    return new URL(typed).protocol === "https:" ? typed : null;
  } catch {
    return null;
  }
};

export const appLinks = (env: Env): AppLinks => ({
  ios: link(env.TRADER_GET_IOS_URL),
  android: link(env.TRADER_GET_ANDROID_URL),
});

// Which phone is asking, from its own description of itself: an iPhone or iPad, an
// Android phone, or neither (a desktop, or something that does not say), which is shown
// both. iPadOS calls itself a Mac; a Mac is shown both, which holds the iPhone's link.
export type Device = "ios" | "android" | "other";

export function deviceOf(userAgent: string | null): Device {
  const ua = userAgent ?? "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "other";
}

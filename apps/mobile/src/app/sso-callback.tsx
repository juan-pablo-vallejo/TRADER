// Where Google's browser sheet comes back to: trader://sso-callback (sign-in-provider.ts).
// The sheet itself hands the answer to the sign-in screen that opened it; a phone that opens
// this address as a link instead goes to where the session says, through the app's index.
import { Redirect } from "expo-router";
import { maybeCompleteAuthSession } from "expo-web-browser";

maybeCompleteAuthSession();

export default function SsoCallback() {
  return <Redirect href="/" />;
}

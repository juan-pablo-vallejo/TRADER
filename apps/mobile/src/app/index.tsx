// Where the app opens: Today when someone is signed in, the sign-in screen when nobody is.
import { Redirect } from "expo-router";

import { useSession } from "../session";

export default function Index() {
  const { session } = useSession();
  // The store is still being read: nothing is drawn for that moment.
  if (session === undefined) return null;
  return <Redirect href={session === null ? "/sign-in" : "/today"} />;
}

// Where the app opens: Today when someone is signed in, the sign-in screen when nobody is.
import { Redirect } from "expo-router";

import { useSession } from "../session";

export default function Index() {
  const { session } = useSession();
  return <Redirect href={session === null ? "/sign-in" : "/today"} />;
}

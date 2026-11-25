// Sign-in. A build with the identity provider's key signs in through Clerk; a development
// build that asked for the development identity (config.ts) through the stand-in for it,
// on the same screen (ui/phone-sign-in.tsx, sign-in-provider.ts). A build with neither says
// so in words.
import { useMemo } from "react";

import { apiUrl, clerkKey, devIdentity } from "../config";
import { useStrings } from "../i18n";
import { standInProvider, useClerkProvider } from "../sign-in-provider";
import { Screen, text } from "../ui/controls";
import { PhoneSignIn } from "../ui/phone-sign-in";
import { Text } from "../ui/text";

function WithClerk({ url }: { url: string }) {
  const provider = useClerkProvider();
  return <PhoneSignIn apiUrl={url} provider={provider} />;
}

function WithStandIn({ url }: { url: string }) {
  const provider = useMemo(() => standInProvider(url), [url]);
  return <PhoneSignIn apiUrl={url} provider={provider} standIn />;
}

export default function SignIn() {
  const { t } = useStrings();
  if (apiUrl !== null && clerkKey !== null) return <WithClerk url={apiUrl} />;
  if (apiUrl !== null && devIdentity) return <WithStandIn url={apiUrl} />;
  return (
    <Screen testID="sign-in-unavailable">
      <Text style={text.title} accessibilityRole="header">
        {t.signIn.title}
      </Text>
      <Text style={text.body}>{t.signIn.unavailable}</Text>
    </Screen>
  );
}

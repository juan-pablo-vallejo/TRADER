import { traderEnvironment } from "../../server/environment";
import { signInPath } from "../../server/identity-mode";
import { DeveloperScreen } from "./developer-screen";

// The developer console (TASKS D01): a dynamic server page rendering one client component.
// The deployment's own two facts are read here, on the server, and are not secrets: which
// commit is running, and in which environment. Everything else is the API's answer.
export const dynamic = "force-dynamic";

export default function DeveloperPage() {
  return (
    <DeveloperScreen
      signInHref={signInPath(process.env)}
      commit={process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null}
      environment={
        traderEnvironment(process.env) ??
        process.env.VERCEL_ENV ??
        process.env.NODE_ENV ??
        null
      }
    />
  );
}

import { notFound } from "next/navigation";

import { signInPath } from "../../../../server/identity-mode";
import { JobScreen } from "./job-screen";
import { titled } from "../../../i18n/server";

// One job: where it stands. An address that names no id at all is the not-found screen;
// whether the id is a job the caller may read is the API's answer.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const generateMetadata = () => titled((t) => t.nav.jobs);

export default async function JobPage(props: PageProps<"/jobs/[jobId]">) {
  const { jobId } = await props.params;
  if (!UUID.test(jobId)) notFound();
  return <JobScreen jobId={jobId} signInHref={signInPath(process.env)} />;
}

import { notFound } from "next/navigation";

import { JobDetailScreen } from "./job-detail-screen";
import { signInPath } from "../../../server/identity-mode";

// One job (TASKS, Stage 4: a job detail route): a dynamic server page rendering one client
// component, as every office screen is. An address that names no job id at all is the
// not-found screen; whether the id is a job the caller may read is the API's answer.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function JobPage(props: PageProps<"/jobs/[jobId]">) {
  const { jobId } = await props.params;
  if (!UUID.test(jobId)) notFound();
  return <JobDetailScreen jobId={jobId} signInHref={signInPath(process.env)} />;
}

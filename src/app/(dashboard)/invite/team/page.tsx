import { InviteTeamClient } from "./InviteTeamClient";

export const metadata = {
  title: "Accept team invite",
};

export default async function InviteTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  return <InviteTeamClient initialToken={typeof sp.token === "string" ? sp.token : ""} />;
}

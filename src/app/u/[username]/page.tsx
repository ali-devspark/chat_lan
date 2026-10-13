import { redirect } from "next/navigation";

export default async function RootUserRedirect({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolved = await params;
  redirect(`/ar/u/${resolved.username}`);
}

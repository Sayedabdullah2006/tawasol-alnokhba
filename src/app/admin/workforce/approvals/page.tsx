import RequestCenter from "@/components/workforce/RequestCenter";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; request?: string }>;
}) {
  const { tab, request } = await searchParams;
  return (
    <RequestCenter
      admin
      initialRequest={request}
      initialTab={tab === "profile" ? "profile" : "requests"}
    />
  );
}

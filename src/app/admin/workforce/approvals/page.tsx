import RequestCenter from "@/components/workforce/RequestCenter";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return (
    <RequestCenter
      admin
      initialTab={tab === "profile" ? "profile" : "requests"}
    />
  );
}

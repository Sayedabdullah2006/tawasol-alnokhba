import EmployeeJourneys from "@/components/workforce/EmployeeJourneys";
import { journeySections, type JourneyKind } from "@/lib/workforce/journeys";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section } = await searchParams;
  const kind =
    section && Object.hasOwn(journeySections, section)
      ? (section as JourneyKind)
      : "goal";
  return <EmployeeJourneys key={kind} section={kind} admin />;
}

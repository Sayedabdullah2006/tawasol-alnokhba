import { requestDate } from "./RequestMetadata";
import RequestDisclosure from "./RequestDisclosure";

export default function DecisionReason({ reason, decidedAt }: { reason: string; decidedAt?: string | null }) {
  return (
    <RequestDisclosure title="سبب القرار">
      {decidedAt && <p className="text-xs text-muted">تاريخ القرار: <time dateTime={decidedAt}>{requestDate(decidedAt)}</time></p>}
      <p className="whitespace-pre-wrap break-words leading-7">{reason}</p>
    </RequestDisclosure>
  );
}

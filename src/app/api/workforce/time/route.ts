import { workCommand } from "@/lib/workforce/task-server";
export async function POST(request: Request) {
  return workCommand(request, "time");
}

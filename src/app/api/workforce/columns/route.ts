import { workCommand } from "@/lib/workforce/task-server";

export const POST = (request: Request) => workCommand(request, "columns");

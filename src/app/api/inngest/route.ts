import { serve } from "inngest/next";
import { inngest } from "@/server/jobs/inngest";
import { allInngestFunctions } from "@/server/jobs/notifications";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: allInngestFunctions,
});

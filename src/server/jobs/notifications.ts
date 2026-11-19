import {
  dispatchNotificationEvent,
  dispatchPendingOutbox,
  retryDueDeliveries,
} from "@/server/domain/notifications/outbox";
import { inngest } from "./inngest";

export const notificationsDispatchOnEvent = inngest.createFunction(
  { id: "notifications-dispatch-event", triggers: [{ event: "notifications/event.created" }] },
  async ({ event }) => {
    const eventId = typeof event.data?.eventId === "string" ? event.data.eventId : null;
    if (!eventId) {
      return { dispatched: false };
    }
    return dispatchNotificationEvent(eventId);
  },
);

export const notificationsDispatchCron = inngest.createFunction(
  { id: "notifications-dispatch-cron", triggers: [{ cron: "* * * * *" }] },
  async () => {
    const processed = await dispatchPendingOutbox(50);
    return { processed };
  },
);

export const notificationsRetryCron = inngest.createFunction(
  { id: "notifications-retry-cron", triggers: [{ cron: "* * * * *" }] },
  async () => {
    const retried = await retryDueDeliveries();
    return { retried };
  },
);

export const allInngestFunctions = [
  notificationsDispatchOnEvent,
  notificationsDispatchCron,
  notificationsRetryCron,
];

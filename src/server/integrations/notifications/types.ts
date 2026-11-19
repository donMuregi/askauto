export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface SmsMessage {
  to: string; // E.164 +254...
  message: string;
  purpose: string;
}

export interface WhatsAppMessage {
  to: string;
  templateName: string;
  params: string[];
}

export interface DeliverySendResult {
  providerMessageId: string;
  status: "sent" | "failed";
  hardFailure?: boolean;
  error?: string;
}

export interface EmailProvider {
  readonly channel: "email";
  send(input: EmailMessage): Promise<DeliverySendResult>;
}

export interface SmsProvider {
  readonly channel: "sms";
  send(input: SmsMessage): Promise<DeliverySendResult>;
}

export interface WhatsAppProvider {
  readonly channel: "whatsapp";
  send(input: WhatsAppMessage): Promise<DeliverySendResult>;
}

export type ChannelProvider = EmailProvider | SmsProvider | WhatsAppProvider;

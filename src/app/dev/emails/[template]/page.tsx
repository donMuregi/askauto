import { notFound } from "next/navigation";
import {
  renderEmailTemplate,
  SAMPLE_EMAIL_PAYLOADS,
  type EmailTemplateKey,
} from "../../../../../emails/render";

export const dynamic = "force-dynamic";

export default async function DevEmailPreviewPage({
  params,
}: {
  params: Promise<{ template: string }>;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const { template } = await params;
  const decoded = decodeURIComponent(template) as EmailTemplateKey;
  if (!(decoded in SAMPLE_EMAIL_PAYLOADS)) {
    notFound();
  }

  const rendered = await renderEmailTemplate(decoded, SAMPLE_EMAIL_PAYLOADS[decoded]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Email preview: {decoded}</h1>
        <p className="text-sm text-muted-foreground">Subject: {rendered.subject}</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <iframe
          title={`Email preview for ${decoded}`}
          srcDoc={rendered.html}
          className="h-[600px] w-full border-0"
        />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold">Plain-text alternative</h2>
        <pre className="whitespace-pre-wrap rounded border border-border bg-surface-muted p-4 text-xs">
          {rendered.text}
        </pre>
      </div>
    </div>
  );
}

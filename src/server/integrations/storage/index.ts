import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getEnv } from "@/lib/env";

const LOCAL_STORAGE_ROOT = resolve(process.cwd(), ".fnpl-storage");

function getS3Client(): S3Client {
  const env = getEnv();
  return new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: Boolean(env.S3_ENDPOINT),
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
}

function safeLocalPath(storageKey: string): string {
  const cleaned = storageKey.replace(/^\/+/, "").replace(/\.\./g, "_");
  const fullPath = resolve(LOCAL_STORAGE_ROOT, cleaned);
  if (!fullPath.startsWith(LOCAL_STORAGE_ROOT)) {
    throw new Error("Invalid storage key path");
  }
  return fullPath;
}

export async function putPrivateObject(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  const env = getEnv();
  if (env.INTEGRATIONS_MODE === "real" && env.S3_ACCESS_KEY_ID) {
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );
    return;
  }

  const target = safeLocalPath(params.key);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, params.body);
}

export async function getPrivateObject(key: string): Promise<
  | { kind: "redirect"; url: string }
  | { kind: "buffer"; buffer: Buffer }
  | null
> {
  const env = getEnv();
  if (env.INTEGRATIONS_MODE === "real" && env.S3_ACCESS_KEY_ID) {
    const client = getS3Client();
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
      }),
      { expiresIn: 300 },
    );
    return { kind: "redirect", url };
  }

  const target = safeLocalPath(key);
  if (!existsSync(target)) {
    return null;
  }
  return { kind: "buffer", buffer: readFileSync(target) };
}

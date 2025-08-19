// /lib/qstash.ts
import { Client } from "@upstash/qstash";

export const qstash = new Client({
  token: process.env.QSTASH_TOKEN!,
  baseUrl: process.env.QSTASH_URL, // <-- point SDK to your local QStash CLI
});

export const WORKER_URL =
  process.env.QSTASH_WORKER_URL ??
  `https://${process.env.VERCEL_URL}/api/worker/generate`;

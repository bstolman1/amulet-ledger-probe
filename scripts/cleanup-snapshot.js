/**
 * Cleanup ACS snapshot data by calling the edge function with mode "purge_all".
 * No service role key needed – authorization is via webhook secret.
 */

import axios from "axios";

const EDGE_FUNCTION_URL = process.env.EDGE_FUNCTION_URL;
const WEBHOOK_SECRET = process.env.ACS_UPLOAD_WEBHOOK_SECRET;

if (!EDGE_FUNCTION_URL) {
  console.error("❌ EDGE_FUNCTION_URL is not set");
  process.exit(1);
}

if (!WEBHOOK_SECRET) {
  console.error("❌ ACS_UPLOAD_WEBHOOK_SECRET is not set");
  process.exit(1);
}

async function run() {
  try {
    console.log("🧹 Requesting ACS cleanup from edge function...");

    const res = await axios.post(
      EDGE_FUNCTION_URL,
      {
        mode: "purge_all",
        webhookSecret: WEBHOOK_SECRET,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": WEBHOOK_SECRET,
        },
        timeout: 300000,
      }
    );

    console.log("✅ Cleanup completed:", res.data);
  } catch (err) {
    console.error("❌ Cleanup failed:", err.message);
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Body:", err.response.data);
    }
    process.exit(1);
  }
}

run();

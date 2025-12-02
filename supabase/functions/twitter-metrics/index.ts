import { createHmac } from "node:crypto";

const API_KEY = Deno.env.get("TWITTER_CONSUMER_KEY")?.trim();
const API_SECRET = Deno.env.get("TWITTER_CONSUMER_SECRET")?.trim();
const ACCESS_TOKEN = Deno.env.get("TWITTER_ACCESS_TOKEN")?.trim();
const ACCESS_TOKEN_SECRET = Deno.env.get("TWITTER_ACCESS_TOKEN_SECRET")?.trim();
const BEARER_TOKEN = Deno.env.get("TWITTER_BEARER_TOKEN")?.trim();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function validateEnvironmentVariables() {
  if (!API_KEY) throw new Error("Missing TWITTER_CONSUMER_KEY");
  if (!API_SECRET) throw new Error("Missing TWITTER_CONSUMER_SECRET");
  if (!ACCESS_TOKEN) throw new Error("Missing TWITTER_ACCESS_TOKEN");
  if (!ACCESS_TOKEN_SECRET) throw new Error("Missing TWITTER_ACCESS_TOKEN_SECRET");
  if (!BEARER_TOKEN) throw new Error("Missing TWITTER_BEARER_TOKEN");
}

function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): string {
  const signatureBaseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(
    Object.entries(params)
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join("&")
  )}`;
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  const hmacSha1 = createHmac("sha1", signingKey);
  return hmacSha1.update(signatureBaseString).digest("base64");
}

function generateOAuthHeader(method: string, url: string): string {
  const oauthParams = {
    oauth_consumer_key: API_KEY!,
    oauth_nonce: Math.random().toString(36).substring(2),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: ACCESS_TOKEN!,
    oauth_version: "1.0",
  };

  const signature = generateOAuthSignature(method, url, oauthParams, API_SECRET!, ACCESS_TOKEN_SECRET!);
  const signedOAuthParams = { ...oauthParams, oauth_signature: signature };

  return "OAuth " + Object.entries(signedOAuthParams)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
    .join(", ");
}

const BASE_URL = "https://api.x.com/2";

// Get authenticated user info
async function getMe() {
  const url = `${BASE_URL}/users/me?user.fields=public_metrics,description,created_at,profile_image_url,verified`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  });
  return response.json();
}

// Get user by username
async function getUserByUsername(username: string) {
  const url = `${BASE_URL}/users/by/username/${username}?user.fields=public_metrics,description,created_at,profile_image_url,verified`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  });
  return response.json();
}

// Get user tweets with metrics
async function getUserTweets(userId: string, maxResults: number = 10) {
  const url = `${BASE_URL}/users/${userId}/tweets?max_results=${maxResults}&tweet.fields=public_metrics,created_at,context_annotations`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  });
  return response.json();
}

// Get tweet metrics by ID
async function getTweetMetrics(tweetId: string) {
  const url = `${BASE_URL}/tweets/${tweetId}?tweet.fields=public_metrics,created_at,context_annotations`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  });
  return response.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    validateEnvironmentVariables();
    
    const { action, username, userId, tweetId, maxResults } = await req.json();
    console.log(`Twitter API request: action=${action}, username=${username}, userId=${userId}`);

    let result;
    switch (action) {
      case 'me':
        result = await getMe();
        break;
      case 'user':
        if (!username) throw new Error("Username required");
        result = await getUserByUsername(username);
        break;
      case 'tweets':
        if (!userId) throw new Error("User ID required");
        result = await getUserTweets(userId, maxResults || 10);
        break;
      case 'tweet':
        if (!tweetId) throw new Error("Tweet ID required");
        result = await getTweetMetrics(tweetId);
        break;
      default:
        throw new Error("Invalid action. Use: me, user, tweets, or tweet");
    }

    console.log("Twitter API response:", JSON.stringify(result).slice(0, 500));
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error("Twitter API error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

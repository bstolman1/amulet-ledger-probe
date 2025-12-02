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

const BASE_URL = "https://api.x.com/2";

// Get user by username with extended fields
async function getUserByUsername(username: string) {
  const userFields = "public_metrics,description,created_at,profile_image_url,verified,verified_type,location,url,pinned_tweet_id";
  const url = `${BASE_URL}/users/by/username/${username}?user.fields=${userFields}`;
  console.log("Fetching user:", url);
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  });
  const data = await response.json();
  console.log("User response:", JSON.stringify(data).slice(0, 500));
  return data;
}

// Get user tweets with full metrics
async function getUserTweets(userId: string, maxResults: number = 100) {
  const tweetFields = "public_metrics,created_at,context_annotations,entities,referenced_tweets,source,lang,attachments";
  const url = `${BASE_URL}/users/${userId}/tweets?max_results=${maxResults}&tweet.fields=${tweetFields}&exclude=retweets`;
  console.log("Fetching tweets:", url);
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  });
  const data = await response.json();
  console.log("Tweets response count:", data.data?.length || 0);
  return data;
}

// Get user mentions
async function getUserMentions(userId: string, maxResults: number = 100) {
  const tweetFields = "public_metrics,created_at,author_id,entities";
  const url = `${BASE_URL}/users/${userId}/mentions?max_results=${maxResults}&tweet.fields=${tweetFields}`;
  console.log("Fetching mentions:", url);
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  });
  const data = await response.json();
  console.log("Mentions response:", JSON.stringify(data).slice(0, 300));
  return data;
}

// Get followers list
async function getFollowers(userId: string, maxResults: number = 100) {
  const userFields = "public_metrics,description,created_at,profile_image_url,verified";
  const url = `${BASE_URL}/users/${userId}/followers?max_results=${maxResults}&user.fields=${userFields}`;
  console.log("Fetching followers:", url);
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  });
  const data = await response.json();
  console.log("Followers response count:", data.data?.length || 0);
  return data;
}

// Get following list  
async function getFollowing(userId: string, maxResults: number = 100) {
  const userFields = "public_metrics,description,created_at,profile_image_url,verified";
  const url = `${BASE_URL}/users/${userId}/following?max_results=${maxResults}&user.fields=${userFields}`;
  console.log("Fetching following:", url);
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  });
  const data = await response.json();
  console.log("Following response count:", data.data?.length || 0);
  return data;
}

// Get liked tweets
async function getLikedTweets(userId: string, maxResults: number = 100) {
  const tweetFields = "public_metrics,created_at,author_id";
  const url = `${BASE_URL}/users/${userId}/liked_tweets?max_results=${maxResults}&tweet.fields=${tweetFields}`;
  console.log("Fetching liked tweets:", url);
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  });
  const data = await response.json();
  console.log("Liked tweets response:", JSON.stringify(data).slice(0, 300));
  return data;
}

// Get pinned tweet
async function getTweet(tweetId: string) {
  const tweetFields = "public_metrics,created_at,context_annotations,entities,source";
  const url = `${BASE_URL}/tweets/${tweetId}?tweet.fields=${tweetFields}`;
  console.log("Fetching tweet:", url);
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  });
  return response.json();
}

// Get all analytics in one call
async function getFullAnalytics(username: string) {
  console.log("Getting full analytics for:", username);
  
  // First get the user
  const userResponse = await getUserByUsername(username);
  if (userResponse.errors || !userResponse.data) {
    return { error: userResponse.errors?.[0]?.message || "User not found", details: userResponse };
  }
  
  const user = userResponse.data;
  const userId = user.id;
  
  // Fetch all data in parallel
  const [tweetsResponse, followersResponse, followingResponse] = await Promise.all([
    getUserTweets(userId, 100),
    getFollowers(userId, 100).catch(e => ({ error: e.message })),
    getFollowing(userId, 100).catch(e => ({ error: e.message })),
  ]);
  
  const tweets = tweetsResponse.data || [];
  const followers = followersResponse.data || [];
  const following = followingResponse.data || [];
  
  // Calculate engagement analytics
  let totalLikes = 0;
  let totalRetweets = 0;
  let totalReplies = 0;
  let totalQuotes = 0;
  let totalImpressions = 0;
  let totalBookmarks = 0;
  
  const tweetsByDay: Record<string, number> = {};
  const engagementByDay: Record<string, { likes: number; retweets: number; replies: number }> = {};
  
  tweets.forEach((tweet: any) => {
    const metrics = tweet.public_metrics || {};
    totalLikes += metrics.like_count || 0;
    totalRetweets += metrics.retweet_count || 0;
    totalReplies += metrics.reply_count || 0;
    totalQuotes += metrics.quote_count || 0;
    totalImpressions += metrics.impression_count || 0;
    totalBookmarks += metrics.bookmark_count || 0;
    
    if (tweet.created_at) {
      const day = tweet.created_at.split('T')[0];
      tweetsByDay[day] = (tweetsByDay[day] || 0) + 1;
      if (!engagementByDay[day]) {
        engagementByDay[day] = { likes: 0, retweets: 0, replies: 0 };
      }
      engagementByDay[day].likes += metrics.like_count || 0;
      engagementByDay[day].retweets += metrics.retweet_count || 0;
      engagementByDay[day].replies += metrics.reply_count || 0;
    }
  });
  
  // Find top performing tweets
  const sortedByLikes = [...tweets].sort((a: any, b: any) => 
    (b.public_metrics?.like_count || 0) - (a.public_metrics?.like_count || 0)
  ).slice(0, 5);
  
  const sortedByRetweets = [...tweets].sort((a: any, b: any) => 
    (b.public_metrics?.retweet_count || 0) - (a.public_metrics?.retweet_count || 0)
  ).slice(0, 5);
  
  const sortedByImpressions = [...tweets].sort((a: any, b: any) => 
    (b.public_metrics?.impression_count || 0) - (a.public_metrics?.impression_count || 0)
  ).slice(0, 5);
  
  // Calculate averages
  const tweetCount = tweets.length || 1;
  const avgLikesPerTweet = totalLikes / tweetCount;
  const avgRetweetsPerTweet = totalRetweets / tweetCount;
  const avgRepliesPerTweet = totalReplies / tweetCount;
  const engagementRate = user.public_metrics?.followers_count 
    ? ((totalLikes + totalRetweets + totalReplies) / tweetCount / user.public_metrics.followers_count) * 100
    : 0;
  
  // Follower analytics
  const verifiedFollowers = followers.filter((f: any) => f.verified).length;
  const totalFollowerReach = followers.reduce((sum: number, f: any) => sum + (f.public_metrics?.followers_count || 0), 0);
  
  // Get pinned tweet if exists
  let pinnedTweet = null;
  if (user.pinned_tweet_id) {
    const pinnedResponse = await getTweet(user.pinned_tweet_id);
    pinnedTweet = pinnedResponse.data;
  }
  
  return {
    user,
    pinnedTweet,
    recentTweets: tweets.slice(0, 20),
    analytics: {
      totalTweetsAnalyzed: tweetCount,
      engagement: {
        totalLikes,
        totalRetweets,
        totalReplies,
        totalQuotes,
        totalImpressions,
        totalBookmarks,
        avgLikesPerTweet: Math.round(avgLikesPerTweet * 10) / 10,
        avgRetweetsPerTweet: Math.round(avgRetweetsPerTweet * 10) / 10,
        avgRepliesPerTweet: Math.round(avgRepliesPerTweet * 10) / 10,
        engagementRate: Math.round(engagementRate * 1000) / 1000,
      },
      topTweets: {
        byLikes: sortedByLikes,
        byRetweets: sortedByRetweets,
        byImpressions: sortedByImpressions,
      },
      tweetsByDay,
      engagementByDay,
      followers: {
        sampleCount: followers.length,
        verifiedCount: verifiedFollowers,
        totalReach: totalFollowerReach,
      },
      following: {
        sampleCount: following.length,
      },
    },
  };
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
      case 'user':
        if (!username) throw new Error("Username required");
        result = await getUserByUsername(username);
        break;
      case 'tweets':
        if (!userId) throw new Error("User ID required");
        result = await getUserTweets(userId, maxResults || 100);
        break;
      case 'tweet':
        if (!tweetId) throw new Error("Tweet ID required");
        result = await getTweet(tweetId);
        break;
      case 'followers':
        if (!userId) throw new Error("User ID required");
        result = await getFollowers(userId, maxResults || 100);
        break;
      case 'following':
        if (!userId) throw new Error("User ID required");
        result = await getFollowing(userId, maxResults || 100);
        break;
      case 'mentions':
        if (!userId) throw new Error("User ID required");
        result = await getUserMentions(userId, maxResults || 100);
        break;
      case 'analytics':
        if (!username) throw new Error("Username required");
        result = await getFullAnalytics(username);
        break;
      default:
        throw new Error("Invalid action. Use: user, tweets, tweet, followers, following, mentions, analytics");
    }

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

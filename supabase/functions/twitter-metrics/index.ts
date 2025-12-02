const BEARER_TOKEN = Deno.env.get("TWITTER_BEARER_TOKEN")?.trim();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  console.log("User response status:", response.status);
  
  if (response.status === 429) {
    return { error: "Rate limited by Twitter API. Please wait a few minutes and try again.", status: 429 };
  }
  if (data.errors) {
    console.error("User API errors:", JSON.stringify(data.errors));
    return { error: data.errors[0]?.message || "Twitter API error", details: data.errors };
  }
  return data;
}

// Get user tweets - requires Basic tier ($100/month)
async function getUserTweets(userId: string, maxResults: number = 100) {
  const tweetFields = "public_metrics,created_at,entities,source";
  const url = `${BASE_URL}/users/${userId}/tweets?max_results=${maxResults}&tweet.fields=${tweetFields}&exclude=retweets`;
  console.log("Fetching tweets:", url);
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  });
  const data = await response.json();
  console.log("Tweets response status:", response.status);
  
  if (response.status === 429) {
    return { error: "Rate limited", status: 429, data: [] };
  }
  if (data.title === "Client Forbidden" || data.reason === "client-not-enrolled") {
    console.log("Tweets endpoint requires paid API tier");
    return { error: "Requires paid Twitter API tier", status: 403, data: [] };
  }
  return data;
}

// Get pinned tweet
async function getTweet(tweetId: string) {
  const tweetFields = "public_metrics,created_at,entities,source";
  const url = `${BASE_URL}/tweets/${tweetId}?tweet.fields=${tweetFields}`;
  console.log("Fetching tweet:", url);
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  });
  const data = await response.json();
  
  if (response.status === 429) {
    return { error: "Rate limited", status: 429 };
  }
  return data;
}

// Get analytics - works with free tier (user profile only)
async function getAnalytics(username: string) {
  console.log("Getting analytics for:", username);
  
  // Get user profile (works on free tier)
  const userResponse = await getUserByUsername(username);
  
  if (userResponse.error) {
    return { error: userResponse.error, status: userResponse.status };
  }
  
  if (!userResponse.data) {
    return { error: "User not found or API error", details: userResponse };
  }
  
  const user = userResponse.data;
  
  // Try to get tweets (may fail on free tier)
  const tweetsResponse = await getUserTweets(user.id, 100);
  const tweets = tweetsResponse.data || [];
  const tweetsError = tweetsResponse.error;
  
  // Try to get pinned tweet
  let pinnedTweet = null;
  if (user.pinned_tweet_id) {
    const pinnedResponse = await getTweet(user.pinned_tweet_id);
    if (pinnedResponse.data) {
      pinnedTweet = pinnedResponse.data;
    }
  }
  
  // Calculate engagement from available tweets
  let totalLikes = 0, totalRetweets = 0, totalReplies = 0, totalQuotes = 0;
  let totalImpressions = 0, totalBookmarks = 0;
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
  
  const tweetCount = tweets.length || 1;
  const avgLikesPerTweet = totalLikes / tweetCount;
  const avgRetweetsPerTweet = totalRetweets / tweetCount;
  const avgRepliesPerTweet = totalReplies / tweetCount;
  const engagementRate = user.public_metrics?.followers_count 
    ? ((totalLikes + totalRetweets + totalReplies) / tweetCount / user.public_metrics.followers_count) * 100
    : 0;
  
  // Top tweets by likes
  const sortedByLikes = [...tweets].sort((a: any, b: any) => 
    (b.public_metrics?.like_count || 0) - (a.public_metrics?.like_count || 0)
  ).slice(0, 5);
  
  const sortedByRetweets = [...tweets].sort((a: any, b: any) => 
    (b.public_metrics?.retweet_count || 0) - (a.public_metrics?.retweet_count || 0)
  ).slice(0, 5);
  
  const sortedByImpressions = [...tweets].sort((a: any, b: any) => 
    (b.public_metrics?.impression_count || 0) - (a.public_metrics?.impression_count || 0)
  ).slice(0, 5);
  
  return {
    user,
    pinnedTweet,
    recentTweets: tweets.slice(0, 20),
    apiLimitations: {
      tweetsAvailable: !tweetsError,
      tweetsError,
      message: tweetsError ? "Some features require a paid Twitter API tier ($100/month Basic plan)" : null,
    },
    analytics: {
      totalTweetsAnalyzed: tweets.length,
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
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!BEARER_TOKEN) {
      throw new Error("Missing TWITTER_BEARER_TOKEN");
    }
    
    const { action, username, userId, tweetId, maxResults } = await req.json();
    console.log(`Twitter API request: action=${action}, username=${username}`);

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
      case 'analytics':
        if (!username) throw new Error("Username required");
        result = await getAnalytics(username);
        break;
      default:
        throw new Error("Invalid action. Use: user, tweets, tweet, analytics");
    }

    // Handle rate limiting
    if (result.status === 429) {
      return new Response(JSON.stringify(result), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

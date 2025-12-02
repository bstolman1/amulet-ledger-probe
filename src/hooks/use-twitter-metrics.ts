import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TwitterUser {
  id: string;
  name: string;
  username: string;
  description?: string;
  profile_image_url?: string;
  created_at?: string;
  verified?: boolean;
  verified_type?: string;
  location?: string;
  url?: string;
  pinned_tweet_id?: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
    listed_count: number;
    like_count?: number;
    media_count?: number;
  };
}

export interface Tweet {
  id: string;
  text: string;
  created_at?: string;
  source?: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    bookmark_count?: number;
    impression_count?: number;
  };
}

export interface TwitterAnalytics {
  user: TwitterUser;
  pinnedTweet?: Tweet;
  recentTweets: Tweet[];
  apiLimitations?: {
    tweetsAvailable: boolean;
    tweetsError?: string;
    message?: string;
  };
  analytics: {
    totalTweetsAnalyzed: number;
    engagement: {
      totalLikes: number;
      totalRetweets: number;
      totalReplies: number;
      totalQuotes: number;
      totalImpressions: number;
      totalBookmarks: number;
      avgLikesPerTweet: number;
      avgRetweetsPerTweet: number;
      avgRepliesPerTweet: number;
      engagementRate: number;
    };
    topTweets: {
      byLikes: Tweet[];
      byRetweets: Tweet[];
      byImpressions: Tweet[];
    };
    tweetsByDay: Record<string, number>;
    engagementByDay: Record<string, { likes: number; retweets: number; replies: number }>;
  };
}

export function useTwitterAnalytics(username: string) {
  return useQuery<TwitterAnalytics, Error>({
    queryKey: ["twitter-analytics", username],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("twitter-metrics", {
        body: { action: "analytics", username },
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data as TwitterAnalytics;
    },
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      // Don't retry on rate limit
      if (error.message?.includes("Rate limited")) return false;
      return failureCount < 2;
    },
    retryDelay: 10000, // Wait 10 seconds before retry
  });
}

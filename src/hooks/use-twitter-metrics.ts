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
  };
}

export interface Tweet {
  id: string;
  text: string;
  created_at?: string;
  source?: string;
  lang?: string;
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
    followers: {
      sampleCount: number;
      verifiedCount: number;
      totalReach: number;
    };
    following: {
      sampleCount: number;
    };
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
    retry: 1,
  });
}

export function useTwitterUser(username: string) {
  return useQuery({
    queryKey: ["twitter-user", username],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("twitter-metrics", {
        body: { action: "user", username },
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data.data as TwitterUser;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useTwitterTweets(userId: string | undefined, maxResults: number = 100) {
  return useQuery({
    queryKey: ["twitter-tweets", userId, maxResults],
    queryFn: async () => {
      if (!userId) throw new Error("User ID required");
      
      const { data, error } = await supabase.functions.invoke("twitter-metrics", {
        body: { action: "tweets", userId, maxResults },
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return (data.data || []) as Tweet[];
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

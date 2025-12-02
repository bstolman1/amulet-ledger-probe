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
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    bookmark_count?: number;
    impression_count?: number;
  };
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
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}

export function useTwitterTweets(userId: string | undefined, maxResults: number = 10) {
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

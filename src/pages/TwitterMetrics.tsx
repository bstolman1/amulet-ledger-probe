import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTwitterUser, useTwitterTweets } from "@/hooks/use-twitter-metrics";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, MessageSquare, Heart, Repeat2, Eye, Twitter } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const CANTON_USERNAME = "CantonNetwork";

export default function TwitterMetrics() {
  const { data: user, isLoading: userLoading, error: userError } = useTwitterUser(CANTON_USERNAME);
  const { data: tweets, isLoading: tweetsLoading } = useTwitterTweets(user?.id, 10);

  const formatNumber = (num: number | undefined) => {
    if (num === undefined) return "—";
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
    return num.toLocaleString();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Twitter className="h-8 w-8 text-[#1DA1F2]" />
          <div>
            <h1 className="text-3xl font-bold">@{CANTON_USERNAME} Metrics</h1>
            <p className="text-muted-foreground">X.com account analytics</p>
          </div>
        </div>

        {userError && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">Error loading Twitter data: {userError.message}</p>
            </CardContent>
          </Card>
        )}

        {/* Profile Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Followers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {userLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">{formatNumber(user?.public_metrics?.followers_count)}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Following</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {userLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">{formatNumber(user?.public_metrics?.following_count)}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Posts</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {userLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">{formatNumber(user?.public_metrics?.tweet_count)}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Listed</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {userLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">{formatNumber(user?.public_metrics?.listed_count)}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Profile Info */}
        {user && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                {user.profile_image_url && (
                  <img src={user.profile_image_url} alt={user.name} className="h-12 w-12 rounded-full" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    {user.name}
                    {user.verified && <span className="text-[#1DA1F2]">✓</span>}
                  </div>
                  <div className="text-sm text-muted-foreground">@{user.username}</div>
                </div>
              </CardTitle>
            </CardHeader>
            {user.description && (
              <CardContent>
                <p className="text-muted-foreground">{user.description}</p>
              </CardContent>
            )}
          </Card>
        )}

        {/* Recent Tweets */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Posts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {tweetsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2 border-b pb-4 last:border-0">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))
            ) : tweets && tweets.length > 0 ? (
              tweets.map((tweet) => (
                <div key={tweet.id} className="space-y-2 border-b pb-4 last:border-0">
                  <p className="text-sm">{tweet.text}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {tweet.created_at && (
                      <span>{formatDistanceToNow(new Date(tweet.created_at), { addSuffix: true })}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Heart className="h-3 w-3" /> {formatNumber(tweet.public_metrics?.like_count)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Repeat2 className="h-3 w-3" /> {formatNumber(tweet.public_metrics?.retweet_count)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> {formatNumber(tweet.public_metrics?.reply_count)}
                    </span>
                    {tweet.public_metrics?.impression_count !== undefined && (
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" /> {formatNumber(tweet.public_metrics.impression_count)}
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No recent posts found</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTwitterAnalytics, Tweet } from "@/hooks/use-twitter-metrics";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, MessageSquare, Heart, Repeat2, Eye, Twitter, 
  TrendingUp, BarChart3, Calendar, Quote, Bookmark, 
  MapPin, Link as LinkIcon, Award, Activity
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend 
} from "recharts";

const CANTON_USERNAME = "CantonNetwork";

const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--secondary))', '#10b981', '#f59e0b'];

export default function TwitterMetrics() {
  const { data, isLoading, error } = useTwitterAnalytics(CANTON_USERNAME);

  const formatNumber = (num: number | undefined) => {
    if (num === undefined || num === null) return "—";
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
    return num.toLocaleString();
  };

  const user = data?.user;
  const analytics = data?.analytics;

  // Prepare chart data
  const engagementChartData = analytics?.engagementByDay 
    ? Object.entries(analytics.engagementByDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-30)
        .map(([date, data]) => ({
          date: format(new Date(date), 'MMM d'),
          likes: data.likes,
          retweets: data.retweets,
          replies: data.replies,
        }))
    : [];

  const tweetFrequencyData = analytics?.tweetsByDay
    ? Object.entries(analytics.tweetsByDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-30)
        .map(([date, count]) => ({
          date: format(new Date(date), 'MMM d'),
          tweets: count,
        }))
    : [];

  const engagementBreakdown = analytics ? [
    { name: 'Likes', value: analytics.engagement.totalLikes },
    { name: 'Retweets', value: analytics.engagement.totalRetweets },
    { name: 'Replies', value: analytics.engagement.totalReplies },
    { name: 'Quotes', value: analytics.engagement.totalQuotes },
  ] : [];

  const TweetCard = ({ tweet, rank }: { tweet: Tweet; rank?: number }) => (
    <div className="space-y-2 border-b border-border/50 pb-4 last:border-0">
      <div className="flex items-start gap-2">
        {rank && (
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
            {rank}
          </span>
        )}
        <p className="text-sm flex-1">{tweet.text}</p>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {tweet.created_at && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDistanceToNow(new Date(tweet.created_at), { addSuffix: true })}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Heart className="h-3 w-3 text-red-500" /> {formatNumber(tweet.public_metrics?.like_count)}
        </span>
        <span className="flex items-center gap-1">
          <Repeat2 className="h-3 w-3 text-green-500" /> {formatNumber(tweet.public_metrics?.retweet_count)}
        </span>
        <span className="flex items-center gap-1">
          <MessageSquare className="h-3 w-3 text-blue-500" /> {formatNumber(tweet.public_metrics?.reply_count)}
        </span>
        <span className="flex items-center gap-1">
          <Quote className="h-3 w-3" /> {formatNumber(tweet.public_metrics?.quote_count)}
        </span>
        {tweet.public_metrics?.impression_count !== undefined && tweet.public_metrics.impression_count > 0 && (
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" /> {formatNumber(tweet.public_metrics.impression_count)}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Twitter className="h-8 w-8 text-[#1DA1F2]" />
          <div>
            <h1 className="text-3xl font-bold">@{CANTON_USERNAME} Analytics</h1>
            <p className="text-muted-foreground">Comprehensive X.com metrics and insights</p>
          </div>
        </div>

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">Error loading Twitter data: {error.message}</p>
              {error.message?.includes("Rate limited") && (
                <p className="text-sm text-muted-foreground mt-2">
                  The Twitter API has rate limits. Please wait a few minutes and refresh the page.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* API Limitations Warning */}
        {data?.apiLimitations?.message && (
          <Card className="border-yellow-500/50 bg-yellow-500/5">
            <CardContent className="pt-6">
              <p className="text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                {data.apiLimitations.message}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Profile metrics from the free tier are shown below. Upgrade to Twitter API Basic ($100/month) for full tweet analytics.
              </p>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
                  <CardContent><Skeleton className="h-8 w-20" /></CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : data && (
          <>
            {/* Profile Info */}
            {user && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex items-start gap-4">
                      {user.profile_image_url && (
                        <img 
                          src={user.profile_image_url.replace('_normal', '_400x400')} 
                          alt={user.name} 
                          className="h-20 w-20 rounded-full border-4 border-primary/20" 
                        />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-bold">{user.name}</h2>
                          {user.verified && <span className="text-[#1DA1F2]">✓</span>}
                        </div>
                        <p className="text-muted-foreground">@{user.username}</p>
                        {user.location && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3" /> {user.location}
                          </p>
                        )}
                        {user.url && (
                          <a href={user.url} target="_blank" rel="noopener noreferrer" 
                             className="text-sm text-primary flex items-center gap-1 mt-1 hover:underline">
                            <LinkIcon className="h-3 w-3" /> Website
                          </a>
                        )}
                      </div>
                    </div>
                    {user.description && (
                      <div className="flex-1">
                        <p className="text-muted-foreground">{user.description}</p>
                        {user.created_at && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Joined {format(new Date(user.created_at), 'MMMM yyyy')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Key Metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Followers</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(user?.public_metrics?.followers_count)}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Following</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(user?.public_metrics?.following_count)}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Posts</CardTitle>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(user?.public_metrics?.tweet_count)}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Listed</CardTitle>
                  <Award className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(user?.public_metrics?.listed_count)}</div>
                </CardContent>
              </Card>
            </div>

            {/* Engagement Metrics */}
            {analytics && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-gradient-to-br from-red-500/10 to-transparent">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Likes</CardTitle>
                    <Heart className="h-4 w-4 text-red-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatNumber(analytics.engagement.totalLikes)}</div>
                    <p className="text-xs text-muted-foreground">
                      Avg: {analytics.engagement.avgLikesPerTweet}/post
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-500/10 to-transparent">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Retweets</CardTitle>
                    <Repeat2 className="h-4 w-4 text-green-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatNumber(analytics.engagement.totalRetweets)}</div>
                    <p className="text-xs text-muted-foreground">
                      Avg: {analytics.engagement.avgRetweetsPerTweet}/post
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-blue-500/10 to-transparent">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Replies</CardTitle>
                    <MessageSquare className="h-4 w-4 text-blue-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatNumber(analytics.engagement.totalReplies)}</div>
                    <p className="text-xs text-muted-foreground">
                      Avg: {analytics.engagement.avgRepliesPerTweet}/post
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple-500/10 to-transparent">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Engagement Rate</CardTitle>
                    <TrendingUp className="h-4 w-4 text-purple-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics.engagement.engagementRate.toFixed(3)}%</div>
                    <p className="text-xs text-muted-foreground">
                      Based on {analytics.totalTweetsAnalyzed} posts
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Additional Stats */}
            {analytics && (
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Impressions</CardTitle>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatNumber(analytics.engagement.totalImpressions)}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Quotes</CardTitle>
                    <Quote className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatNumber(analytics.engagement.totalQuotes)}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Bookmarks</CardTitle>
                    <Bookmark className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatNumber(analytics.engagement.totalBookmarks)}</div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Charts */}
            <div className="grid gap-6 lg:grid-cols-2">
              {engagementChartData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Engagement Over Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={engagementChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="likes" stroke="#ef4444" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="retweets" stroke="#22c55e" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="replies" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {tweetFrequencyData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Posting Frequency
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={tweetFrequencyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Bar dataKey="tweets" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Engagement Breakdown Pie Chart */}
            {engagementBreakdown.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Engagement Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={engagementBreakdown}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {engagementBreakdown.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Top Performing Tweets */}
            <Tabs defaultValue="likes" className="w-full">
              <Card>
                <CardHeader>
                  <CardTitle>Top Performing Posts</CardTitle>
                  <TabsList>
                    <TabsTrigger value="likes">By Likes</TabsTrigger>
                    <TabsTrigger value="retweets">By Retweets</TabsTrigger>
                    <TabsTrigger value="impressions">By Impressions</TabsTrigger>
                  </TabsList>
                </CardHeader>
                <CardContent className="space-y-4">
                  <TabsContent value="likes" className="space-y-4 mt-0">
                    {analytics?.topTweets.byLikes.map((tweet, i) => (
                      <TweetCard key={tweet.id} tweet={tweet} rank={i + 1} />
                    ))}
                  </TabsContent>
                  <TabsContent value="retweets" className="space-y-4 mt-0">
                    {analytics?.topTweets.byRetweets.map((tweet, i) => (
                      <TweetCard key={tweet.id} tweet={tweet} rank={i + 1} />
                    ))}
                  </TabsContent>
                  <TabsContent value="impressions" className="space-y-4 mt-0">
                    {analytics?.topTweets.byImpressions.map((tweet, i) => (
                      <TweetCard key={tweet.id} tweet={tweet} rank={i + 1} />
                    ))}
                  </TabsContent>
                </CardContent>
              </Card>
            </Tabs>

            {/* Recent Posts */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Posts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.recentTweets.slice(0, 10).map((tweet) => (
                  <TweetCard key={tweet.id} tweet={tweet} />
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

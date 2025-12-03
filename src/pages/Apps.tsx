import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Package, Star, Coins, Calendar, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLatestACSSnapshot } from "@/hooks/use-acs-snapshots";
import { useAggregatedTemplateData } from "@/hooks/use-aggregated-template-data";
import { DataSourcesFooter } from "@/components/DataSourcesFooter";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { format, parseISO } from "date-fns";

// Helper to safely extract field values from nested structure
function getField(record: any, ...fieldNames: string[]) {
  for (const field of fieldNames) {
    if (record[field] !== undefined && record[field] !== null) return record[field];
    if (record.payload?.[field] !== undefined && record.payload?.[field] !== null) return record.payload[field];
    if (record.payload?.payload?.[field] !== undefined && record.payload?.payload?.[field] !== null) return record.payload.payload[field];
  }
  return undefined;
}

function formatPartyId(id: string) {
  return id.split("::")[0] || id;
}

const formatRewards = (amount: number) => {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`;
  return amount.toFixed(2);
};

// Build monthly timeline from activity markers
function buildMonthlyTimeline(activities: any[]) {
  const monthMap = new Map<string, { count: number; apps: string[] }>();
  
  activities.forEach((activity: any) => {
    const createdAt = getField(activity, 'createdAt', 'created_at', 'timestamp', 'recordTime', 'record_time', 'effectiveAt', 'effective_at');
    const appName = getField(activity, 'appName', 'name', 'applicationName', 'provider', 'providerId');
    
    let date: Date | null = null;
    if (createdAt) {
      try {
        date = typeof createdAt === 'string' ? parseISO(createdAt) : new Date(createdAt);
      } catch {
        // ignore parse errors
      }
    }
    
    if (date && !isNaN(date.getTime())) {
      const monthKey = format(date, 'MMM yyyy');
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, { count: 0, apps: [] });
      }
      const entry = monthMap.get(monthKey)!;
      entry.count++;
      if (appName) {
        const shortName = typeof appName === 'string' ? appName.split("::")[0] : String(appName);
        if (!entry.apps.includes(shortName)) {
          entry.apps.push(shortName);
        }
      }
    }
  });

  return Array.from(monthMap.entries())
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => {
      const dateA = new Date(a.month);
      const dateB = new Date(b.month);
      return dateA.getTime() - dateB.getTime();
    });
}

const Apps = () => {
  const { data: latestSnapshot } = useLatestACSSnapshot();

  const appsQuery = useAggregatedTemplateData(latestSnapshot?.id, "Splice:Amulet:FeaturedAppRight", !!latestSnapshot);
  const activityQuery = useAggregatedTemplateData(latestSnapshot?.id, "Splice:Amulet:FeaturedAppActivityMarker", !!latestSnapshot);

  // Fetch app rewards from scan API
  const { data: appRewardsData } = useQuery({
    queryKey: ["top-providers-app-rewards"],
    queryFn: () => scanApi.fetchTopProviders(1000),
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = appsQuery.isLoading || activityQuery.isLoading;
  const apps = appsQuery.data?.data || [];
  const activities = activityQuery.data?.data || [];

  // Create a map of provider -> total rewards
  const rewardsByProvider = new Map<string, number>();
  appRewardsData?.providersAndRewards?.forEach((p) => {
    const providerId = p.provider.split("::")[0];
    rewardsByProvider.set(providerId, parseFloat(p.rewards) || 0);
  });

// Create a map of provider -> activity markers (use FULL provider ID for matching)
const activitiesByProvider = new Map<string, any[]>();
activities.forEach((activity: any) => {
  const provider = getField(activity, 'provider', 'providerId', 'providerParty', 'provider_id') || '';
  if (!activitiesByProvider.has(provider)) {
    activitiesByProvider.set(provider, []);
  }
  activitiesByProvider.get(provider)?.push(activity);
});

// Group activity markers by beneficiary for summary
const groupActivitiesByBeneficiary = (activities: any[]) => {
  const beneficiaryMap = new Map<string, { count: number; totalWeight: number }>();
  activities.forEach((activity) => {
    const beneficiary = formatPartyId(getField(activity, 'beneficiary') || '');
    const weight = parseFloat(getField(activity, 'weight') || '0');
    if (!beneficiaryMap.has(beneficiary)) {
      beneficiaryMap.set(beneficiary, { count: 0, totalWeight: 0 });
    }
    const entry = beneficiaryMap.get(beneficiary)!;
    entry.count++;
    entry.totalWeight += weight;
  });
  return beneficiaryMap;
};

  // Build monthly timeline data from activities
  const monthlyData = buildMonthlyTimeline(activities);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Package className="h-8 w-8 text-primary" />
            Canton Network Apps
          </h1>
          <p className="text-muted-foreground">Featured applications on the Canton Network</p>
        </div>

        {isLoading && <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full" />)}</div>}
        {!isLoading && apps.length === 0 && <Card className="p-8 text-center"><Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" /><h3 className="text-lg font-semibold mb-2">No Apps Found</h3></Card>}
        {!isLoading && apps.length > 0 && (
          <>
            {/* Monthly Timeline Chart */}
            {monthlyData.length > 0 && (
              <section>
                <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                  <Calendar className="h-6 w-6 text-primary" />
                  Featured App Timeline
                </h2>
                <Card className="p-6">
                  <p className="text-sm text-muted-foreground mb-4">
                    Monthly activity showing when apps became featured or had activity updates
                  </p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyData}>
                        <XAxis 
                          dataKey="month" 
                          tick={{ fontSize: 12 }}
                          tickLine={false}
                        />
                        <YAxis 
                          allowDecimals={false}
                          tick={{ fontSize: 12 }}
                          tickLine={false}
                        />
                        <Tooltip 
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-popover border rounded-lg p-3 shadow-lg">
                                  <p className="font-semibold">{label}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {data.count} activity marker{data.count !== 1 ? 's' : ''}
                                  </p>
                                  {data.apps.length > 0 && (
                                    <div className="mt-2 text-xs">
                                      <p className="font-medium">Apps:</p>
                                      {data.apps.slice(0, 5).map((app: string, i: number) => (
                                        <p key={i} className="text-muted-foreground truncate max-w-48">{app}</p>
                                      ))}
                                      {data.apps.length > 5 && (
                                        <p className="text-muted-foreground">+{data.apps.length - 5} more</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {monthlyData.map((_, index) => (
                            <Cell key={`cell-${index}`} className="fill-primary" />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </section>
            )}

            {/* Featured Applications Table */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold">Featured Applications</h2>
                <div className="flex gap-2">
                  <Badge variant="secondary">{apps.length} Apps</Badge>
                  <Badge variant="outline">{activities.length} Activity Markers</Badge>
                </div>
              </div>
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[150px]">App Name</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead className="text-right">Total Rewards (CC)</TableHead>
                      <TableHead className="text-right">Activity Markers</TableHead>
                      <TableHead>Beneficiaries</TableHead>
                      <TableHead className="w-[300px]">JSON Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apps.map((app: any, i: number) => {
                      const appName = getField(app, 'appName', 'name', 'applicationName', 'app_name', 'label', 'description', 'title', 'displayName', 'display_name');
                      const provider = getField(app, 'provider', 'providerId', 'providerParty', 'provider_id') || '';
                      const providerShort = formatPartyId(provider);
                      const totalRewards = rewardsByProvider.get(providerShort) || 0;
                      
                      // Match by full provider ID
                      const appActivities = activitiesByProvider.get(provider) || [];
                      const beneficiaryData = groupActivitiesByBeneficiary(appActivities);
                      
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Star className="h-4 w-4 text-primary" />
                              {appName || 'Unknown App'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-xs text-muted-foreground truncate max-w-[200px] block" title={provider}>
                              {providerShort || 'Unknown'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {totalRewards > 0 ? (
                              <span className="font-semibold">{formatRewards(totalRewards)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {appActivities.length > 0 ? (
                              <Badge variant="secondary">{appActivities.length}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {beneficiaryData.size > 0 ? (
                              <div className="space-y-1">
                                {Array.from(beneficiaryData.entries()).slice(0, 2).map(([beneficiary, data], idx) => (
                                  <div key={idx} className="flex items-center gap-2 text-xs">
                                    <span className="text-muted-foreground truncate max-w-[120px]" title={beneficiary}>
                                      {formatPartyId(beneficiary) || 'Unknown'}
                                    </span>
                                    <Badge variant="outline" className="text-xs">
                                      {data.totalWeight.toFixed(4)}
                                    </Badge>
                                  </div>
                                ))}
                                {beneficiaryData.size > 2 && (
                                  <span className="text-xs text-muted-foreground">+{beneficiaryData.size - 2} more</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">No markers</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-24 max-w-[300px]">
                              {JSON.stringify(app, null, 2)}
                            </pre>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </section>
          </>
        )}

        <DataSourcesFooter
          snapshotId={latestSnapshot?.id}
          templateSuffixes={["Splice:Amulet:FeaturedAppRight", "Splice:Amulet:FeaturedAppActivityMarker"]}
          isProcessing={false}
        />
      </div>
    </DashboardLayout>
  );
};

export default Apps;

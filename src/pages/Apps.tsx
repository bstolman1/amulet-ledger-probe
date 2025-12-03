import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Star, Code, Coins } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLatestACSSnapshot } from "@/hooks/use-acs-snapshots";
import { useAggregatedTemplateData } from "@/hooks/use-aggregated-template-data";
import { DataSourcesFooter } from "@/components/DataSourcesFooter";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";

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

  // Helper to safely extract field values from nested structure
  const getField = (record: any, ...fieldNames: string[]) => {
    for (const field of fieldNames) {
      // Check top level
      if (record[field] !== undefined && record[field] !== null) return record[field];
      // Check payload
      if (record.payload?.[field] !== undefined && record.payload?.[field] !== null) return record.payload[field];
      // Check nested in payload.payload
      if (record.payload?.payload?.[field] !== undefined && record.payload?.payload?.[field] !== null) return record.payload.payload[field];
    }
    return undefined;
  };

  const formatPartyId = (id: string) => id.split("::")[0] || id;
  
  const formatRewards = (amount: number) => {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`;
    return amount.toFixed(2);
  };

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
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold">Featured Applications</h2>
                <Badge variant="secondary">{apps.length} Apps</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {apps.map((app: any, i: number) => {
                  const appName = getField(app, 'appName', 'name', 'applicationName', 'app_name', 'label', 'description', 'title', 'displayName', 'display_name');
                  const provider = getField(app, 'provider', 'providerId', 'providerParty', 'provider_id');
                  const dso = getField(app, 'dso');
                  const providerShort = formatPartyId(provider || '');
                  const totalRewards = rewardsByProvider.get(providerShort) || 0;
                  
                  return (
                  <Card key={i} className="p-6 space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold text-lg">{appName || 'Unknown App'}</h3>
                      </div>
                      <Badge className="gradient-primary"><Star className="h-3 w-3 mr-1" />Featured</Badge>
                    </div>
                    
                    {/* Total Rewards */}
                    <div className="bg-muted/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <Coins className="h-3 w-3" />
                        Total App Rewards
                      </div>
                      <p className="text-xl font-bold">
                        {totalRewards > 0 ? formatRewards(totalRewards) : '—'} 
                        <span className="text-sm font-normal text-muted-foreground ml-1">CC</span>
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Provider</p>
                        <p className="font-mono text-xs break-all">{providerShort || 'Unknown'}</p>
                      </div>
                      {dso && (
                        <div>
                          <p className="text-xs text-muted-foreground">DSO</p>
                          <p className="font-mono text-xs break-all">{dso}</p>
                        </div>
                      )}
                    </div>
                    
                    <Collapsible className="pt-2 border-t">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-start">
                          <Code className="h-4 w-4 mr-2" />
                          Show Raw JSON
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2">
                        <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">
                          {JSON.stringify(app, null, 2)}
                        </pre>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                  );
                })}
              </div>
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

import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveSnapshot } from "@/hooks/use-acs-snapshots";
import { useAggregatedTemplateData } from "@/hooks/use-aggregated-template-data";
import { DataSourcesFooter } from "@/components/DataSourcesFooter";

const Apps = () => {
  const { data: activeData } = useActiveSnapshot();
  const latestSnapshot = activeData?.snapshot;
  const isProcessing = activeData?.isProcessing || false;

  const appsQuery = useAggregatedTemplateData(latestSnapshot?.id, "Splice:Amulet:FeaturedAppRight", !!latestSnapshot);

  const isLoading = appsQuery.isLoading;
  const apps = (appsQuery.data?.data || []).map((app: any) => ({
    name: app.payload?.appName || app.appName || 'Unknown App',
    provider: app.payload?.provider || app.provider || 'Unknown',
    isFeatured: true,
  }));

  const formatPartyId = (id: string) => id.split("::")[0] || id;

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
                {apps.map((app: any, i: number) => (
                  <Card key={i} className="p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold text-lg">{app.name}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">Provider: <span className="font-mono text-xs">{formatPartyId(app.provider)}</span></p>
                    <Badge className="gradient-primary"><Star className="h-3 w-3 mr-1" />Featured</Badge>
                  </Card>
                ))}
              </div>
            </section>
          </>
        )}

        <DataSourcesFooter
          snapshotId={latestSnapshot?.id}
          templateSuffixes={["Splice:Amulet:FeaturedAppRight"]}
          isProcessing={isProcessing}
        />
      </div>
    </DashboardLayout>
  );
};

export default Apps;

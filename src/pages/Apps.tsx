import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Package, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const Apps = () => {
  const { data: featuredApps, isLoading: featuredLoading, isError: featuredError } = useQuery({
    queryKey: ["featuredApps"],
    queryFn: () => scanApi.fetchFeaturedApps(),
    retry: 1,
  });

  const formatPartyId = (partyId: string) => {
    const parts = partyId.split("::");
    return parts[0] || partyId;
  };

  const AppCard = ({ app, featured = false }: { app: any; featured?: boolean }) => {
    const payload = app.payload;
    const provider = payload?.provider || "Unknown Provider";
    
    return (
      <Card className={`glass-card ${featured ? 'border-2 border-primary/30' : ''}`}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xl font-bold">{formatPartyId(provider)}</h3>
                {featured && (
                  <Badge className="bg-primary/20 text-primary border-primary/30">
                    <Star className="h-3 w-3 mr-1 fill-current" />
                    Featured
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground font-mono truncate">
                {provider}
              </p>
            </div>
            <Package className="h-8 w-8 text-primary/50" />
          </div>

          {payload?.configuration && (
            <div className="space-y-3">
              {payload.configuration.name && (
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1">App Name</p>
                  <p className="font-semibold">{payload.configuration.name}</p>
                </div>
              )}
              
              {payload.configuration.version && (
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1">Version</p>
                  <p className="font-mono text-sm">{payload.configuration.version}</p>
                </div>
              )}

              {payload.configuration.url && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.open(payload.configuration.url, '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Visit App
                </Button>
              )}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground">Contract ID</p>
            <p className="text-xs font-mono text-foreground/70 truncate mt-1">
              {app.contract_id}
            </p>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-bold mb-2">Canton Network Apps</h2>
          <p className="text-muted-foreground">
            Explore applications built on the Canton Network
          </p>
        </div>

        {/* Featured Apps Section */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <Star className="h-6 w-6 text-primary fill-current" />
            <h3 className="text-2xl font-bold">Featured Applications</h3>
          </div>

          {featuredLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-64 w-full" />
              ))}
            </div>
          ) : featuredError ? (
            <Card className="glass-card p-8">
              <div className="text-center">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Unable to load featured apps. The API endpoint may be unavailable.
                </p>
              </div>
            </Card>
          ) : !featuredApps?.featured_apps?.length ? (
            <Card className="glass-card p-8">
              <div className="text-center">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No featured apps available at the moment</p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredApps.featured_apps.map((app: any) => (
                <AppCard key={app.contract_id} app={app} featured={true} />
              ))}
            </div>
          )}
        </div>

        {/* Stats Card */}
        <Card className="glass-card">
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 rounded-lg bg-primary/5">
                <p className="text-sm text-muted-foreground mb-2">Featured Apps</p>
                {featuredLoading ? (
                  <Skeleton className="h-10 w-16 mx-auto" />
                ) : (
                  <p className="text-4xl font-bold text-primary">
                    {featuredApps?.featured_apps?.length || 0}
                  </p>
                )}
              </div>
              <div className="text-center p-4 rounded-lg bg-chart-2/5">
                <p className="text-sm text-muted-foreground mb-2">Active Providers</p>
                {featuredLoading ? (
                  <Skeleton className="h-10 w-16 mx-auto" />
                ) : (
                  <p className="text-4xl font-bold text-chart-2">
                    {new Set(featuredApps?.featured_apps?.map((app: any) => app.payload?.provider)).size || 0}
                  </p>
                )}
              </div>
              <div className="text-center p-4 rounded-lg bg-chart-3/5">
                <p className="text-sm text-muted-foreground mb-2">Network Status</p>
                <p className="text-4xl font-bold text-chart-3">Active</p>
              </div>
            </div>
          </div>
        </Card>

        {/* App Information */}
        <Card className="glass-card">
          <div className="p-6">
            <h3 className="text-xl font-bold mb-4">About Canton Network Apps</h3>
            <div className="space-y-4 text-muted-foreground">
              <p>
                Featured applications on the Canton Network are applications that have been granted
                special rights by the DSO (Decentralized System Operator). These applications can
                provide enhanced services and receive featured app rewards.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div className="p-4 rounded-lg bg-muted/30">
                  <h4 className="font-semibold text-foreground mb-2">Featured Status</h4>
                  <p className="text-sm">
                    Applications approved by DSO members receive featured status and increased
                    reward rates for their contributions to the network.
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/30">
                  <h4 className="font-semibold text-foreground mb-2">App Rewards</h4>
                  <p className="text-sm">
                    Featured applications earn Canton Coin rewards based on their usage and
                    contributions to the Canton Network ecosystem.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Apps;

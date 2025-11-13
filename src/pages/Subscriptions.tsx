import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search, Package } from "lucide-react";
import { useLatestACSSnapshot } from "@/hooks/use-acs-snapshots";
import { useAggregatedTemplateData } from "@/hooks/use-aggregated-template-data";

const Subscriptions = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: latestSnapshot } = useLatestACSSnapshot();
  
  const subscriptionsQuery = useAggregatedTemplateData(
    latestSnapshot?.id,
    "Wallet:Subscriptions:Subscription",
    !!latestSnapshot
  );
  
  const idleStatesQuery = useAggregatedTemplateData(
    latestSnapshot?.id,
    "Wallet:Subscriptions:SubscriptionIdleState",
    !!latestSnapshot
  );
  
  const requestsQuery = useAggregatedTemplateData(
    latestSnapshot?.id,
    "Wallet:Subscriptions:SubscriptionRequest",
    !!latestSnapshot
  );

  const subscriptionsData = subscriptionsQuery.data?.data || [];
  const idleStatesData = idleStatesQuery.data?.data || [];
  const requestsData = requestsQuery.data?.data || [];
  const isLoading = subscriptionsQuery.isLoading || idleStatesQuery.isLoading || requestsQuery.isLoading;

  const formatParty = (party: string) => {
    if (party.length > 30) {
      return `${party.substring(0, 15)}...${party.substring(party.length - 12)}`;
    }
    return party;
  };

  const filteredSubscriptions = subscriptionsData.filter((sub: any) => {
    const reference = sub.payload?.subscription?.reference || sub.subscription?.reference || sub.reference || "";
    const subscriber = sub.payload?.subscription?.subscriber || sub.subscription?.subscriber || sub.subscriber || "";
    return (
      reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
      subscriber.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }).slice(0, 100);

  const filteredIdleStates = idleStatesData.filter((state: any) => {
    const reference = state.payload?.subscriptionReference || state.subscriptionReference || "";
    return reference.toLowerCase().includes(searchTerm.toLowerCase());
  }).slice(0, 100);

  const filteredRequests = requestsData.filter((req: any) => {
    const reference = req.payload?.subscription?.reference || req.subscription?.reference || req.reference || "";
    return reference.toLowerCase().includes(searchTerm.toLowerCase());
  }).slice(0, 100);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Package className="h-8 w-8 text-primary" />
            Wallet Subscriptions
          </h1>
          <p className="text-muted-foreground">
            View active subscriptions, idle states, and pending subscription requests.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Active Subscriptions</h3>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold">{subscriptionsData.length}</p>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Idle States</h3>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold">{idleStatesData.length}</p>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Pending Requests</h3>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold">{requestsData.length}</p>
            )}
          </Card>
        </div>

        <Card className="p-6">
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Search subscriptions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Tabs defaultValue="active" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="active">Active ({subscriptionsData.length})</TabsTrigger>
              <TabsTrigger value="idle">Idle ({idleStatesData.length})</TabsTrigger>
              <TabsTrigger value="requests">Requests ({requestsData.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="space-y-3 mt-4">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : filteredSubscriptions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No active subscriptions found</p>
              ) : (
                filteredSubscriptions.map((sub: any, idx: number) => (
                  <div key={idx} className="p-4 bg-muted/30 rounded-lg space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          Reference: {formatParty(sub.payload?.subscription?.reference || sub.subscription?.reference || sub.reference || 'Unknown')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Subscriber: {formatParty(sub.payload?.subscription?.subscriber || sub.subscription?.subscriber || sub.subscriber || 'Unknown')}
                        </p>
                      </div>
                      <Badge variant="default">Active</Badge>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="idle" className="space-y-3 mt-4">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : filteredIdleStates.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No idle states found</p>
              ) : (
                filteredIdleStates.map((state: any, idx: number) => (
                  <div key={idx} className="p-4 bg-muted/30 rounded-lg space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          Reference: {formatParty(state.payload?.subscriptionReference || state.subscriptionReference || 'Unknown')}
                        </p>
                      </div>
                      <Badge variant="secondary">Idle</Badge>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="requests" className="space-y-3 mt-4">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : filteredRequests.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No pending requests found</p>
              ) : (
                filteredRequests.map((req: any, idx: number) => (
                  <div key={idx} className="p-4 bg-muted/30 rounded-lg space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          Reference: {formatParty(req.payload?.subscription?.reference || req.subscription?.reference || req.reference || 'Unknown')}
                        </p>
                      </div>
                      <Badge variant="outline">Pending</Badge>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Subscriptions;

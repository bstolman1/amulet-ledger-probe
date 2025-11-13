import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search, Award, Ticket } from "lucide-react";
import { useLatestACSSnapshot } from "@/hooks/use-acs-snapshots";
import { useAggregatedTemplateData } from "@/hooks/use-aggregated-template-data";

const ValidatorLicenses = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: latestSnapshot } = useLatestACSSnapshot();
  
  const licensesQuery = useAggregatedTemplateData(
    latestSnapshot?.id,
    "Splice:ValidatorLicense:ValidatorLicense",
    !!latestSnapshot
  );
  
  const couponsQuery = useAggregatedTemplateData(
    latestSnapshot?.id,
    "Splice:ValidatorLicense:ValidatorFaucetCoupon",
    !!latestSnapshot
  );

  const licensesData = licensesQuery.data?.data || [];
  const couponsData = couponsQuery.data?.data || [];
  const isLoading = licensesQuery.isLoading || couponsQuery.isLoading;

  const formatParty = (party: string) => {
    if (!party || party.length <= 30) return party || "Unknown";
    return `${party.substring(0, 15)}...${party.substring(party.length - 12)}`;
  };

  const filteredLicenses = licensesData.filter((lic: any) => {
    if (!searchTerm) return true;
    const validator = lic.payload?.validator || lic.validator || "";
    const sponsor = lic.payload?.sponsor || lic.sponsor || "";
    return validator.toLowerCase().includes(searchTerm.toLowerCase()) ||
           sponsor.toLowerCase().includes(searchTerm.toLowerCase());
  }).slice(0, 100);

  const filteredCoupons = couponsData.filter((coupon: any) => {
    if (!searchTerm) return true;
    const validator = coupon.payload?.validator || coupon.validator || "";
    return validator.toLowerCase().includes(searchTerm.toLowerCase());
  }).slice(0, 100);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Award className="h-8 w-8 text-primary" />
            Validator Licenses & Coupons
          </h1>
          <p className="text-muted-foreground">
            View active validator licenses and faucet coupons on the network.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Active Licenses</h3>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold">{licensesQuery.data?.totalContracts || 0}</p>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Faucet Coupons</h3>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold">{couponsQuery.data?.totalContracts || 0}</p>
            )}
          </Card>
        </div>

        <Card className="p-6">
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Search by validator..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Tabs defaultValue="licenses" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="licenses">Licenses ({licensesQuery.data?.totalContracts || 0})</TabsTrigger>
              <TabsTrigger value="coupons">Coupons ({couponsQuery.data?.totalContracts || 0})</TabsTrigger>
            </TabsList>

            <TabsContent value="licenses" className="space-y-3 mt-4">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : filteredLicenses.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No validator licenses found</p>
              ) : (
                filteredLicenses.map((license: any, idx: number) => {
                  const validator = license.payload?.validator || license.validator;
                  const sponsor = license.payload?.sponsor || license.sponsor;
                  const lastActiveRound = license.payload?.lastActiveRound || license.lastActiveRound;
                  
                  return (
                    <div key={idx} className="p-4 bg-muted/30 rounded-lg space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="text-sm font-medium">Validator: {formatParty(validator)}</p>
                          <p className="text-xs text-muted-foreground">Sponsor: {formatParty(sponsor)}</p>
                        </div>
                        <Badge variant="default">Active</Badge>
                      </div>
                      {lastActiveRound && (
                        <p className="text-xs text-muted-foreground">
                          Last Active Round: {lastActiveRound}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </TabsContent>

            <TabsContent value="coupons" className="space-y-3 mt-4">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : filteredCoupons.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No faucet coupons found</p>
              ) : (
                filteredCoupons.map((coupon: any, idx: number) => {
                  const validator = coupon.payload?.validator || coupon.validator;
                  const round = coupon.payload?.round || coupon.round;
                  
                  return (
                    <div key={idx} className="p-4 bg-muted/30 rounded-lg space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Ticket className="h-4 w-4 text-primary" />
                            <p className="text-sm font-medium">Validator: {formatParty(validator)}</p>
                          </div>
                          {round && (
                            <p className="text-xs text-muted-foreground">Round: {round}</p>
                          )}
                        </div>
                        <Badge variant="secondary">Coupon</Badge>
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ValidatorLicenses;

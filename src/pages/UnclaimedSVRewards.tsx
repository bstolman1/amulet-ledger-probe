import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Award, Users, TrendingUp, Search } from "lucide-react";
import { useActiveSnapshot } from "@/hooks/use-acs-snapshots";
import { useAggregatedTemplateData } from "@/hooks/use-aggregated-template-data";
import { DataSourcesFooter } from "@/components/DataSourcesFooter";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ValidatorInfo {
  user: string;
  validator: string;
  count: number;
}

const UnclaimedSVRewards = () => {
  const [searchTerm, setSearchTerm] = useState("");
  
  const { data: activeSnapshotData } = useActiveSnapshot();
  const snapshot = activeSnapshotData?.snapshot;
  const isProcessing = activeSnapshotData?.isProcessing || false;

  // Fetch ValidatorRight contracts - shows which users have validator rights
  const { data: validatorRightsData, isLoading: rightsLoading } = useAggregatedTemplateData(
    snapshot?.id,
    "Splice:Amulet:ValidatorRight",
    !!snapshot
  );

  // Fetch Amulet data to calculate potential rewards
  const { data: amuletData, isLoading: amuletLoading } = useAggregatedTemplateData(
    snapshot?.id,
    "Splice:Amulet:Amulet",
    !!snapshot
  );

  const isLoading = rightsLoading || amuletLoading;

  // Aggregate validator rights by validator
  const validatorStats = (() => {
    const validatorMap = new Map<string, ValidatorInfo>();

    (validatorRightsData?.data || []).forEach((right: any) => {
      const validator = right.validator;
      const user = right.user;
      
      if (!validatorMap.has(validator)) {
        validatorMap.set(validator, { 
          validator, 
          user: user || "Unknown",
          count: 0 
        });
      }
      const info = validatorMap.get(validator)!;
      info.count += 1;
    });

    return Array.from(validatorMap.values())
      .sort((a, b) => b.count - a.count)
      .filter((v) => {
        if (!searchTerm) return true;
        return v.validator.toLowerCase().includes(searchTerm.toLowerCase()) ||
               v.user.toLowerCase().includes(searchTerm.toLowerCase());
      });
  })();

  // Calculate total validator rights
  const totalValidatorRights = validatorRightsData?.totalContracts || 0;
  const uniqueValidators = validatorStats.length;
  const totalAmulets = amuletData?.totalContracts || 0;

  const formatParty = (party: string) => {
    if (!party) return "Unknown";
    const parts = party.split("::");
    if (parts.length > 1) {
      return parts[0].substring(0, 30);
    }
    return party.substring(0, 30);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Super Validator (SV) Rights</h2>
          <p className="text-muted-foreground">
            Validator rights and delegation data from the latest ACS snapshot
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Award className="h-4 w-4" />
                Total Validator Rights
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <>
                  <p className="text-3xl font-bold text-primary">
                    {totalValidatorRights.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Active validator delegations
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Unique Validators
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <>
                  <p className="text-3xl font-bold text-chart-2">
                    {uniqueValidators.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Super validators in network
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Total Amulets
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <>
                  <p className="text-3xl font-bold text-success">
                    {totalAmulets.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Active amulet contracts
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Validator Rights Table */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Validator Rights</CardTitle>
                <CardDescription className="mt-1">
                  Super validators and their delegated rights
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search validators..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : validatorStats.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  {searchTerm ? "No validators found matching your search" : "No validator rights data available"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Validator</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">Rights Count</TableHead>
                      <TableHead className="text-right">% of Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validatorStats.map((validator, index) => {
                      const percentage = (validator.count / totalValidatorRights) * 100;
                      return (
                        <TableRow key={validator.validator}>
                          <TableCell className="font-medium">{index + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <code className="text-xs bg-muted px-2 py-1 rounded">
                                {formatParty(validator.validator)}
                              </code>
                            </div>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs text-muted-foreground">
                              {formatParty(validator.user)}
                            </code>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline">
                              {validator.count.toLocaleString()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm font-medium text-primary">
                              {percentage.toFixed(2)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <DataSourcesFooter
          snapshotId={snapshot?.id}
          templateSuffixes={["Splice:Amulet:ValidatorRight", "Splice:Amulet:Amulet"]}
          isProcessing={isProcessing}
        />
      </div>
    </DashboardLayout>
  );
};

export default UnclaimedSVRewards;

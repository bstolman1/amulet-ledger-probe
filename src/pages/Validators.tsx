import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Zap, Award, Download, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const Validators = () => {
  const { toast } = useToast();
  
  const { data: topValidators, isLoading, isError } = useQuery({
    queryKey: ["topValidators"],
    queryFn: () => scanApi.fetchTopValidators(),
    retry: 1,
  });

  const { data: dsoInfo, isLoading: dsoLoading } = useQuery({
    queryKey: ["dsoInfo"],
    queryFn: () => scanApi.fetchDsoInfo(),
    retry: 1,
  });

  // Extract SV data from DsoRules contract
  const dsoRules = dsoInfo?.dso_rules?.contract?.payload;
  const svs = dsoRules?.svs || [];
  const offboardedSvs = dsoRules?.offboardedSvs || [];
  
  // Convert SVs array to proper format (these are the primary operators)
  const primaryOperators = svs.map(([id, data]: [string, any]) => ({
    id,
    name: data.name,
    participantId: data.participantId,
    rewardWeight: data.svRewardWeight,
    joinedRound: data.joinedAsOfRound?.number || 0,
    type: 'Primary Operator' as const,
  })).sort((a, b) => b.rewardWeight - a.rewardWeight);
  
  // Additional beneficiary validators from approvedSvIdentities config (not exposed via API)
  const beneficiaryValidators = [
    { name: "validator_GSF-1", beneficiary: "validator_GSF-1::12201725270d497ab23ceffd0d2acce46cc9da44586fd494786ef53cc58b6e4abd79", weight: 100000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "validator_Broadridge", beneficiary: "validator_Broadridge::1220b0008ea5531b9e47d3315a822ca8b923b5bdd568c934557402d7160b8af4815d", weight: 100000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "The Tie", beneficiary: "the_tie_validator::1220d3016091c253f526645cce3a0633837b685da083bac4459dad63e61d5c97b5fa", weight: 10000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Copper", beneficiary: "copper-mainnet-validator::122038dd7fcbdd68bde47034abfd582cbe38854d94dec10c18a7589706914e2b6e61", weight: 10000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Dfns", beneficiary: "validator_DFNS::122055a1a137eacd142f00d72a7bd9c6b83ad00f65d97cb79a343d42c2077ae29ca6", weight: 10000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Copper Clearloop", beneficiary: "copper-mainnet-validator::122038dd7fcbdd68bde47034abfd582cbe38854d94dec10c18a7589706914e2b6e61", weight: 10000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Elliptic", beneficiary: "Elliptic-validator-1::12205ddf609265d68ee694480f86331de14766bdac30800d04e491b93aca1a81d629", weight: 5000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Obsidian Systems", beneficiary: "ObsidianSystems-validator-1::1220f8a24f975dc3d070e3111279bc2bf2d713a77c5570cbdd2064acb6a4d8d6feea", weight: 10000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Coin Metrics", beneficiary: "CoinMetrics-validator-1::1220b6cf34a2c8937dc72403e7a8b57c80049be8aff3e5e2d992063460bdc8636466", weight: 10000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Circle", beneficiary: "circle-validator-1::12209d457bab21f1ce3d52f979cdf021c2990cb74cf01ef2dcf41bf87a79ddaf3ba8", weight: 100000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Quantstamp", beneficiary: "Quantstamp-validator-1::1220acba2f1ab44b954a6de966678d7cc069e66a3986e4b5f4af29a6445c208f8fb1", weight: 10000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Bitwave", beneficiary: "bitwave-finance-1::1220ab03fc0c7f77428d8f568276b64a6e6a04e340c842581a0d4e676ad7e094c1bb", weight: 10000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "IntellectEU", beneficiary: "IntellectEU-SVrewards-1::122085181345795b9e58122cef90b8df61ddfe128cdaf9abbcb77f8cef92950c1d05", weight: 10000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "AngelHack", beneficiary: "angelhack-mainnet-1::12205162445638c3f71c9942b74360134b4ebc953b5bea2c25adc99bff130bffd060", weight: 10000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "AngelHack (escrow)", beneficiary: "AngelHack-ghost-1::1220f5cf298f609f538b46a2a0347d299028ddca7ea008aaed65e0ca862db974c5e2", weight: 15000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Kaiko", beneficiary: "kaiko-mainnet-1::1220f67b4f1c8742d83ac7e12749d98195bf88ff120b2dab369291cf6a2ca27be9a9", weight: 40000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Kaiko (escrow)", beneficiary: "Kaiko-ghost-1::1220f5cf298f609f538b46a2a0347d299028ddca7ea008aaed65e0ca862db974c5e2", weight: 25000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Kiln", beneficiary: "kiln-validator-1::12209024881cf76bf1c15342e9e3b4bd751d5582947a58b42a6532eef867f83ceea3", weight: 10000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Figment", beneficiary: "figment-mainnetValidator-1::1220b46e6ce64f99510274b4aaa573b32089e69cfee0f1e918539f19f78e9ea23ba4", weight: 10000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "TRM", beneficiary: "TRM-validator-1::1220bc3dc0350c7c2479ff1e7dfc67f4af0ee25c9ab63861d953483d9bdbb36691fe", weight: 25000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Monstera FZE (escrow)", beneficiary: "MonsteraFZE-ghost-1::1220f5cf298f609f538b46a2a0347d299028ddca7ea008aaed65e0ca862db974c5e2", weight: 50000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Woodside AI (escrow)", beneficiary: "WoodsideAI-ghost-1::1220f5cf298f609f538b46a2a0347d299028ddca7ea008aaed65e0ca862db974c5e2", weight: 100000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Zero Hash (escrow)", beneficiary: "ZeroHash-ghost-1::1220f5cf298f609f538b46a2a0347d299028ddca7ea008aaed65e0ca862db974c5e2", weight: 75000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Ubyx (escrow)", beneficiary: "Ubyx-ghost-1::1220f5cf298f609f538b46a2a0347d299028ddca7ea008aaed65e0ca862db974c5e2", weight: 50000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Hypernative (escrow)", beneficiary: "Hypernative-ghost-1::1220f5cf298f609f538b46a2a0347d299028ddca7ea008aaed65e0ca862db974c5e2", weight: 10000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Chainlink (escrow 1)", beneficiary: "Chainlink-ghost-1::1220f5cf298f609f538b46a2a0347d299028ddca7ea008aaed65e0ca862db974c5e2", weight: 75000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Chainlink (escrow 2)", beneficiary: "Chainlink-ghost-2::1220f5cf298f609f538b46a2a0347d299028ddca7ea008aaed65e0ca862db974c5e2", weight: 30000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Layer Zero (escrow)", beneficiary: "LayerZero-ghost-1::1220f5cf298f609f538b46a2a0347d299028ddca7ea008aaed65e0ca862db974c5e2", weight: 30000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Wormhole (escrow)", beneficiary: "Wormhole-ghost-1::1220f5cf298f609f538b46a2a0347d299028ddca7ea008aaed65e0ca862db974c5e2", weight: 30000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Ledger (escrow)", beneficiary: "Ledger-ghost-1::1220f5cf298f609f538b46a2a0347d299028ddca7ea008aaed65e0ca862db974c5e2", weight: 50000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "Taurus (escrow)", beneficiary: "Taurus-ghost-1::1220f5cf298f609f538b46a2a0347d299028ddca7ea008aaed65e0ca862db974c5e2", weight: 50000, svProvider: "Global-Synchronizer-Foundation" },
    { name: "MPCH", beneficiary: "auth0_007c66f47b4f7dbebab8f2af6967::12204783725aa3adcd787311531134baed8b9b28ccf76b100c62b8d4995842aabd6b", weight: 10000, svProvider: "MPC-Holding-Inc" },
    { name: "MPCH 2", beneficiary: "auth0_007c684c0bbea5e9c9e5a9ad16f6::12204783725aa3adcd787311531134baed8b9b28ccf76b100c62b8d4995842aabd6b", weight: 2500, svProvider: "MPC-Holding-Inc" },
    { name: "Lukka", beneficiary: "auth0_007c6882116872613fe1d8b0aeb6::12204783725aa3adcd787311531134baed8b9b28ccf76b100c62b8d4995842aabd6b", weight: 7500, svProvider: "MPC-Holding-Inc" },
    { name: "Nima Capital", beneficiary: "auth0_007c67acae90ab8ef9d344b817b4::12205d4d358e9de3351c74419d9746ea9083854c113f826240fe2b2ce808a51a3a7e", weight: 50000, svProvider: "Orb-1-LP-1" },
    { name: "Nima Capital (Lennar)", beneficiary: "auth0_007c6723cbcc5cee3153df57da4d::122039b0120dda65f350bbd22731b636ffe2eb757a4f04bf41a18d689c6e9351633a", weight: 50000, svProvider: "Orb-1-LP-1" },
  ];
  
  // Combine all validators
  const allValidators = [
    ...primaryOperators,
    ...beneficiaryValidators.map(b => ({
      id: b.beneficiary,
      name: b.name,
      participantId: b.beneficiary,
      rewardWeight: b.weight,
      joinedRound: 0,
      type: 'Beneficiary' as const,
      svProvider: b.svProvider,
    }))
  ];
  
  const superValidators = allValidators.sort((a, b) => b.rewardWeight - a.rewardWeight);

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return "gradient-primary text-primary-foreground";
      case 2:
        return "bg-chart-2/20 text-chart-2";
      case 3:
        return "bg-chart-3/20 text-chart-3";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const formatPartyId = (partyId: string) => {
    const parts = partyId.split("::");
    return parts[0] || partyId;
  };

  const formatRewardWeight = (weight: number) => {
    // Weight is in basis points (1/10000), convert to percentage
    return (weight / 10000).toFixed(2) + '%';
  };

  const exportValidatorData = () => {
    try {
      const csvRows = [];
      
      // Header
      csvRows.push(['Canton Network Supervalidators']);
      csvRows.push(['Generated:', new Date().toISOString()]);
      csvRows.push([]);
      
      // Active SVs
      csvRows.push(['Active Supervalidators']);
      csvRows.push(['Name', 'ID', 'Reward Weight (bps)', 'Reward Weight (%)', 'Joined Round']);
      
      superValidators.forEach(sv => {
        csvRows.push([
          sv.name,
          sv.id,
          sv.rewardWeight,
          formatRewardWeight(sv.rewardWeight),
          sv.joinedRound
        ]);
      });
      
      csvRows.push([]);
      csvRows.push(['Offboarded Supervalidators']);
      csvRows.push(['Name', 'ID']);
      
      offboardedSvs.forEach(([id, data]: [string, any]) => {
        csvRows.push([data.name, id]);
      });
      
      const csvContent = csvRows.map(row => 
        row.map(cell => `"${cell}"`).join(',')
      ).join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `supervalidators-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Export successful",
        description: "Validator data has been exported to CSV",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "There was an error exporting the data",
        variant: "destructive",
      });
    }
  };

  const svNodeStates = dsoInfo?.sv_node_states || [];
  const totalValidators = topValidators?.validatorsAndRewards?.length || 0;
  const totalRewardWeight = superValidators.reduce((sum, sv) => sum + sv.rewardWeight, 0);
  
  const primaryCount = superValidators.filter(sv => sv.type === 'Primary Operator').length;
  const beneficiaryCount = superValidators.filter(sv => sv.type === 'Beneficiary').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header with Stats */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Supervalidators</h2>
            <p className="text-muted-foreground">
              Decentralized network operators ({superValidators.length} active)
            </p>
          </div>
          <Button 
            onClick={exportValidatorData}
            disabled={dsoLoading || !superValidators.length}
            variant="outline"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="glass-card">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground">Total SVs</h3>
                <Award className="h-4 w-4 text-primary" />
              </div>
              {dsoLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <>
                  <p className="text-3xl font-bold text-primary">{superValidators.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    All validators
                  </p>
                </>
              )}
            </div>
          </Card>

          <Card className="glass-card">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground">Primary Operators</h3>
                <Zap className="h-4 w-4 text-chart-2" />
              </div>
              {dsoLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <p className="text-3xl font-bold text-chart-2">{primaryCount}</p>
              )}
            </div>
          </Card>

          <Card className="glass-card">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground">Beneficiaries</h3>
                <TrendingUp className="h-4 w-4 text-chart-3" />
              </div>
              {dsoLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <p className="text-3xl font-bold text-chart-3">{beneficiaryCount}</p>
              )}
            </div>
          </Card>

          <Card className="glass-card">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground">Offboarded</h3>
                <Award className="h-4 w-4 text-muted-foreground" />
              </div>
              {dsoLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <p className="text-3xl font-bold text-muted-foreground">{offboardedSvs.length}</p>
              )}
            </div>
          </Card>
        </div>

        {/* Info Banner */}
        <Card className="glass-card border-primary/20 bg-primary/5">
          <div className="p-4">
            <div className="flex items-start gap-3">
              <Award className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold text-foreground mb-1">
                  Complete Supervalidator Network
                </p>
                <p className="text-muted-foreground">
                  Showing all {superValidators.length} supervalidators including {primaryCount} primary operators 
                  and {beneficiaryCount} beneficiary validators. Each primary operator may distribute portions of 
                  their rewards to beneficiary validators based on the network's governance configuration.
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Supervalidators List */}
        <Card className="glass-card">
          <div className="p-6">
            <h3 className="text-xl font-bold mb-2">All Supervalidators</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Complete network of primary operators and beneficiary validators
            </p>
            {dsoLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : !superValidators.length ? (
              <div className="text-center p-8">
                <p className="text-muted-foreground">No supervalidator data available</p>
              </div>
            ) : (
              <div className="space-y-4">
                {superValidators.map((sv, index) => {
                  const rank = index + 1;
                  return (
                    <div
                      key={sv.id}
                      className="p-6 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 hover:border-primary/40 transition-smooth"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-4">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold ${getRankColor(rank)}`}>
                            {rank <= 3 ? <Trophy className="h-6 w-6" /> : rank}
                          </div>
                          <div>
                            <h3 className="text-xl font-bold mb-1">{sv.name}</h3>
                            <div className="flex items-center gap-2">
                              <p className="font-mono text-xs text-muted-foreground">
                                {sv.id}
                              </p>
                              {sv.type === 'Beneficiary' && (
                                <Badge variant="outline" className="text-xs">
                                  via {sv.svProvider}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <Badge className={sv.type === 'Primary Operator' ? "bg-primary/20 text-primary border-primary/30" : "bg-chart-2/20 text-chart-2 border-chart-2/30"}>
                          <Zap className="h-3 w-3 mr-1" />
                          {sv.type}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="p-4 rounded-lg bg-background/50">
                          <p className="text-sm text-muted-foreground mb-1">Rank</p>
                          <p className="text-2xl font-bold text-foreground">#{rank}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-background/50">
                          <p className="text-sm text-muted-foreground mb-1">Reward Weight</p>
                          <p className="text-2xl font-bold text-primary">
                            {formatRewardWeight(sv.rewardWeight)}
                          </p>
                        </div>
                        <div className="p-4 rounded-lg bg-background/50">
                          <p className="text-sm text-muted-foreground mb-1">Weight (bps)</p>
                          <p className="text-2xl font-bold text-chart-2">
                            {sv.rewardWeight.toLocaleString()}
                          </p>
                        </div>
                        <div className="p-4 rounded-lg bg-background/50">
                          <p className="text-sm text-muted-foreground mb-1">Joined Round</p>
                          <p className="text-2xl font-bold text-chart-3">
                            {sv.joinedRound.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Offboarded SVs */}
        {offboardedSvs.length > 0 && (
          <Card className="glass-card">
            <div className="p-6">
              <h3 className="text-xl font-bold mb-6">Offboarded Supervalidators</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {offboardedSvs.map(([id, data]: [string, any]) => (
                  <div
                    key={id}
                    className="p-4 rounded-lg bg-muted/30 border border-border/50"
                  >
                    <h4 className="font-bold mb-2">{data.name}</h4>
                    <p className="font-mono text-xs text-muted-foreground truncate">
                      {id}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Regular Validators Section */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Active Validators</h2>
            <p className="text-muted-foreground">
              All active validators on the Canton Network ({totalValidators} total)
            </p>
          </div>
        </div>

        <Card className="glass-card">
          <div className="p-6">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-40 w-full" />
                ))}
              </div>
            ) : isError ? (
              <div className="text-center p-8">
                <p className="text-muted-foreground">Unable to load validator data. The API endpoint may be unavailable.</p>
              </div>
            ) : !topValidators?.validatorsAndRewards?.length ? (
              <div className="text-center p-8">
                <p className="text-muted-foreground">No validator data available</p>
              </div>
            ) : (
              <div className="space-y-4">
                {topValidators?.validatorsAndRewards.map((validator, index) => {
                  const rank = index + 1;
                  return (
                    <div
                      key={validator.provider}
                      className="p-6 rounded-lg bg-muted/30 hover:bg-muted/50 transition-smooth border border-border/50"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-4">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold ${getRankColor(rank)}`}>
                            {rank <= 3 ? <Trophy className="h-6 w-6" /> : rank}
                          </div>
                          <div>
                            <h3 className="text-xl font-bold mb-1">{formatPartyId(validator.provider)}</h3>
                            <p className="font-mono text-sm text-muted-foreground truncate max-w-md">
                              {validator.provider}
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-success/10 text-success border-success/20">
                          <Zap className="h-3 w-3 mr-1" />
                          active
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-4 rounded-lg bg-background/50">
                          <p className="text-sm text-muted-foreground mb-1">Rounds Collected</p>
                          <p className="text-2xl font-bold text-primary">
                            {parseFloat(validator.rewards).toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}
                          </p>
                        </div>
                        <div className="p-4 rounded-lg bg-background/50">
                          <p className="text-sm text-muted-foreground mb-1">Rank</p>
                          <p className="text-2xl font-bold text-foreground">#{rank}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-background/50">
                          <p className="text-sm text-muted-foreground mb-1">Status</p>
                          <p className="text-2xl font-bold text-success">Active</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Validators;

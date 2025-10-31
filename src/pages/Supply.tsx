import { DashboardLayout } from "@/components/DashboardLayout";
import { BurnMintStats } from "@/components/BurnMintStats";
import { DailyMintBurnChart } from "@/components/DailyMintBurnChart";
import { ACSSnapshotCard } from "@/components/ACSSnapshotCard";
import { TriggerACSSnapshotButton } from "@/components/TriggerACSSnapshotButton";

const Supply = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Supply & Tokenomics</h2>
            <p className="text-muted-foreground">
              Track circulating supply, daily minting, burning, and supply changes
            </p>
          </div>
          <TriggerACSSnapshotButton />
        </div>

        {/* ACS Snapshot - Circulating Supply */}
        <ACSSnapshotCard />

        {/* Burn/Mint Stats */}
        <BurnMintStats />

        {/* Daily Mint/Burn Chart */}
        <DailyMintBurnChart />
      </div>
    </DashboardLayout>
  );
};

export default Supply;

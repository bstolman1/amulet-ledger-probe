import { DashboardLayout } from "@/components/DashboardLayout";
import { BurnMintStats } from "@/components/BurnMintStats";
import { DailyMintBurnChart } from "@/components/DailyMintBurnChart";

const Supply = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Supply & Tokenomics</h2>
          <p className="text-muted-foreground">
            Track daily minting, burning, and supply changes
          </p>
        </div>

        {/* Burn/Mint Stats */}
        <BurnMintStats />

        {/* Daily Mint/Burn Chart */}
        <DailyMintBurnChart />
      </div>
    </DashboardLayout>
  );
};

export default Supply;

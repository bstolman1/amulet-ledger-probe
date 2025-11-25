import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RewardSummary {
  beneficiary: string;
  totalUnclaimed: number;
  totalClaimed: number;
  totalExpired: number;
  unclaimedCoupons: Array<{
    round: number;
    amount: number;
    expiresAt: string;
  }>;
  claimedCoupons: Array<{
    round: number;
    amount: number;
    claimedAt: string;
  }>;
  expiredCoupons: Array<{
    round: number;
    amount: number;
    expiredAt: string;
  }>;
}

export function useSVRewardsSummary(
  beneficiary: string | undefined,
  beginRecordTime: string | undefined,
  endRecordTime: string | undefined,
  enabled: boolean = true
) {
  return useQuery<RewardSummary, Error>({
    queryKey: ["sv-rewards-summary", beneficiary, beginRecordTime, endRecordTime],
    queryFn: async () => {
      if (!beneficiary || !beginRecordTime || !endRecordTime) {
        throw new Error("Missing required parameters");
      }

      const { data, error } = await supabase.functions.invoke("sv-rewards-summary", {
        body: {
          beneficiary,
          beginRecordTime,
          endRecordTime,
        },
      });

      if (error) throw error;
      return data as RewardSummary;
    },
    enabled: enabled && !!beneficiary && !!beginRecordTime && !!endRecordTime,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

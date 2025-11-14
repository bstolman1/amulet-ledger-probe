export type TemplateSuffix = string;

// Central map of template suffixes to pages that actually consume them
export const templatePageMap: Record<TemplateSuffix, string[]> = {
  // Supply / Balances
  'Splice:Amulet:Amulet': ['Supply', 'Balances'],
  'Splice:Amulet:LockedAmulet': ['Supply', 'Balances'],
  'Splice:Round:IssuingMiningRound': ['Supply', 'Mining Rounds'],
  'Splice:Round:ClosedMiningRound': ['Supply', 'Mining Rounds'],

  // Mining Rounds
  'Splice:Round:OpenMiningRound': ['Mining Rounds'],

  // Transfers
  'Splice:AmuletRules:TransferPreapproval': ['Transfers'],
  'Splice:ExternalPartyAmuletRules:TransferCommand': ['Transfers'],
  'Splice:AmuletTransferInstruction:AmuletTransferInstruction': ['Transfers'],

  // Governance
  'Splice:DsoRules:DsoRules': ['Governance'],
  'Splice:DsoRules:VoteRequest': ['Governance'],
  'Splice:DSO:AmuletPrice:AmuletPriceVote': ['Governance'],

  // Unclaimed SV Rewards
  'Splice:Amulet:ValidatorRewardCoupon': ['Unclaimed SV Rewards'],

  // Apps
  'Splice:Amulet:FeaturedAppRight': ['Apps'],

  // ANS
  'Splice:Ans:AnsEntry': ['ANS'],
  'Splice:Ans:AnsEntryContext': ['ANS'],

  // Validator Licenses
  'Splice:ValidatorLicense:ValidatorLicense': ['Validator Licenses'],
  'Splice:ValidatorLicense:ValidatorFaucetCoupon': ['Validator Licenses'],

  // DSO State
  'DSO:SvState:SvNodeState': ['DSO State'],
  'DSO:SvState:SvStatusReport': ['DSO State'],
  'DSO:SvState:SvRewardState': ['DSO State'],

  // Member Traffic
  'Splice:DecentralizedSynchronizer:MemberTraffic': ['Member Traffic'],

  // Subscriptions
  'Wallet:Subscriptions:Subscription': ['Subscriptions'],
  'Wallet:Subscriptions:SubscriptionIdleState': ['Subscriptions'],
  'Wallet:Subscriptions:SubscriptionRequest': ['Subscriptions'],

  // External Party Setup
  'Splice:AmuletRules:ExternalPartySetupProposal': ['External Party Setup'],
};

export const getPagesThatUseTemplate = (templateId: string): string[] => {
  const suffix = templateId.split(':').slice(-3).join(':');
  return templatePageMap[suffix] || [];
};

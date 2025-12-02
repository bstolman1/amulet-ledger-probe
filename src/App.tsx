import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy load all pages for faster initial load
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Transactions = lazy(() => import("./pages/Transactions"));
const Validators = lazy(() => import("./pages/Validators"));
const RoundStats = lazy(() => import("./pages/RoundStats"));
const ANS = lazy(() => import("./pages/ANS"));
const Stats = lazy(() => import("./pages/Stats"));
const Apps = lazy(() => import("./pages/Apps"));
const Governance = lazy(() => import("./pages/Governance"));
const Supply = lazy(() => import("./pages/Supply"));
const UnclaimedSVRewards = lazy(() => import("./pages/UnclaimedSVRewards"));
const Admin = lazy(() => import("./pages/Admin"));
const SnapshotProgress = lazy(() => import("./pages/SnapshotProgress"));
const Transfers = lazy(() => import("./pages/Transfers"));
const RichList = lazy(() => import("./pages/RichList"));
const Templates = lazy(() => import("./pages/Templates"));
const TemplateAudit = lazy(() => import("./pages/TemplateAudit"));
const MemberTraffic = lazy(() => import("./pages/MemberTraffic"));
const Subscriptions = lazy(() => import("./pages/Subscriptions"));
const DSOState = lazy(() => import("./pages/DSOState"));
const ValidatorLicenses = lazy(() => import("./pages/ValidatorLicenses"));
const ExternalPartySetup = lazy(() => import("./pages/ExternalPartySetup"));
const BackfillProgress = lazy(() => import("./pages/BackfillProgress"));
const LiveUpdates = lazy(() => import("./pages/LiveUpdates"));
const Elections = lazy(() => import("./pages/Elections"));
const TransferCounters = lazy(() => import("./pages/TransferCounters"));
const ExternalPartyRules = lazy(() => import("./pages/ExternalPartyRules"));
const AmuletRules = lazy(() => import("./pages/AmuletRules"));
const TwitterMetrics = lazy(() => import("./pages/TwitterMetrics"));
const NotFound = lazy(() => import("./pages/NotFound"));

const PageLoader = () => (
  <div className="min-h-screen p-8 space-y-4">
    <Skeleton className="h-12 w-64" />
    <Skeleton className="h-64 w-full" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000),
      staleTime: 5 * 60_000, // 5 minutes
      gcTime: 10 * 60_000, // 10 minutes
      refetchOnWindowFocus: false,
      networkMode: 'offlineFirst',
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/transfers" element={<Transfers />} />
            <Route path="/rich-list" element={<RichList />} />
            <Route path="/validators" element={<Validators />} />
            <Route path="/round-stats" element={<RoundStats />} />
            <Route path="/ans" element={<ANS />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/apps" element={<Apps />} />
            <Route path="/governance" element={<Governance />} />
            <Route path="/supply" element={<Supply />} />
            <Route path="/unclaimed-sv-rewards" element={<UnclaimedSVRewards />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/snapshot-progress" element={<SnapshotProgress />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/template-audit" element={<TemplateAudit />} />
            <Route path="/member-traffic" element={<MemberTraffic />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/dso-state" element={<DSOState />} />
            <Route path="/validator-licenses" element={<ValidatorLicenses />} />
            <Route path="/external-party-setup" element={<ExternalPartySetup />} />
            <Route path="/amulet-rules" element={<AmuletRules />} />
            <Route path="/elections" element={<Elections />} />
            <Route path="/transfer-counters" element={<TransferCounters />} />
            <Route path="/external-party-rules" element={<ExternalPartyRules />} />
            <Route path="/backfill-progress" element={<BackfillProgress />} />
            <Route path="/live-updates" element={<LiveUpdates />} />
            <Route path="/twitter" element={<TwitterMetrics />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

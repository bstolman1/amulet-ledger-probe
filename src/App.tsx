import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiStatusBanner } from "@/components/ApiStatusBanner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Validators from "./pages/Validators";
import MiningRounds from "./pages/MiningRounds";
import RoundStats from "./pages/RoundStats";
import ANS from "./pages/ANS";
import Stats from "./pages/Stats";
import Apps from "./pages/Apps";
import Governance from "./pages/Governance";
import Supply from "./pages/Supply";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000),
      staleTime: 60_000,
      gcTime: 5 * 60_000,
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
      <ApiStatusBanner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/validators" element={<Validators />} />
          <Route path="/mining-rounds" element={<MiningRounds />} />
          <Route path="/round-stats" element={<RoundStats />} />
          <Route path="/ans" element={<ANS />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/apps" element={<Apps />} />
          <Route path="/governance" element={<Governance />} />
          <Route path="/supply" element={<Supply />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

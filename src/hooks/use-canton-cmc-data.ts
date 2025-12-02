import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CantonMetadata {
  logo: string;
  description: string;
  urls: {
    website?: string[];
    twitter?: string[];
    explorer?: string[];
  };
  tags?: string[];
}

export interface PricePerformance {
  all_time_high: number;
  all_time_high_date: string;
  all_time_low: number;
  all_time_low_date: string;
  percent_change_1y?: number;
  percent_change_90d?: number;
  percent_change_30d?: number;
}

export interface MarketPair {
  exchange: { name: string; slug: string };
  market_pair: string;
  quote: { USD: { price: number; volume_24h: number } };
}

export interface OHLCVData {
  time_open: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function useCantonFullData(days = 90) {
  return useQuery({
    queryKey: ['cmc-canton-full', days],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('coinmarketcap', {
        body: { endpoint: 'canton_full', days }
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: 300000, // 5 minutes
    staleTime: 60000,
  });
}

export function useCantonMetadata() {
  return useQuery({
    queryKey: ['cmc-canton-metadata'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('coinmarketcap', {
        body: { endpoint: 'metadata' }
      });
      if (error) throw error;
      return data;
    },
    staleTime: 3600000, // 1 hour
  });
}

export function useCantonPricePerformance() {
  return useQuery({
    queryKey: ['cmc-canton-price-performance'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('coinmarketcap', {
        body: { endpoint: 'price_performance' }
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: 300000,
  });
}

export function useCantonMarketPairs() {
  return useQuery({
    queryKey: ['cmc-canton-market-pairs'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('coinmarketcap', {
        body: { endpoint: 'market_pairs' }
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: 300000,
  });
}

export function useCantonOHLCV(days = 90) {
  return useQuery({
    queryKey: ['cmc-canton-ohlcv', days],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('coinmarketcap', {
        body: { endpoint: 'ohlcv_historical', days }
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: 300000,
  });
}

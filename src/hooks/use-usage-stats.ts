import React from "react";
import { useUsageStats } from "@/hooks/use-usage-stats";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function StatsPage() {
  const { data, isLoading, error } = useUsageStats(); // ✅ No arguments (all-time data)

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mb-2" />
        <p>Loading usage statistics…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-red-400">
        <p className="text-lg font-medium">Failed to load usage statistics.</p>
        <p className="text-sm text-gray-500 mt-1">{(error as Error).message || "Unknown error"}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-gray-400">
        <p>No data available.</p>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen bg-gray-950 text-gray-100">
      <h1 className="text-xl font-semibold mb-6">Usage Statistics</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Cumulative Unique Parties */}
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <h2 className="text-sm font-medium mb-2 text-gray-300">Cumulative Unique Parties</h2>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.cumulativeParties}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis dataKey="date" tick={{ fill: "#8884d8", fontSize: 11 }} tickLine={false} minTickGap={20} />
                <YAxis tick={{ fill: "#8884d8", fontSize: 11 }} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#111",
                    border: "none",
                    color: "#fff",
                  }}
                />
                <Line type="monotone" dataKey="parties" stroke="#4f9eff" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Daily Active Users */}
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <h2 className="text-sm font-medium mb-2 text-gray-300">Daily Active Users</h2>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.dailyActiveUsers}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis dataKey="date" tick={{ fill: "#8884d8", fontSize: 11 }} tickLine={false} minTickGap={20} />
                <YAxis tick={{ fill: "#8884d8", fontSize: 11 }} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#111",
                    border: "none",
                    color: "#fff",
                  }}
                />
                <Line type="monotone" dataKey="daily" stroke="#00e0ff" strokeWidth={2} dot={false} />
                <Line
                  type="monotone"
                  dataKey="avg7d"
                  stroke="#ffaa00"
                  strokeDasharray="4 2"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Daily Transactions */}
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <h2 className="text-sm font-medium mb-2 text-gray-300">Daily Transactions</h2>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.dailyTransactions}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis dataKey="date" tick={{ fill: "#8884d8", fontSize: 11 }} tickLine={false} minTickGap={20} />
                <YAxis tick={{ fill: "#8884d8", fontSize: 11 }} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#111",
                    border: "none",
                    color: "#fff",
                  }}
                />
                <Line type="monotone" dataKey="daily" stroke="#8fff6d" strokeWidth={2} dot={false} />
                <Line
                  type="monotone"
                  dataKey="avg7d"
                  stroke="#ffaa00"
                  strokeDasharray="4 2"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

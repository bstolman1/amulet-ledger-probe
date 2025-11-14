import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";

interface TemplateDelta {
  template_id: string;
  baseline_count: number;
  current_count: number;
  delta: number;
  percentage_change: number;
}

export const TemplateActivitySection = () => {
  const [templateDeltas, setTemplateDeltas] = useState<TemplateDelta[]>([]);
  const [loading, setLoading] = useState(true);
  const [baselineSnapshot, setBaselineSnapshot] = useState<any>(null);
  const [latestSnapshot, setLatestSnapshot] = useState<any>(null);

  useEffect(() => {
    fetchTemplateActivity();

    // Subscribe to template stats changes
    const channel = supabase
      .channel('template-activity')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'acs_template_stats'
        },
        () => {
          fetchTemplateActivity();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchTemplateActivity = async () => {
    try {
      // Get the latest completed snapshot (baseline)
      const { data: baselineData, error: baselineError } = await supabase
        .from('acs_snapshots')
        .select('*')
        .eq('status', 'completed')
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (baselineError) throw baselineError;
      if (!baselineData) {
        setLoading(false);
        return;
      }

      setBaselineSnapshot(baselineData);

      // Get any snapshots after the baseline (incremental updates)
      const { data: laterSnapshots, error: laterError } = await supabase
        .from('acs_snapshots')
        .select('*')
        .gt('timestamp', baselineData.timestamp)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (laterError) throw laterError;

      // If no newer snapshots, show "waiting for updates" message
      if (!laterSnapshots) {
        setTemplateDeltas([]);
        setLatestSnapshot(null);
        setLoading(false);
        return;
      }

      setLatestSnapshot(laterSnapshots);

      // Get template stats for both snapshots
      const [baselineStatsResponse, currentStatsResponse] = await Promise.all([
        supabase
          .from('acs_template_stats')
          .select('*')
          .eq('snapshot_id', baselineData.id),
        supabase
          .from('acs_template_stats')
          .select('*')
          .eq('snapshot_id', laterSnapshots.id)
      ]);

      if (baselineStatsResponse.error) throw baselineStatsResponse.error;
      if (currentStatsResponse.error) throw currentStatsResponse.error;

      const baselineStats = baselineStatsResponse.data || [];
      const currentStats = currentStatsResponse.data || [];

      // Calculate deltas
      const templateMap = new Map<string, TemplateDelta>();

      // Add baseline counts
      baselineStats.forEach(stat => {
        templateMap.set(stat.template_id, {
          template_id: formatTemplateId(stat.template_id),
          baseline_count: stat.contract_count,
          current_count: stat.contract_count,
          delta: 0,
          percentage_change: 0
        });
      });

      // Update with current counts and calculate deltas
      currentStats.forEach(stat => {
        const existing = templateMap.get(stat.template_id);
        if (existing) {
          existing.current_count = stat.contract_count;
          existing.delta = stat.contract_count - existing.baseline_count;
          existing.percentage_change = existing.baseline_count > 0 
            ? ((existing.delta / existing.baseline_count) * 100)
            : 0;
        } else {
          // New template not in baseline
          templateMap.set(stat.template_id, {
            template_id: formatTemplateId(stat.template_id),
            baseline_count: 0,
            current_count: stat.contract_count,
            delta: stat.contract_count,
            percentage_change: 100
          });
        }
      });

      const deltas = Array.from(templateMap.values())
        .filter(d => Math.abs(d.delta) > 0) // Only show templates with changes
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 15); // Top 15 most changed templates

      setTemplateDeltas(deltas);
    } catch (error) {
      console.error('Error fetching template activity:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTemplateId = (templateId: string) => {
    // Format: packageId_ModuleName_TemplateName -> ModuleName.TemplateName
    const parts = templateId.split('_');
    if (parts.length >= 3) {
      return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
    }
    return templateId;
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Activity className="w-6 h-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!baselineSnapshot) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Template Activity
          </CardTitle>
          <CardDescription>Real-time delta tracking since last completed snapshot</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No completed snapshot available. Waiting for baseline data...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (templateDeltas.length === 0) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Template Activity
          </CardTitle>
          <CardDescription>
            {latestSnapshot 
              ? 'No changes detected in incremental updates'
              : 'Baseline established - waiting for incremental updates'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              Baseline: Migration #{baselineSnapshot.migration_id} ({new Date(baselineSnapshot.timestamp).toLocaleString()})
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Changes will appear here as incremental updates are processed every 2 minutes
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Template Activity
        </CardTitle>
        <CardDescription>
          Real-time delta: Migration #{baselineSnapshot.migration_id} 
          {latestSnapshot && ` → Migration #${latestSnapshot.migration_id}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {templateDeltas.map((delta, index) => (
            <div 
              key={delta.template_id + index}
              className="flex items-center justify-between p-3 rounded-lg bg-background/50 hover:bg-background/70 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{delta.template_id}</p>
                <p className="text-xs text-muted-foreground">
                  {delta.baseline_count.toLocaleString()} → {delta.current_count.toLocaleString()} contracts
                </p>
              </div>
              <div className="flex items-center gap-2 ml-4">
                {delta.delta > 0 ? (
                  <Badge className="bg-green-500/10 text-green-500 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    +{delta.delta.toLocaleString()}
                  </Badge>
                ) : (
                  <Badge className="bg-red-500/10 text-red-500 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" />
                    {delta.delta.toLocaleString()}
                  </Badge>
                )}
                {Math.abs(delta.percentage_change) > 0.01 && (
                  <span className="text-xs text-muted-foreground">
                    {delta.percentage_change > 0 ? '+' : ''}{delta.percentage_change.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

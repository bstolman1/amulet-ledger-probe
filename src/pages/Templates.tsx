import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useACSTemplateData, useACSTemplates } from "@/hooks/use-acs-template-data";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FileJson, Database, Hash } from "lucide-react";
import { useState } from "react";

const Templates = () => {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Fetch latest snapshot
  const { data: snapshots } = useQuery({
    queryKey: ["acs-snapshots-latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("acs_snapshots")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data;
    }
  });

  const latestSnapshot = snapshots?.[0];

  // Fetch all templates
  const { data: templates, isLoading: templatesLoading } = useACSTemplates(latestSnapshot?.id);

  // Fetch data for selected template
  const { data: templateData, isLoading: dataLoading } = useACSTemplateData(
    latestSnapshot?.id,
    selectedTemplate || "",
    !!selectedTemplate
  );

  const analyzeDataStructure = (data: any[]): any => {
    if (!data || data.length === 0) return null;

    const sampleEntry = data[0];
    const structure: any = {};

    const analyzeValue = (value: any, path: string = ""): any => {
      if (value === null || value === undefined) {
        return { type: "null", example: null };
      }

      if (Array.isArray(value)) {
        return {
          type: "array",
          length: value.length,
          itemType: value.length > 0 ? analyzeValue(value[0], path) : "unknown"
        };
      }

      if (typeof value === "object") {
        const nested: any = {};
        Object.keys(value).forEach(key => {
          nested[key] = analyzeValue(value[key], `${path}.${key}`);
        });
        return { type: "object", fields: nested };
      }

      if (typeof value === "number") {
        return { type: "number", example: value };
      }

      if (typeof value === "boolean") {
        return { type: "boolean", example: value };
      }

      if (typeof value === "string") {
        // Detect if it looks like a number
        if (!isNaN(Number(value)) && value !== "") {
          return { type: "string (numeric)", example: value };
        }
        return { type: "string", example: value.length > 50 ? value.substring(0, 50) + "..." : value };
      }

      return { type: typeof value, example: value };
    };

    Object.keys(sampleEntry).forEach(key => {
      structure[key] = analyzeValue(sampleEntry[key], key);
    });

    return structure;
  };

  const renderStructure = (structure: any, depth: number = 0): JSX.Element[] => {
    if (!structure) return [];

    return Object.entries(structure).map(([key, value]: [string, any]) => {
      const indent = depth * 20;

      if (value.type === "object" && value.fields) {
        return (
          <div key={key} style={{ marginLeft: indent }}>
            <div className="flex items-center gap-2 py-1">
              <Badge variant="outline" className="text-xs">object</Badge>
              <code className="text-sm font-mono text-foreground">{key}</code>
            </div>
            {renderStructure(value.fields, depth + 1)}
          </div>
        );
      }

      if (value.type === "array") {
        return (
          <div key={key} style={{ marginLeft: indent }}>
            <div className="flex items-center gap-2 py-1">
              <Badge variant="outline" className="text-xs">array[{value.length}]</Badge>
              <code className="text-sm font-mono text-foreground">{key}</code>
            </div>
            {value.itemType && typeof value.itemType === "object" && (
              <div style={{ marginLeft: indent + 20 }}>
                <span className="text-xs text-muted-foreground">Item structure:</span>
                {renderStructure({ item: value.itemType }, depth + 1)}
              </div>
            )}
          </div>
        );
      }

      return (
        <div key={key} style={{ marginLeft: indent }} className="flex items-center gap-2 py-1">
          <Badge variant="secondary" className="text-xs">{value.type}</Badge>
          <code className="text-sm font-mono text-foreground">{key}</code>
          {value.example !== undefined && value.example !== null && (
            <span className="text-xs text-muted-foreground ml-2">
              = {typeof value.example === "string" ? `"${value.example}"` : String(value.example)}
            </span>
          )}
        </div>
      );
    });
  };

  const structure = templateData?.data ? analyzeDataStructure(templateData.data) : null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Template Data Explorer</h2>
          <p className="text-muted-foreground">
            Explore available templates and their data structures from the latest ACS snapshot
          </p>
        </div>

        {/* Snapshot Info */}
        {latestSnapshot && (
          <Card className="glass-card p-4">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">Snapshot:</span>
                <code className="text-foreground">{latestSnapshot.id.substring(0, 8)}...</code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Migration:</span>
                <code className="text-foreground">{latestSnapshot.migration_id}</code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Recorded:</span>
                <code className="text-foreground">
                  {new Date(latestSnapshot.timestamp).toLocaleString()}
                </code>
              </div>
            </div>
          </Card>
        )}

        <Tabs defaultValue="templates" className="w-full">
          <TabsList>
            <TabsTrigger value="templates">Available Templates</TabsTrigger>
            {selectedTemplate && <TabsTrigger value="structure">Data Structure</TabsTrigger>}
          </TabsList>

          <TabsContent value="templates" className="space-y-4">
            {templatesLoading ? (
              <div className="grid gap-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4">
                {templates?.map((template) => (
                  <Card
                    key={template.template_id}
                    className={`glass-card p-6 cursor-pointer transition-all hover:border-primary ${
                      selectedTemplate === template.template_id ? "border-primary" : ""
                    }`}
                    onClick={() => setSelectedTemplate(template.template_id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <FileJson className="h-5 w-5 text-primary" />
                          <code className="text-lg font-mono text-foreground">
                            {template.template_id}
                          </code>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Hash className="h-4 w-4" />
                            <span>{template.contract_count.toLocaleString()} contracts</span>
                          </div>
                          {template.storage_path && (
                            <div className="flex items-center gap-2">
                              <Database className="h-4 w-4" />
                              <span className="text-xs font-mono">{template.storage_path}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <Badge variant={selectedTemplate === template.template_id ? "default" : "outline"}>
                        {selectedTemplate === template.template_id ? "Selected" : "Select"}
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="structure" className="space-y-4">
            {dataLoading ? (
              <Skeleton className="h-96 w-full" />
            ) : templateData && structure ? (
              <div className="space-y-4">
                <Card className="glass-card p-6">
                  <h3 className="text-xl font-bold mb-4">Template: {selectedTemplate}</h3>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div>
                      <span className="text-sm text-muted-foreground">Total Entries</span>
                      <p className="text-2xl font-bold text-primary">
                        {templateData.metadata.entry_count.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Snapshot Time</span>
                      <p className="text-sm font-mono">
                        {new Date(templateData.metadata.snapshot_timestamp).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Loaded Entries</span>
                      <p className="text-2xl font-bold text-chart-2">
                        {templateData.data.length.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </Card>

                <Card className="glass-card p-6">
                  <h4 className="text-lg font-semibold mb-4">Data Structure</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Analyzed from sample entry. Fields and types may vary across entries.
                  </p>
                  <div className="bg-muted/30 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                    {renderStructure(structure)}
                  </div>
                </Card>

                <Card className="glass-card p-6">
                  <h4 className="text-lg font-semibold mb-4">Sample Entry (First Record)</h4>
                  <div className="bg-muted/30 rounded-lg p-4 overflow-x-auto">
                    <pre className="text-xs font-mono">
                      {JSON.stringify(templateData.data[0], null, 2)}
                    </pre>
                  </div>
                </Card>
              </div>
            ) : (
              <Card className="glass-card p-6">
                <p className="text-muted-foreground">Select a template to view its data structure</p>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Templates;

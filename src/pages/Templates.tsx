import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useACSTemplateData, useACSTemplates } from "@/hooks/use-acs-template-data";
import { useLatestACSSnapshot } from "@/hooks/use-acs-snapshots";
import { FileJson, Database, ChevronDown, ChevronRight, AlertCircle, CheckCircle } from "lucide-react";
import { useState } from "react";
import { getPagesThatUseTemplate } from "@/lib/template-page-map";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Templates = () => {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Fetch latest completed snapshot
  const { data: latestSnapshot } = useLatestACSSnapshot();

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

  // Group templates by usage
  const usedTemplates = templates?.filter(t => getPagesThatUseTemplate(t.template_id).length > 0) || [];
  const unusedTemplates = templates?.filter(t => getPagesThatUseTemplate(t.template_id).length === 0) || [];
  const totalTemplates = templates?.length || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Template Data Explorer</h2>
          <p className="text-muted-foreground mb-2">
            Explore available templates and their data structures from the latest ACS snapshot
          </p>
          <p className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
            <strong>Template ID Format:</strong> <code className="bg-background px-1 rounded">package-hash:Module:Entity:Template</code>
            <br />
            The hash prefix identifies the package/version, while the suffix (e.g., "Splice:Amulet:Amulet") 
            identifies the module, entity, and template name within Canton. Different packages may contain templates with the same names but different implementations.
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Total Templates</h3>
              <Database className="h-5 w-5 text-primary" />
            </div>
            {templatesLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="text-3xl font-bold text-primary mb-1">
                  {totalTemplates}
                </p>
                <p className="text-xs text-muted-foreground">Across all packages</p>
              </>
            )}
          </Card>

          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Used in Pages</h3>
              <CheckCircle className="h-5 w-5 text-success" />
            </div>
            {templatesLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="text-3xl font-bold text-success mb-1">
                  {usedTemplates.length}
                </p>
                <p className="text-xs text-muted-foreground">
                  {totalTemplates > 0 ? ((usedTemplates.length / totalTemplates) * 100).toFixed(0) : 0}% of templates
                </p>
              </>
            )}
          </Card>

          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Unused</h3>
              <AlertCircle className="h-5 w-5 text-warning" />
            </div>
            {templatesLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="text-3xl font-bold text-warning mb-1">
                  {unusedTemplates.length}
                </p>
                <p className="text-xs text-muted-foreground">Not displayed anywhere</p>
              </>
            )}
          </Card>
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

        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">All Templates ({totalTemplates})</TabsTrigger>
            <TabsTrigger value="used">Used ({usedTemplates.length})</TabsTrigger>
            <TabsTrigger value="unused">Unused ({unusedTemplates.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {templatesLoading ? (
              <div className="grid gap-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4">
                {templates?.map((template) => {
                  const pagesUsing = getPagesThatUseTemplate(template.template_id);
                  const isUsed = pagesUsing.length > 0;
                  
                  return (
                <div key={template.template_id}>
                  <Card
                    className={`glass-card p-6 cursor-pointer transition-all hover:border-primary ${
                      selectedTemplate === template.template_id ? "border-primary" : ""
                    }`}
                    onClick={() => setSelectedTemplate(
                      selectedTemplate === template.template_id ? null : template.template_id
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {selectedTemplate === template.template_id ? (
                            <ChevronDown className="h-5 w-5 text-primary" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                          {isUsed ? (
                            <CheckCircle className="h-5 w-5 text-success" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-warning" />
                          )}
                          <FileJson className="h-5 w-5 text-primary" />
                          <code className="text-lg font-mono text-foreground">
                            {template.template_id}
                          </code>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground ml-10 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {template.contract_count.toLocaleString()} contracts
                          </Badge>
                          {isUsed ? (
                            pagesUsing.map(page => (
                              <Badge key={page} variant="secondary" className="text-xs bg-success/10 text-success border-success/20">
                                📄 {page}
                              </Badge>
                            ))
                          ) : (
                            <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/20">
                              ⚠️ Not used in any page
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Badge variant={selectedTemplate === template.template_id ? "default" : "outline"}>
                        {selectedTemplate === template.template_id ? "Expanded" : "Click to expand"}
                      </Badge>
                    </div>
                  </Card>

                  {selectedTemplate === template.template_id && (
                    <div className="ml-6 mt-2 space-y-4">
                      {dataLoading ? (
                        <Skeleton className="h-96 w-full" />
                      ) : templateData && structure ? (
                        <>
                          <Card className="glass-card p-6">
                            <h3 className="text-xl font-bold mb-4">Data Structure</h3>
                            <p className="text-sm text-muted-foreground mb-4">
                              Analyzed from sample entry. Fields and types may vary across entries.
                            </p>
                            <div className="bg-muted/30 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                              {renderStructure(structure)}
                            </div>
                            <p className="text-xs text-muted-foreground mt-4">
                              Based on {templateData.data.length} sample contract(s)
                            </p>
                          </Card>

                          <Card className="glass-card p-6">
                            <h4 className="text-lg font-semibold mb-4">Sample Entry (First Record)</h4>
                            <div className="bg-muted/30 rounded-lg p-4 overflow-x-auto">
                              <pre className="text-xs font-mono">
                                {JSON.stringify(templateData.data[0], null, 2)}
                              </pre>
                            </div>
                          </Card>
                        </>
                      ) : (
                        <Card className="glass-card p-6">
                          <p className="text-muted-foreground">No data available for this template.</p>
                        </Card>
                      )}
                    </div>
                  )}
                </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="used" className="space-y-4">
            {templatesLoading ? (
              <div className="grid gap-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : usedTemplates.length === 0 ? (
              <Card className="glass-card p-8 text-center">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No templates are currently being used</p>
              </Card>
            ) : (
              <div className="grid gap-4">
                {usedTemplates.map((template) => {
                  const pagesUsing = getPagesThatUseTemplate(template.template_id);
                  
                  return (
                <div key={template.template_id}>
                  <Card
                    className={`glass-card p-6 cursor-pointer transition-all hover:border-primary ${
                      selectedTemplate === template.template_id ? "border-primary" : ""
                    }`}
                    onClick={() => setSelectedTemplate(
                      selectedTemplate === template.template_id ? null : template.template_id
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {selectedTemplate === template.template_id ? (
                            <ChevronDown className="h-5 w-5 text-primary" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                          <FileJson className="h-5 w-5 text-primary" />
                          <code className="text-lg font-mono text-foreground">
                            {template.template_id}
                          </code>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground ml-10 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {template.contract_count.toLocaleString()} contracts
                          </Badge>
                          {pagesUsing.map(page => (
                            <Badge key={page} variant="secondary" className="text-xs bg-success/10 text-success border-success/20">
                              📄 {page}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Badge variant={selectedTemplate === template.template_id ? "default" : "outline"}>
                        {selectedTemplate === template.template_id ? "Expanded" : "Click to expand"}
                      </Badge>
                    </div>
                  </Card>

                  {selectedTemplate === template.template_id && (
                    <div className="ml-6 mt-2 space-y-4">
                      {dataLoading ? (
                        <Skeleton className="h-96 w-full" />
                      ) : templateData && structure ? (
                        <>
                          <Card className="glass-card p-6">
                            <h3 className="text-xl font-bold mb-4">Data Structure</h3>
                            <p className="text-sm text-muted-foreground mb-4">
                              Analyzed from sample entry. Fields and types may vary across entries.
                            </p>
                            <div className="bg-muted/30 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                              {renderStructure(structure)}
                            </div>
                            <p className="text-xs text-muted-foreground mt-4">
                              Based on {templateData.data.length} sample contract(s)
                            </p>
                          </Card>

                          <Card className="glass-card p-6">
                            <h4 className="text-lg font-semibold mb-4">Sample Entry (First Record)</h4>
                            <div className="bg-muted/30 rounded-lg p-4 overflow-x-auto">
                              <pre className="text-xs font-mono">
                                {JSON.stringify(templateData.data[0], null, 2)}
                              </pre>
                            </div>
                          </Card>
                        </>
                      ) : (
                        <Card className="glass-card p-6">
                          <p className="text-muted-foreground">No data available for this template.</p>
                        </Card>
                      )}
                    </div>
                  )}
                </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="unused" className="space-y-4">
            {templatesLoading ? (
              <div className="grid gap-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : unusedTemplates.length === 0 ? (
              <Card className="glass-card p-8 text-center">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-success" />
                <p className="text-muted-foreground">All templates are being used! 🎉</p>
              </Card>
            ) : (
              <div className="grid gap-4">
                {unusedTemplates.map((template) => (
                <div key={template.template_id}>
                  <Card
                    className={`glass-card p-6 cursor-pointer transition-all hover:border-warning ${
                      selectedTemplate === template.template_id ? "border-warning" : ""
                    }`}
                    onClick={() => setSelectedTemplate(
                      selectedTemplate === template.template_id ? null : template.template_id
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {selectedTemplate === template.template_id ? (
                            <ChevronDown className="h-5 w-5 text-warning" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                          <AlertCircle className="h-5 w-5 text-warning" />
                          <FileJson className="h-5 w-5 text-warning" />
                          <code className="text-lg font-mono text-foreground">
                            {template.template_id}
                          </code>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground ml-10 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {template.contract_count.toLocaleString()} contracts
                          </Badge>
                          <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/20">
                            ⚠️ Not displayed in any page
                          </Badge>
                        </div>
                      </div>
                      <Badge variant={selectedTemplate === template.template_id ? "default" : "outline"}>
                        {selectedTemplate === template.template_id ? "Expanded" : "Click to expand"}
                      </Badge>
                    </div>
                  </Card>

                  {selectedTemplate === template.template_id && (
                    <div className="ml-6 mt-2 space-y-4">
                      {dataLoading ? (
                        <Skeleton className="h-96 w-full" />
                      ) : templateData && structure ? (
                        <>
                          <Card className="glass-card p-6 border-warning/50">
                            <div className="flex items-start gap-3 mb-4 p-3 bg-warning/10 rounded-lg border border-warning/20">
                              <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-sm font-semibold text-warning mb-1">Template Not Used</p>
                                <p className="text-xs text-muted-foreground">
                                  This template has {template.contract_count.toLocaleString()} contract(s) but is not currently displayed on any page.
                                  Consider adding it to a relevant page or creating a new page for this data.
                                </p>
                              </div>
                            </div>

                            <h3 className="text-xl font-bold mb-4">Data Structure</h3>
                            <p className="text-sm text-muted-foreground mb-4">
                              Analyzed from sample entry. Fields and types may vary across entries.
                            </p>
                            <div className="bg-muted/30 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                              {renderStructure(structure)}
                            </div>
                            <p className="text-xs text-muted-foreground mt-4">
                              Based on {templateData.data.length} sample contract(s)
                            </p>
                          </Card>

                          <Card className="glass-card p-6">
                            <h4 className="text-lg font-semibold mb-4">Sample Entry (First Record)</h4>
                            <div className="bg-muted/30 rounded-lg p-4 overflow-x-auto">
                              <pre className="text-xs font-mono">
                                {JSON.stringify(templateData.data[0], null, 2)}
                              </pre>
                            </div>
                          </Card>
                        </>
                      ) : (
                        <Card className="glass-card p-6">
                          <p className="text-muted-foreground">No data available for this template.</p>
                        </Card>
                      )}
                    </div>
                  )}
                </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Templates;

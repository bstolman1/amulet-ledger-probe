import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, User, Globe } from "lucide-react";
import { useState } from "react";

const ANS = () => {
  const [searchQuery, setSearchQuery] = useState("");

  // Mock data - will be replaced with real API calls
  const entries = [
    {
      name: "alice",
      party: "alice::122012345678901234567890123456789012345678901234567890123456789012",
      url: "https://alice.example.com",
      description: "Alice's Canton Network entry",
      expiresAt: "2025-12-31T23:59:59Z",
    },
    {
      name: "bob",
      party: "bob::122098765432109876543210987654321098765432109876543210987654321098",
      url: "https://bob.example.com",
      description: "Bob's Canton Network entry",
      expiresAt: "2026-01-15T23:59:59Z",
    },
  ];

  const filteredEntries = entries.filter(
    (entry) =>
      entry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.party.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Amulet Name Service (ANS)</h2>
          <p className="text-muted-foreground">
            Search and browse human-readable names mapped to Canton Network parties
          </p>
        </div>

        {/* Search Bar */}
        <Card className="glass-card p-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or party ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button className="gradient-primary">
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>
        </Card>

        {/* Results */}
        <div className="space-y-4">
          {filteredEntries.length === 0 ? (
            <Card className="glass-card p-8">
              <p className="text-center text-muted-foreground">No entries found</p>
            </Card>
          ) : (
            filteredEntries.map((entry) => (
              <Card key={entry.name} className="glass-card">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="gradient-primary p-3 rounded-lg">
                        <User className="h-6 w-6 text-primary-foreground" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold">{entry.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          Expires: {new Date(entry.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {entry.url && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={entry.url} target="_blank" rel="noopener noreferrer">
                          <Globe className="h-4 w-4 mr-2" />
                          Visit
                        </a>
                      </Button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="p-4 rounded-lg bg-muted/30">
                      <p className="text-sm text-muted-foreground mb-1">Party ID</p>
                      <p className="font-mono text-xs break-all">{entry.party}</p>
                    </div>
                    {entry.description && (
                      <div className="p-4 rounded-lg bg-muted/30">
                        <p className="text-sm text-muted-foreground mb-1">Description</p>
                        <p className="text-sm">{entry.description}</p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ANS;

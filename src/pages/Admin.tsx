import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2 } from "lucide-react";

interface SVVote {
  organization: string;
  email: string;
  contact: string;
  weight: number;
  vote: "yes" | "no" | "abstain" | "";
}

interface CommitteeVote {
  member: string;
  vote: "yes" | "no" | "abstain" | "";
}

const Admin = () => {
  const [cipNumber, setCipNumber] = useState("");
  const [cipTitle, setCipTitle] = useState("");
  const [voteStart, setVoteStart] = useState("");
  const [voteClose, setVoteClose] = useState("");
  
  const [svVotes, setSvVotes] = useState<SVVote[]>([
    { organization: "", email: "", contact: "", weight: 0, vote: "" }
  ]);
  
  const [committeeVotes, setCommitteeVotes] = useState<CommitteeVote[]>([
    { member: "", vote: "" }
  ]);

  const addSvRow = () => {
    setSvVotes([...svVotes, { organization: "", email: "", contact: "", weight: 0, vote: "" }]);
  };

  const removeSvRow = (index: number) => {
    setSvVotes(svVotes.filter((_, i) => i !== index));
  };

  const updateSvVote = (index: number, field: keyof SVVote, value: string | number) => {
    const updated = [...svVotes];
    updated[index] = { ...updated[index], [field]: value };
    setSvVotes(updated);
  };

  const addCommitteeRow = () => {
    setCommitteeVotes([...committeeVotes, { member: "", vote: "" }]);
  };

  const removeCommitteeRow = (index: number) => {
    setCommitteeVotes(committeeVotes.filter((_, i) => i !== index));
  };

  const updateCommitteeVote = (index: number, field: keyof CommitteeVote, value: string) => {
    const updated = [...committeeVotes];
    updated[index] = { ...updated[index], [field]: value };
    setCommitteeVotes(updated);
  };

  const calculateSVResult = () => {
    const totalWeight = svVotes.reduce((sum, v) => sum + (v.weight || 0), 0);
    const yesWeight = svVotes.filter(v => v.vote === "yes").reduce((sum, v) => sum + (v.weight || 0), 0);
    const noWeight = svVotes.filter(v => v.vote === "no").reduce((sum, v) => sum + (v.weight || 0), 0);
    const abstainWeight = svVotes.filter(v => v.vote === "abstain").reduce((sum, v) => sum + (v.weight || 0), 0);
    
    const yesPercentage = totalWeight > 0 ? (yesWeight / totalWeight) * 100 : 0;
    const passed = yesPercentage >= 66.67;
    
    return { totalWeight, yesWeight, noWeight, abstainWeight, yesPercentage, passed };
  };

  const calculateCommitteeResult = () => {
    const totalVotes = committeeVotes.filter(v => v.vote !== "").length;
    const yesVotes = committeeVotes.filter(v => v.vote === "yes").length;
    const noVotes = committeeVotes.filter(v => v.vote === "no").length;
    const abstainVotes = committeeVotes.filter(v => v.vote === "abstain").length;
    
    const yesPercentage = totalVotes > 0 ? (yesVotes / totalVotes) * 100 : 0;
    const passed = yesPercentage >= 66.67;
    
    return { totalVotes, yesVotes, noVotes, abstainVotes, yesPercentage, passed };
  };

  const svResult = calculateSVResult();
  const committeeResult = calculateCommitteeResult();

  return (
    <DashboardLayout>
      <main className="space-y-8">
        <h1 className="text-3xl font-bold">Admin</h1>

        {/* CIP Details */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>CIP Details</CardTitle>
            <CardDescription>Enter the basic information for the CIP vote</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cipNumber">CIP Number</Label>
                <Input
                  id="cipNumber"
                  value={cipNumber}
                  onChange={(e) => setCipNumber(e.target.value)}
                  placeholder="e.g., CIP-0001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cipTitle">CIP Title</Label>
                <Input
                  id="cipTitle"
                  value={cipTitle}
                  onChange={(e) => setCipTitle(e.target.value)}
                  placeholder="Title of the proposal"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="voteStart">Vote Start Date</Label>
                <Input
                  id="voteStart"
                  type="date"
                  value={voteStart}
                  onChange={(e) => setVoteStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="voteClose">Vote Close Date</Label>
                <Input
                  id="voteClose"
                  type="date"
                  value={voteClose}
                  onChange={(e) => setVoteClose(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SV Votes */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Offchain SV Vote</span>
              <span className={`text-sm px-3 py-1 rounded-full ${svResult.passed ? 'bg-success text-success-foreground' : 'bg-destructive text-destructive-foreground'}`}>
                {svResult.yesPercentage.toFixed(1)}% - {svResult.passed ? 'PASSED' : 'FAILED'}
              </span>
            </CardTitle>
            <CardDescription>
              Super Validator votes (requires 2/3 majority by weight)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead className="w-24">Weight</TableHead>
                    <TableHead className="w-32">Vote</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {svVotes.map((vote, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Input
                          value={vote.organization}
                          onChange={(e) => updateSvVote(index, "organization", e.target.value)}
                          placeholder="Organization name"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={vote.email}
                          onChange={(e) => updateSvVote(index, "email", e.target.value)}
                          placeholder="email@example.com"
                          type="email"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={vote.contact}
                          onChange={(e) => updateSvVote(index, "contact", e.target.value)}
                          placeholder="Contact name"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={vote.weight || ""}
                          onChange={(e) => updateSvVote(index, "weight", parseInt(e.target.value) || 0)}
                          placeholder="0"
                          type="number"
                          min="0"
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          value={vote.vote}
                          onChange={(e) => updateSvVote(index, "vote", e.target.value as any)}
                          className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">-</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                          <option value="abstain">Abstain</option>
                        </select>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeSvRow(index)}
                          disabled={svVotes.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button onClick={addSvRow} variant="outline">
              Add SV
            </Button>
            <div className="grid grid-cols-4 gap-4 pt-4 border-t border-border">
              <div>
                <p className="text-sm text-muted-foreground">Total Weight</p>
                <p className="text-2xl font-bold">{svResult.totalWeight}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Yes</p>
                <p className="text-2xl font-bold text-success">{svResult.yesWeight}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">No</p>
                <p className="text-2xl font-bold text-destructive">{svResult.noWeight}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Abstain</p>
                <p className="text-2xl font-bold text-muted-foreground">{svResult.abstainWeight}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Committee Votes */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Offchain Committee Vote</span>
              <span className={`text-sm px-3 py-1 rounded-full ${committeeResult.passed ? 'bg-success text-success-foreground' : 'bg-destructive text-destructive-foreground'}`}>
                {committeeResult.yesPercentage.toFixed(1)}% - {committeeResult.passed ? 'PASSED' : 'FAILED'}
              </span>
            </CardTitle>
            <CardDescription>
              Committee votes (requires 2/3 majority)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Committee Member</TableHead>
                    <TableHead className="w-32">Vote</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {committeeVotes.map((vote, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Input
                          value={vote.member}
                          onChange={(e) => updateCommitteeVote(index, "member", e.target.value)}
                          placeholder="Member name"
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          value={vote.vote}
                          onChange={(e) => updateCommitteeVote(index, "vote", e.target.value as any)}
                          className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">-</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                          <option value="abstain">Abstain</option>
                        </select>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCommitteeRow(index)}
                          disabled={committeeVotes.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button onClick={addCommitteeRow} variant="outline">
              Add Committee Member
            </Button>
            <div className="grid grid-cols-4 gap-4 pt-4 border-t border-border">
              <div>
                <p className="text-sm text-muted-foreground">Total Votes</p>
                <p className="text-2xl font-bold">{committeeResult.totalVotes}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Yes</p>
                <p className="text-2xl font-bold text-success">{committeeResult.yesVotes}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">No</p>
                <p className="text-2xl font-bold text-destructive">{committeeResult.noVotes}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Abstain</p>
                <p className="text-2xl font-bold text-muted-foreground">{committeeResult.abstainVotes}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Featured App Votes (placeholder) */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Featured App Votes</CardTitle>
            <CardDescription>Configure and monitor featured app voting (coming soon)</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">This section will be implemented based on future requirements.</p>
          </CardContent>
        </Card>
      </main>
    </DashboardLayout>
  );
};

export default Admin;

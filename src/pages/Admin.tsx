import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const Admin = () => {
  return (
    <DashboardLayout>
      <main>
        <h1 className="text-3xl font-bold mb-6">Admin</h1>
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Featured App Votes</CardTitle>
              <CardDescription>Configure and monitor featured app voting (coming soon).</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">No data yet. We will wire this after requirements.</p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle>CIP Votes</CardTitle>
              <CardDescription>Manage offchain votes and automate status updates via PRs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-2">Offchain Committee Vote</h2>
                <p className="text-muted-foreground text-sm">Setup and results UI will appear here.</p>
              </div>
              <div>
                <h2 className="text-lg font-semibold mb-2">Offchain SV Vote</h2>
                <p className="text-muted-foreground text-sm">Setup and results UI will appear here.</p>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </DashboardLayout>
  );
};

export default Admin;

import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, BarChart3, Coins, Database, Layers, Zap, Globe, TrendingUp, Package, Vote } from "lucide-react";


interface DashboardLayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: "Dashboard", href: "/", icon: BarChart3 },
  { name: "Supply", href: "/supply", icon: Coins },
  { name: "Transactions", href: "/transactions", icon: Activity },
  { name: "Validators", href: "/validators", icon: Zap },
  { name: "Mining Rounds", href: "/mining-rounds", icon: TrendingUp },
  { name: "Round Stats", href: "/round-stats", icon: Layers },
  { name: "ANS", href: "/ans", icon: Globe },
  { name: "Apps", href: "/apps", icon: Package },
  { name: "Governance", href: "/governance", icon: Vote },
  { name: "Statistics", href: "/stats", icon: Database },
];

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const location = useLocation();

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="glass-card border-b border-border/50 sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          {/* Top row: Logo and Search */}
          <div className="flex items-center justify-between mb-4">
            <Link to="/" className="flex items-center space-x-3 group">
              <div className="relative">
                <div className="absolute inset-0 gradient-primary rounded-lg blur-xl opacity-50 group-hover:opacity-100 transition-smooth" />
                <div className="relative gradient-primary p-2 rounded-lg">
                  <Database className="h-6 w-6 text-primary-foreground" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  SCANTON
                </h1>
                <p className="text-xs text-muted-foreground">Canton Network Explorer</p>
              </div>
            </Link>

            
          </div>

          {/* Bottom row: Navigation tabs with wrapping */}
          <nav className="flex flex-wrap gap-1">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-smooth ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-20">
        <div className="container mx-auto px-6 py-6">
          <p className="text-center text-sm text-muted-foreground">
            SCANTON Explorer • Powered by Canton Network
          </p>
        </div>
      </footer>
    </div>
  );
};

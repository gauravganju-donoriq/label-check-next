"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ComplianceCheck, PRODUCT_TYPE_LABELS } from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  FileCheck,
  Clock,
} from "lucide-react";

export default function DashboardPage() {
  const [recentChecks, setRecentChecks] = useState<ComplianceCheck[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    passed: 0,
    warnings: 0,
    failed: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await fetch("/api/checks");
      if (!res.ok) throw new Error("Failed to fetch checks");

      const checks: ComplianceCheck[] = await res.json();
      setRecentChecks(checks.slice(0, 4));

      // Calculate stats from completed checks
      const completedChecks = checks.filter((c) => c.overall_status);
      setStats({
        total: completedChecks.length,
        passed: completedChecks.filter((c) => c.overall_status === "pass")
          .length,
        warnings: completedChecks.filter((c) => c.overall_status === "warning")
          .length,
        failed: completedChecks.filter((c) => c.overall_status === "fail")
          .length,
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "pass":
        return <CheckCircle2 className="w-5 h-5 text-chart-2" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-chart-4" />;
      case "fail":
        return <XCircle className="w-5 h-5 text-destructive" />;
      default:
        return <Clock className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "pass":
        return (
          <Badge className="bg-chart-2 text-primary-foreground">Passed</Badge>
        );
      case "warning":
        return (
          <Badge className="bg-chart-4 text-primary-foreground">Warnings</Badge>
        );
      case "fail":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">In Progress</Badge>;
    }
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">
          Welcome back
        </h1>
        <p className="text-muted-foreground mt-1">
          Monitor your label compliance checks and start new validations.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Checks</p>
                <p className="text-2xl font-semibold mt-1">{stats.total}</p>
              </div>
              <FileCheck className="w-8 h-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Passed</p>
                <p className="text-2xl font-semibold mt-1 text-chart-2">
                  {stats.passed}
                </p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-chart-2/50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Warnings</p>
                <p className="text-2xl font-semibold mt-1 text-chart-4">
                  {stats.warnings}
                </p>
              </div>
              <AlertTriangle className="w-8 h-8 text-chart-4/50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-2xl font-semibold mt-1 text-destructive">
                  {stats.failed}
                </p>
              </div>
              <XCircle className="w-8 h-8 text-destructive/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/new-check">
                <Upload className="w-4 h-4 mr-2" />
                New Compliance Check
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/history">
                View All History
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Checks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Compliance Checks</CardTitle>
          <CardDescription>Your most recent label validations</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              Loading...
            </div>
          ) : recentChecks.length === 0 ? (
            <div className="py-8 text-center">
              <FileCheck className="w-10 h-10 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground mb-4">
                No compliance checks yet
              </p>
              <Button asChild>
                <Link href="/new-check">Start Your First Check</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {recentChecks.map((check) => (
                <Link
                  key={check.id}
                  href={`/results/${check.id}`}
                  className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {getStatusIcon(check.overall_status)}
                    <div>
                      <p className="font-medium text-sm">
                        {check.product_name ||
                          `${
                            check.rule_set?.product_type
                              ? PRODUCT_TYPE_LABELS[check.rule_set.product_type]
                              : "Unknown"
                          } Product`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {check.rule_set?.state_name || "Unknown State"} •{" "}
                        {new Date(check.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(check.overall_status)}
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


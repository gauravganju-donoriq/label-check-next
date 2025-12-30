"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ComplianceCheck, PRODUCT_TYPE_LABELS } from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowRight,
  Upload,
} from "lucide-react";

export default function HistoryPage() {
  const [checks, setChecks] = useState<ComplianceCheck[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchChecks();
  }, []);

  const fetchChecks = async () => {
    try {
      const res = await fetch("/api/checks");
      if (!res.ok) throw new Error("Failed to fetch checks");
      const data = await res.json();
      setChecks(data);
    } catch (error) {
      console.error("Error fetching checks:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "pass":
        return <CheckCircle2 className="w-4 h-4 text-chart-2" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-chart-4" />;
      case "fail":
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "pass":
        return (
          <Badge className="bg-chart-2 text-primary-foreground">Pass</Badge>
        );
      case "warning":
        return (
          <Badge className="bg-chart-4 text-primary-foreground">Warning</Badge>
        );
      case "fail":
        return <Badge variant="destructive">Fail</Badge>;
      default:
        return <Badge variant="secondary">In Progress</Badge>;
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Compliance History</h1>
          <p className="text-muted-foreground">
            View all your past compliance checks
          </p>
        </div>
        <Button asChild>
          <Link href="/new-check">
            <Upload className="w-4 h-4 mr-2" />
            New Check
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Checks</CardTitle>
          <CardDescription>
            {checks.length} total compliance checks
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              Loading...
            </div>
          ) : checks.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground mb-4">
                No compliance checks yet
              </p>
              <Button asChild>
                <Link href="/new-check">Start Your First Check</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Results</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.map((check) => (
                  <TableRow key={check.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(check.overall_status)}
                        {getStatusBadge(check.overall_status)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {check.product_name ||
                        `${
                          check.rule_set?.product_type
                            ? PRODUCT_TYPE_LABELS[check.rule_set.product_type]
                            : "Unknown"
                        } Product`}
                    </TableCell>
                    <TableCell>
                      {check.rule_set?.state_name || "Unknown"}
                    </TableCell>
                    <TableCell>
                      {new Date(check.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {check.overall_status ? (
                        <span className="text-sm text-muted-foreground">
                          <span className="text-chart-2">
                            {check.pass_count} pass
                          </span>
                          {" / "}
                          <span className="text-chart-4">
                            {check.warning_count} warn
                          </span>
                          {" / "}
                          <span className="text-destructive">
                            {check.fail_count} fail
                          </span>
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Pending
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/results/${check.id}`}>
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ComplianceCheck,
  CheckResult,
  PanelUpload,
  PRODUCT_TYPE_LABELS,
  PANEL_TYPE_LABELS,
  PanelType,
} from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  ShieldAlert,
} from "lucide-react";

interface CheckWithDetails extends Omit<ComplianceCheck, "rule_set"> {
  rule_set: {
    id: string;
    name: string;
    state_name: string | null;
    state_abbreviation: string | null;
    product_type: string;
  };
  panels: PanelUpload[];
  results: (CheckResult & {
    compliance_rule?: {
      id: string;
      name: string;
      description: string;
      category: string;
      severity: string;
      validation_prompt: string;
    };
  })[];
}

// Helper function to get rule name from result (handles both generated and persisted)
function getRuleName(result: CheckWithDetails["results"][0]): string {
  if (result.is_generated_rule && result.generated_rule_name) {
    return result.generated_rule_name;
  }
  return result.compliance_rule?.name || "Unknown Rule";
}

// Helper function to get rule category from result
function getRuleCategory(result: CheckWithDetails["results"][0]): string {
  if (result.is_generated_rule && result.generated_rule_category) {
    return result.generated_rule_category;
  }
  return result.compliance_rule?.category || "Other";
}

// Helper function to get rule description from result
function getRuleDescription(result: CheckWithDetails["results"][0]): string | null {
  if (result.is_generated_rule && result.generated_rule_description) {
    return result.generated_rule_description;
  }
  return result.compliance_rule?.description || null;
}

export default function ResultsPage() {
  const params = useParams();
  const id = params.id as string;

  const [check, setCheck] = useState<CheckWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchResults = useCallback(async () => {
    try {
      const res = await fetch(`/api/checks/${id}`);
      if (!res.ok) throw new Error("Failed to fetch results");
      const data = await res.json();
      setCheck(data);
    } catch (error) {
      console.error("Error fetching results:", error);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchResults();
    }
  }, [id, fetchResults]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pass":
        return <CheckCircle2 className="w-5 h-5 text-chart-2" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-chart-4" />;
      case "fail":
        return <XCircle className="w-5 h-5 text-destructive" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
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
        return null;
    }
  };

  const downloadCSV = () => {
    if (!check || !check.results.length) return;

    const headers = [
      "Rule Name",
      "Category",
      "Status",
      "Found Value",
      "Expected Value",
      "Explanation",
      "Is Generated Rule",
    ];
    const rows = check.results.map((r) => [
      getRuleName(r),
      getRuleCategory(r),
      r.status,
      r.found_value || "",
      r.expected_value || "",
      r.explanation || "",
      r.is_generated_rule ? "Yes" : "No",
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-report-${check.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Check if any results use generated rules
  const hasGeneratedRules = check?.results.some((r) => r.is_generated_rule);

  const groupedResults = check?.results.reduce(
    (acc, result) => {
      const category = getRuleCategory(result);
      if (!acc[category]) acc[category] = [];
      acc[category].push(result);
      return acc;
    },
    {} as Record<string, typeof check.results>
  );

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center">
        <p className="text-muted-foreground">Loading results...</p>
      </div>
    );
  }

  if (!check) {
    return (
      <div className="p-6 lg:p-8 text-center">
        <p className="text-muted-foreground mb-4">Compliance check not found</p>
        <Button asChild>
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Link>
            </Button>
          </div>
          <h1 className="text-2xl font-semibold">
            {check.product_name ||
              `${PRODUCT_TYPE_LABELS[check.rule_set?.product_type as keyof typeof PRODUCT_TYPE_LABELS] || "Unknown"} Product`}
          </h1>
          <p className="text-muted-foreground">
            {check.rule_set?.state_name || "Unknown State"} •{" "}
            {new Date(check.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card
          className={`border-l-4 ${
            check.overall_status === "pass"
              ? "border-l-chart-2"
              : check.overall_status === "warning"
                ? "border-l-chart-4"
                : "border-l-destructive"
          }`}
        >
          <CardContent className="pt-6 text-center">
            <div className="flex justify-center mb-2">
              {getStatusIcon(check.overall_status || "")}
            </div>
            <p className="text-sm text-muted-foreground">Overall Status</p>
            <p className="text-lg font-semibold capitalize">
              {check.overall_status || "Pending"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="w-6 h-6 mx-auto text-chart-2 mb-2" />
            <p className="text-sm text-muted-foreground">Passed</p>
            <p className="text-2xl font-semibold text-chart-2">
              {check.pass_count}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="w-6 h-6 mx-auto text-chart-4 mb-2" />
            <p className="text-sm text-muted-foreground">Warnings</p>
            <p className="text-2xl font-semibold text-chart-4">
              {check.warning_count}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <XCircle className="w-6 h-6 mx-auto text-destructive mb-2" />
            <p className="text-sm text-muted-foreground">Failed</p>
            <p className="text-2xl font-semibold text-destructive">
              {check.fail_count}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Results Tabs */}
      <Tabs defaultValue="checklist" className="space-y-4">
        <TabsList>
          <TabsTrigger value="checklist" className="gap-2">
            <FileText className="w-4 h-4" />
            Compliance Checklist
          </TabsTrigger>
          <TabsTrigger value="panels" className="gap-2">
            <ImageIcon className="w-4 h-4" />
            Uploaded Panels ({check.panels?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="checklist">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Compliance Results by Category
              </CardTitle>
              <CardDescription>
                {hasGeneratedRules ? (
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      AI Generated Rules
                    </Badge>
                    Rules were auto-generated based on {check.rule_set?.state_name || "state"} regulations
                  </span>
                ) : (
                  "Detailed findings for each compliance rule"
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!groupedResults || Object.keys(groupedResults).length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">
                  No compliance results available
                </p>
              ) : (
                <Accordion type="multiple" className="space-y-2">
                  {Object.entries(groupedResults).map(
                    ([category, categoryResults]) => {
                      const passCount = categoryResults.filter(
                        (r) => r.status === "pass"
                      ).length;
                      const warnCount = categoryResults.filter(
                        (r) => r.status === "warning"
                      ).length;
                      const failCount = categoryResults.filter(
                        (r) => r.status === "fail"
                      ).length;

                      return (
                        <AccordionItem
                          key={category}
                          value={category}
                          className="border border-border rounded-lg px-4"
                        >
                          <AccordionTrigger className="hover:no-underline py-4">
                            <div className="flex items-center justify-between w-full pr-4">
                              <span className="font-medium">{category}</span>
                              <div className="flex gap-3 text-xs">
                                {passCount > 0 && (
                                  <span className="text-chart-2">
                                    {passCount} pass
                                  </span>
                                )}
                                {warnCount > 0 && (
                                  <span className="text-chart-4">
                                    {warnCount} warn
                                  </span>
                                )}
                                {failCount > 0 && (
                                  <span className="text-destructive">
                                    {failCount} fail
                                  </span>
                                )}
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pb-4">
                            <div className="space-y-3">
                              {categoryResults.map((result) => {
                                const ruleName = getRuleName(result);
                                const ruleDescription = getRuleDescription(result);
                                
                                return (
                                  <div
                                    key={result.id}
                                    className="p-4 rounded-lg border border-border bg-card"
                                  >
                                    <div className="flex items-start justify-between mb-2">
                                      <div className="flex items-center gap-3">
                                        {getStatusIcon(result.status)}
                                        <div>
                                          <p className="font-medium text-sm">
                                            {ruleName}
                                          </p>
                                          {result.is_generated_rule && (
                                            <span className="text-xs text-muted-foreground">
                                              (Auto-generated rule)
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      {getStatusBadge(result.status)}
                                    </div>

                                    {ruleDescription && (
                                      <p className="text-xs text-muted-foreground mb-2 italic">
                                        {ruleDescription}
                                      </p>
                                    )}

                                    {result.explanation && (
                                      <p className="text-sm text-muted-foreground mb-3">
                                        {result.explanation}
                                      </p>
                                    )}

                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                      {result.found_value && (
                                        <div>
                                          <p className="text-xs text-muted-foreground uppercase mb-1">
                                            Found
                                          </p>
                                          <p className="font-mono text-xs bg-muted px-2 py-1 rounded">
                                            {result.found_value}
                                          </p>
                                        </div>
                                      )}
                                      {result.expected_value && (
                                        <div>
                                          <p className="text-xs text-muted-foreground uppercase mb-1">
                                            Expected
                                          </p>
                                          <p className="font-mono text-xs bg-muted px-2 py-1 rounded">
                                            {result.expected_value}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    }
                  )}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="panels">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Uploaded Panel Images</CardTitle>
              <CardDescription>
                The label panels that were analyzed
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!check.panels || check.panels.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">
                  No panels uploaded
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {check.panels.map((panel) => {
                    const extractedData = panel.extracted_data as Record<string, unknown> | null;
                    const confidence = extractedData?.extractionConfidence as Record<string, number> | undefined;
                    const flaggedForReview = extractedData?.flaggedForReview as boolean | undefined;
                    const reviewReasons = extractedData?.reviewReasons as string[] | undefined;

                    return (
                      <div
                        key={panel.id}
                        className="border border-border rounded-lg p-4"
                      >
                        <p className="font-medium text-sm mb-2">
                          {PANEL_TYPE_LABELS[panel.panel_type as PanelType]}
                        </p>
                        <p className="text-xs text-muted-foreground mb-3 truncate">
                          {panel.file_name}
                        </p>

                        {confidence && (
                          <div className="mb-3">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-muted-foreground">
                                Extraction Confidence
                              </span>
                              <span className="font-medium">
                                {((confidence.overall || 0.9) * 100).toFixed(0)}%
                              </span>
                            </div>
                            <Progress
                              value={(confidence.overall || 0.9) * 100}
                              className="h-1.5"
                            />
                          </div>
                        )}

                        {flaggedForReview && (
                          <div className="mb-3 p-2 bg-chart-4/10 border border-chart-4/20 rounded-md">
                            <div className="flex items-center gap-2 text-xs text-chart-4">
                              <ShieldAlert className="w-3 h-3" />
                              <span className="font-medium">
                                Flagged for Review
                              </span>
                            </div>
                            {reviewReasons && (
                              <ul className="mt-1 text-xs text-muted-foreground list-disc list-inside">
                                {reviewReasons.map((reason, i) => (
                                  <li key={i}>{reason}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}

                        {extractedData && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                              View extracted data
                            </summary>
                            <pre className="mt-2 p-2 bg-muted rounded overflow-auto max-h-48 text-xs">
                              {JSON.stringify(extractedData, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}


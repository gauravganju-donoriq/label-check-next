"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  RuleSet,
  PanelType,
  PRODUCT_TYPE_LABELS,
  PANEL_TYPE_LABELS,
} from "@/types";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  X,
  FileImage,
  Loader2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";

interface UploadedPanel {
  id: string;
  panelType: PanelType;
  file: File;
  preview: string;
}

type Step = "select" | "upload" | "analyze" | "complete";

export default function NewCheckPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("select");
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [selectedRuleSetId, setSelectedRuleSetId] = useState<string>("");
  const [productName, setProductName] = useState("");
  const [panels, setPanels] = useState<UploadedPanel[]>([]);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStatus, setAnalysisStatus] = useState("");
  const [complianceCheckId, setComplianceCheckId] = useState<string | null>(
    null
  );
  const [isLoadingRuleSets, setIsLoadingRuleSets] = useState(true);

  const fetchRuleSets = useCallback(async () => {
    try {
      const res = await fetch("/api/rules");
      if (!res.ok) throw new Error("Failed to fetch rule sets");
      const data = await res.json();
      setRuleSets(data);
    } catch (error) {
      console.error("Error fetching rule sets:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load rule sets",
      });
    } finally {
      setIsLoadingRuleSets(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRuleSets();
  }, [fetchRuleSets]);

  const handleFileUpload = useCallback(
    (files: FileList | null, panelType: PanelType) => {
      if (!files || files.length === 0) return;

      const file = files[0];
      if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
        toast({
          variant: "destructive",
          title: "Invalid file type",
          description: "Please upload an image (JPG, PNG) or PDF file.",
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const newPanel: UploadedPanel = {
          id: crypto.randomUUID(),
          panelType,
          file,
          preview: reader.result as string,
        };

        setPanels((prev) => {
          const filtered = prev.filter((p) => p.panelType !== panelType);
          return [...filtered, newPanel];
        });
      };
      reader.readAsDataURL(file);
    },
    [toast]
  );

  const removePanel = (id: string) => {
    setPanels((prev) => prev.filter((p) => p.id !== id));
  };

  const canProceedToUpload = selectedRuleSetId;
  const canProceedToAnalyze = panels.length > 0;

  const runAnalysis = async () => {
    if (!selectedRuleSetId) return;

    setStep("analyze");
    setAnalysisProgress(0);

    // Track checkId outside try-catch so we can clean up on failure
    let checkId: string | null = null;

    try {
      // Create compliance check record
      setAnalysisStatus("Creating compliance check...");
      const createRes = await fetch("/api/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleSetId: selectedRuleSetId,
          productName: productName || null,
        }),
      });

      if (!createRes.ok) throw new Error("Failed to create compliance check");

      const checkData = await createRes.json();
      checkId = checkData.id;
      setComplianceCheckId(checkId);
      setAnalysisProgress(10);

      // Upload panels using streaming (streams directly through server to Azure)
      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i];
        setAnalysisStatus(`Uploading ${PANEL_TYPE_LABELS[panel.panelType]}...`);

        // Stream file directly to server, which streams to Azure
        const uploadRes = await fetch("/api/upload/stream", {
          method: "POST",
          headers: {
            "Content-Type": panel.file.type,
            "x-file-name": panel.file.name,
            "x-panel-type": panel.panelType,
            "x-check-id": checkId!, // checkId is guaranteed to exist at this point
          },
          body: panel.file, // File is streamed, not buffered
        });

        if (!uploadRes.ok) {
          const errorData = await uploadRes.json();
          throw new Error(errorData.error || "Failed to upload panel");
        }

        setAnalysisProgress(10 + ((i + 1) / panels.length) * 30);
      }

      // Run AI analysis - server fetches images from Azure
      setAnalysisStatus("Running AI analysis...");
      setAnalysisProgress(50);

      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkId }),
      });

      if (!analyzeRes.ok) {
        const errorData = await analyzeRes.json();
        throw new Error(errorData.error || "Analysis failed");
      }

      setAnalysisProgress(100);
      setAnalysisStatus("Analysis complete!");
      setStep("complete");

      toast({
        title: "Analysis Complete",
        description: "Your label compliance check has been completed.",
      });
    } catch (error) {
      console.error("Analysis error:", error);
      toast({
        variant: "destructive",
        title: "Analysis Failed",
        description:
          error instanceof Error
            ? error.message
            : "An error occurred during analysis. Please try again.",
      });

      // Clean up: delete the compliance check if it was created
      if (checkId) {
        try {
          await fetch(`/api/checks/${checkId}`, {
            method: "DELETE",
          });
        } catch (deleteError) {
          console.error("Failed to clean up compliance check:", deleteError);
        }
      }

      // Reset state
      setComplianceCheckId(null);
      setStep("upload");
    }
  };

  const selectedRuleSet = ruleSets.find((rs) => rs.id === selectedRuleSetId);

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          {["Select", "Upload", "Analyze", "Complete"].map((label, index) => {
            const stepKeys: Step[] = ["select", "upload", "analyze", "complete"];
            const isActive = stepKeys.indexOf(step) >= index;

            return (
              <div key={label} className="flex items-center">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {index + 1}
                </div>
                <span
                  className={`ml-2 text-sm font-medium hidden sm:inline ${
                    isActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
                {index < 3 && (
                  <div
                    className={`w-8 md:w-12 h-px mx-2 md:mx-4 ${
                      isActive ? "bg-primary" : "bg-border"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 1: Select Rule Set */}
      {step === "select" && (
        <Card>
          <CardHeader>
            <CardTitle>Select Rule Set</CardTitle>
            <CardDescription>
              Choose a rule set to validate your product label against
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoadingRuleSets ? (
              <div className="py-8 text-center text-muted-foreground">
                Loading rule sets...
              </div>
            ) : ruleSets.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-muted-foreground mb-4">
                  No rule sets found. Create one first.
                </p>
                <Button onClick={() => router.push("/rules")}>
                  Go to Rules
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ruleSet">Rule Set *</Label>
                  <Select
                    value={selectedRuleSetId}
                    onValueChange={setSelectedRuleSetId}
                  >
                    <SelectTrigger id="ruleSet">
                      <SelectValue placeholder="Select a rule set" />
                    </SelectTrigger>
                    <SelectContent>
                      {ruleSets.map((rs) => (
                        <SelectItem key={rs.id} value={rs.id}>
                          {rs.name} ({rs.state_abbreviation} -{" "}
                          {PRODUCT_TYPE_LABELS[rs.product_type]})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedRuleSet && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm font-medium">
                      {selectedRuleSet.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedRuleSet.state_name} •{" "}
                      {PRODUCT_TYPE_LABELS[selectedRuleSet.product_type]} •{" "}
                      {selectedRuleSet.rules_count || 0} rules
                    </p>
                    {selectedRuleSet.description && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {selectedRuleSet.description}
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="productName">Product Name (Optional)</Label>
                  <Input
                    id="productName"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Enter product name for identification"
                  />
                </div>

                <div className="flex justify-end pt-4">
                  <Button
                    onClick={() => setStep("upload")}
                    disabled={!canProceedToUpload}
                  >
                    Continue to Upload
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Upload Panels */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Label Panels</CardTitle>
            <CardDescription>
              Upload images of each panel of your product label/packaging
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(
                Object.entries(PANEL_TYPE_LABELS) as [PanelType, string][]
              ).map(([type, label]) => {
                const existingPanel = panels.find((p) => p.panelType === type);

                return (
                  <div
                    key={type}
                    className="relative border border-dashed border-border rounded-lg p-4 text-center min-h-[180px] flex flex-col items-center justify-center hover:border-muted-foreground/50 transition-colors"
                  >
                    {existingPanel ? (
                      <>
                        <button
                          onClick={() => removePanel(existingPanel.id)}
                          className="absolute top-2 right-2 p-1.5 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={existingPanel.preview}
                          alt={label}
                          className="max-h-32 object-contain mb-2"
                        />
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-full">
                          {existingPanel.file.name}
                        </p>
                      </>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center gap-2">
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(e) =>
                            handleFileUpload(e.target.files, type)
                          }
                        />
                        <FileImage className="w-8 h-8 text-muted-foreground" />
                        <span className="text-sm font-medium">{label}</span>
                        <span className="text-xs text-muted-foreground">
                          Click to upload
                        </span>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep("select")}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button onClick={runAnalysis} disabled={!canProceedToAnalyze}>
                <Upload className="w-4 h-4 mr-2" />
                Run Analysis
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Analysis in Progress */}
      {step === "analyze" && (
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Analyzing Your Labels</CardTitle>
            <CardDescription>
              Our AI is extracting and validating compliance data
            </CardDescription>
          </CardHeader>
          <CardContent className="py-8">
            <div className="max-w-md mx-auto space-y-6">
              <div className="flex justify-center">
                <Loader2 className="w-16 h-16 animate-spin text-primary" />
              </div>
              <Progress value={analysisProgress} className="h-3" />
              <p className="text-center text-sm font-medium">
                {analysisStatus}
              </p>
              <p className="text-center text-xs text-muted-foreground">
                {analysisProgress}% complete
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Complete */}
      {step === "complete" && (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-14 h-14 bg-chart-2 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-7 h-7 text-primary-foreground" />
            </div>
            <CardTitle>Analysis Complete!</CardTitle>
            <CardDescription>
              Your compliance check has been completed successfully
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center gap-4 pt-4">
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Back to Dashboard
            </Button>
            <Button onClick={() => router.push(`/results/${complianceCheckId}`)}>
              View Results
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


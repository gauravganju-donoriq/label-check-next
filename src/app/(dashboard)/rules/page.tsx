"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Search,
  Trash2,
  Edit2,
  ClipboardList,
  Package,
  Sparkles,
  Loader2,
  ExternalLink,
} from "lucide-react";
import {
  RuleSet,
  ComplianceRule,
  ProductType,
  PRODUCT_TYPE_LABELS,
  RULE_CATEGORIES,
  LEGAL_CANNABIS_STATES,
} from "@/types";

type RuleTypeFilter = "all" | "custom" | "generated";

export default function RulesPage() {
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [selectedRuleSet, setSelectedRuleSet] = useState<RuleSet | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [ruleTypeFilter, setRuleTypeFilter] = useState<RuleTypeFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRules, setIsLoadingRules] = useState(false);

  // Modal states
  const [isCreateSetModalOpen, setIsCreateSetModalOpen] = useState(false);
  const [isAddRuleModalOpen, setIsAddRuleModalOpen] = useState(false);
  const [isEditSetModalOpen, setIsEditSetModalOpen] = useState(false);
  const [editingRuleSet, setEditingRuleSet] = useState<RuleSet | null>(null);
  const [isEditRuleModalOpen, setIsEditRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ComplianceRule | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Form states for create rule set
  const [newSetName, setNewSetName] = useState("");
  const [newSetDescription, setNewSetDescription] = useState("");
  const [newSetStateId, setNewSetStateId] = useState("");
  const [newSetProductType, setNewSetProductType] = useState<ProductType | "">(
    ""
  );

  // Form states for add rule
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleCategory, setNewRuleCategory] = useState("");
  const [newRuleValidationPrompt, setNewRuleValidationPrompt] = useState("");

  const fetchRuleSets = useCallback(async () => {
    try {
      const res = await fetch("/api/rules");
      if (!res.ok) throw new Error("Failed to fetch rule sets");
      const data = await res.json();
      setRuleSets(data);
    } catch (error) {
      console.error("Error fetching rule sets:", error);
      toast.error("Failed to fetch rule sets");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchRules = useCallback(async (ruleSetId: string) => {
    setIsLoadingRules(true);
    try {
      const res = await fetch(`/api/rules/${ruleSetId}/rules`);
      if (!res.ok) throw new Error("Failed to fetch rules");
      const data = await res.json();
      setRules(data);
    } catch (error) {
      console.error("Error fetching rules:", error);
      toast.error("Failed to fetch rules");
    } finally {
      setIsLoadingRules(false);
    }
  }, []);

  useEffect(() => {
    fetchRuleSets();
  }, [fetchRuleSets]);

  useEffect(() => {
    if (selectedRuleSet) {
      fetchRules(selectedRuleSet.id);
    }
  }, [selectedRuleSet, fetchRules]);

  // Filtered data based on search
  const filteredRuleSets = useMemo(() => {
    if (!searchQuery) return ruleSets;
    const query = searchQuery.toLowerCase();
    return ruleSets.filter(
      (rs) =>
        rs.name.toLowerCase().includes(query) ||
        rs.state_name?.toLowerCase().includes(query)
    );
  }, [ruleSets, searchQuery]);

  const filteredRules = useMemo(() => {
    let filtered = rules;

    // Apply type filter
    if (ruleTypeFilter === "custom") {
      filtered = filtered.filter((r) => !r.generation_status);
    } else if (ruleTypeFilter === "generated") {
      filtered = filtered.filter((r) => !!r.generation_status);
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          r.category.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [rules, searchQuery, ruleTypeFilter]);

  // Form reset helpers
  const resetCreateSetForm = () => {
    setNewSetName("");
    setNewSetDescription("");
    setNewSetStateId("");
    setNewSetProductType("");
  };

  const resetAddRuleForm = () => {
    setNewRuleName("");
    setNewRuleCategory("");
    setNewRuleValidationPrompt("");
  };

  // Handlers
  const handleCreateRuleSet = async () => {
    if (!newSetName || !newSetStateId || !newSetProductType) {
      toast.error("Please fill in all required fields");
      return;
    }
    const selectedState = LEGAL_CANNABIS_STATES.find(
      (s) => s.id === newSetStateId
    );
    if (!selectedState) return;

    setIsSaving(true);
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSetName,
          description: newSetDescription,
          stateName: selectedState.name,
          stateAbbreviation: selectedState.abbreviation,
          productType: newSetProductType,
        }),
      });

      if (!res.ok) throw new Error("Failed to create rule set");

      await fetchRuleSets();
      setIsCreateSetModalOpen(false);
      resetCreateSetForm();
      toast.success("Rule set created successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create rule set");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditRuleSet = async () => {
    if (!editingRuleSet) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/rules/${editingRuleSet.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingRuleSet.name,
          description: editingRuleSet.description,
          stateName: editingRuleSet.state_name,
          stateAbbreviation: editingRuleSet.state_abbreviation,
          productType: editingRuleSet.product_type,
        }),
      });

      if (!res.ok) throw new Error("Failed to update rule set");

      await fetchRuleSets();
      setIsEditSetModalOpen(false);
      setEditingRuleSet(null);
      toast.success("Rule set updated successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update rule set");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddRule = async () => {
    if (
      !newRuleName ||
      !newRuleCategory ||
      !newRuleValidationPrompt ||
      !selectedRuleSet
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/rules/${selectedRuleSet.id}/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRuleName,
          category: newRuleCategory,
          validationPrompt: newRuleValidationPrompt,
        }),
      });

      if (!res.ok) throw new Error("Failed to create rule");

      await fetchRules(selectedRuleSet.id);
      await fetchRuleSets();
      setIsAddRuleModalOpen(false);
      resetAddRuleForm();
      toast.success("Rule created successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create rule");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditRule = async () => {
    if (!editingRule || !selectedRuleSet) return;

    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/rules/${selectedRuleSet.id}/rules/${editingRule.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editingRule.name,
            category: editingRule.category,
            validationPrompt: editingRule.validation_prompt,
          }),
        }
      );

      if (!res.ok) throw new Error("Failed to update rule");

      await fetchRules(selectedRuleSet.id);
      setIsEditRuleModalOpen(false);
      setEditingRule(null);
      toast.success("Rule updated successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update rule");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRuleSet = async (ruleSet: RuleSet) => {
    if (
      !window.confirm(
        `Are you sure you want to delete "${ruleSet.name}"? This will also delete all rules in this set.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/rules/${ruleSet.id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete rule set");

      await fetchRuleSets();
      toast.success("Rule set deleted successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete rule set");
    }
  };

  const handleDeleteRule = async (rule: ComplianceRule) => {
    if (!selectedRuleSet) return;

    if (!window.confirm(`Are you sure you want to delete "${rule.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(
        `/api/rules/${selectedRuleSet.id}/rules/${rule.id}`,
        {
          method: "DELETE",
        }
      );

      if (!res.ok) throw new Error("Failed to delete rule");

      await fetchRules(selectedRuleSet.id);
      await fetchRuleSets();
      toast.success("Rule deleted successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete rule");
    }
  };

  const openEditSetModal = (ruleSet: RuleSet) => {
    setEditingRuleSet({ ...ruleSet });
    setIsEditSetModalOpen(true);
  };

  const openEditRuleModal = (rule: ComplianceRule) => {
    setEditingRule({ ...rule });
    setIsEditRuleModalOpen(true);
  };

  const handleGenerateRules = async () => {
    if (!selectedRuleSet) return;

    setIsGenerating(true);
    try {
      const res = await fetch(`/api/rules/${selectedRuleSet.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to generate rules");
      }

      const data = await res.json();

      // Refresh rules list
      await fetchRules(selectedRuleSet.id);
      await fetchRuleSets();

      // Show summary toast
      const parts = [];
      if (data.added > 0) parts.push(`${data.added} added`);
      if (data.updated > 0) parts.push(`${data.updated} updated`);
      if (data.skipped > 0) parts.push(`${data.skipped} unchanged`);

      toast.success(`Rules generated: ${parts.join(", ")}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to generate rules"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {selectedRuleSet && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setSelectedRuleSet(null);
                setSearchQuery("");
                setRuleTypeFilter("all");
              }}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold">
              {selectedRuleSet ? selectedRuleSet.name : "Packaging Rule Sets"}
            </h1>
            {selectedRuleSet && (
              <p className="text-muted-foreground text-sm">
                {selectedRuleSet.state_name} •{" "}
                {PRODUCT_TYPE_LABELS[selectedRuleSet.product_type]}
              </p>
            )}
          </div>
        </div>
        {selectedRuleSet ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleGenerateRules}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {isGenerating ? "Generating..." : "Generate Rules"}
            </Button>
            <Button onClick={() => setIsAddRuleModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add New Rule
            </Button>
          </div>
        ) : (
          <Button onClick={() => setIsCreateSetModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create New Rule Set
          </Button>
        )}
      </div>

      {/* Search and Filter */}
      <div className="mb-6 flex gap-4 items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={
              selectedRuleSet ? "Search rules..." : "Search rule sets..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {selectedRuleSet && (
          <Select
            value={ruleTypeFilter}
            onValueChange={(v) => setRuleTypeFilter(v as RuleTypeFilter)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rules</SelectItem>
              <SelectItem value="custom">Custom Only</SelectItem>
              <SelectItem value="generated">AI Generated</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              {selectedRuleSet ? (
                <>
                  <TableHead>Rule Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Validation Prompt</TableHead>
                  <TableHead>Citation</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </>
              ) : (
                <>
                  <TableHead>Name</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Product Type</TableHead>
                  <TableHead>Rules Count</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {selectedRuleSet ? (
              isLoadingRules ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center py-8 text-muted-foreground"
                  >
                    Loading rules...
                  </TableCell>
                </TableRow>
              ) : filteredRules.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center py-8 text-muted-foreground"
                  >
                    <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No rules yet. Add your first rule to get started.</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium max-w-sm">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">{rule.name}</div>
                        <div className="shrink-0">
                          {rule.generation_status ? (
                            <Badge
                              className={`text-xs capitalize ${
                                rule.generation_status === "new"
                                  ? "bg-green-500 hover:bg-green-600 text-white"
                                  : rule.generation_status === "updated"
                                  ? "bg-red-500 hover:bg-red-600 text-white"
                                  : "bg-yellow-500 hover:bg-yellow-600 text-white"
                              }`}
                            >
                              {rule.generation_status}
                            </Badge>
                          ) : (
                            <Badge className="text-xs bg-blue-500 hover:bg-blue-600 text-white">
                              Custom
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="whitespace-nowrap">{rule.category}</Badge>
                    </TableCell>
                    <TableCell className="max-w-md truncate">
                      {rule.validation_prompt}
                    </TableCell>
                    <TableCell className="text-center">
                      {rule.source_citation ? (
                        <a
                          href={rule.source_citation}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex text-blue-500 hover:text-blue-600"
                          title="View source"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditRuleModal(rule)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteRule(rule)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )
            ) : isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-8 text-muted-foreground"
                >
                  Loading rule sets...
                </TableCell>
              </TableRow>
            ) : filteredRuleSets.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-8 text-muted-foreground"
                >
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>
                    No rule sets yet. Create your first rule set to get
                    started.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filteredRuleSets.map((ruleSet) => (
                <TableRow
                  key={ruleSet.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => {
                    setSelectedRuleSet(ruleSet);
                    setSearchQuery("");
                    setRuleTypeFilter("all");
                  }}
                >
                  <TableCell className="font-medium">{ruleSet.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {ruleSet.state_abbreviation}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {PRODUCT_TYPE_LABELS[ruleSet.product_type]}
                  </TableCell>
                  <TableCell>{ruleSet.rules_count || 0}</TableCell>
                  <TableCell>
                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditSetModal(ruleSet)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteRuleSet(ruleSet)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create Rule Set Modal */}
      <Dialog open={isCreateSetModalOpen} onOpenChange={setIsCreateSetModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Rule Set</DialogTitle>
            <DialogDescription>
              Create a new rule set for a specific state and product type.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="state">State *</Label>
              <Select value={newSetStateId} onValueChange={setNewSetStateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a state" />
                </SelectTrigger>
                <SelectContent>
                  {LEGAL_CANNABIS_STATES.map((state) => (
                    <SelectItem key={state.id} value={state.id}>
                      {state.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="productType">Product Type *</Label>
              <Select
                value={newSetProductType}
                onValueChange={(v) => setNewSetProductType(v as ProductType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a product type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Montana Flower Rules 2024"
                value={newSetName}
                onChange={(e) => setNewSetName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Optional description..."
                value={newSetDescription}
                onChange={(e) => setNewSetDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateSetModalOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateRuleSet} disabled={isSaving}>
              {isSaving ? "Creating..." : "Create Rule Set"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Rule Set Modal */}
      <Dialog open={isEditSetModalOpen} onOpenChange={setIsEditSetModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Rule Set</DialogTitle>
            <DialogDescription>Update the rule set details.</DialogDescription>
          </DialogHeader>
          {editingRuleSet && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-state">State *</Label>
                <Select
                  value={
                    LEGAL_CANNABIS_STATES.find(
                      (s) => s.name === editingRuleSet.state_name
                    )?.id || ""
                  }
                  onValueChange={(v) => {
                    const selectedState = LEGAL_CANNABIS_STATES.find(
                      (s) => s.id === v
                    );
                    if (selectedState) {
                      setEditingRuleSet({
                        ...editingRuleSet,
                        state_name: selectedState.name,
                        state_abbreviation: selectedState.abbreviation,
                      });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a state" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEGAL_CANNABIS_STATES.map((state) => (
                      <SelectItem key={state.id} value={state.id}>
                        {state.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-productType">Product Type *</Label>
                <Select
                  value={editingRuleSet.product_type}
                  onValueChange={(v) =>
                    setEditingRuleSet({
                      ...editingRuleSet,
                      product_type: v as ProductType,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a product type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRODUCT_TYPE_LABELS).map(
                      ([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name *</Label>
                <Input
                  id="edit-name"
                  value={editingRuleSet.name}
                  onChange={(e) =>
                    setEditingRuleSet({
                      ...editingRuleSet,
                      name: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Input
                  id="edit-description"
                  value={editingRuleSet.description || ""}
                  onChange={(e) =>
                    setEditingRuleSet({
                      ...editingRuleSet,
                      description: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditSetModalOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleEditRuleSet} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Rule Modal */}
      <Dialog open={isAddRuleModalOpen} onOpenChange={setIsAddRuleModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Rule</DialogTitle>
            <DialogDescription>
              Add a new compliance rule to &quot;{selectedRuleSet?.name}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ruleName">Rule Name *</Label>
              <Input
                id="ruleName"
                placeholder="e.g., THC Content Display"
                value={newRuleName}
                onChange={(e) => setNewRuleName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ruleCategory">Category *</Label>
              <Select value={newRuleCategory} onValueChange={setNewRuleCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {RULE_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="validationPrompt">Validation Prompt *</Label>
              <Input
                id="validationPrompt"
                placeholder="What the rule expects (e.g., THC percentage must be displayed)"
                value={newRuleValidationPrompt}
                onChange={(e) => setNewRuleValidationPrompt(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddRuleModalOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleAddRule} disabled={isSaving}>
              {isSaving ? "Adding..." : "Add Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Rule Modal */}
      <Dialog open={isEditRuleModalOpen} onOpenChange={setIsEditRuleModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Rule</DialogTitle>
            <DialogDescription>Update the rule details.</DialogDescription>
          </DialogHeader>
          {editingRule && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-ruleName">Rule Name *</Label>
                <Input
                  id="edit-ruleName"
                  value={editingRule.name}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-ruleCategory">Category *</Label>
                <Select
                  value={editingRule.category}
                  onValueChange={(v) =>
                    setEditingRule({ ...editingRule, category: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {RULE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-validationPrompt">
                  Validation Prompt *
                </Label>
                <Input
                  id="edit-validationPrompt"
                  value={editingRule.validation_prompt}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      validation_prompt: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditRuleModalOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleEditRule} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


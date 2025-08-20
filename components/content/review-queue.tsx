'use client';

// Review Queue Component
// Sprint 10: Content Pipeline - Content moderation interface

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { 
  CheckCircle,
  XCircle,
  Eye,
  AlertCircle,
  Filter,
  RefreshCw,
  FileText,
  TrendingUp,
  Shield,
  Sparkles,
  Clock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { ContentStatus, ContentType, AgentType } from '@prisma/client';
import { format, formatDistanceToNow } from 'date-fns';

interface ContentItem {
  id: string;
  title: string;
  type: ContentType;
  status: ContentStatus;
  agentType?: AgentType;
  reviewData?: {
    aiReview?: {
      score: number;
      feedback: string;
      suggestions: string[];
    };
    qualityScore?: number;
    safetyCheck?: {
      safe: boolean;
      flags: Array<{
        type: string;
        severity: string;
        description: string;
      }>;
    };
  };
  createdAt: string;
}

interface ReviewQueueProps {
  leagueId: string;
}

export function ReviewQueue({ leagueId }: ReviewQueueProps) {
  const [content, setContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<ContentStatus>(ContentStatus.NEEDS_REVIEW);
  const [filterType, setFilterType] = useState<ContentType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewContent, setPreviewContent] = useState<ContentItem | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [bulkAction, setBulkAction] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    fetchContent();
  }, [leagueId, filterStatus, filterType]);

  const fetchContent = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        leagueId,
        status: filterStatus,
        ...(filterType !== 'all' && { type: filterType }),
      });

      const response = await fetch(`/api/content/review?${params}`);
      if (response.ok) {
        const data = await response.json();
        setContent(data.content || []);
      }
    } catch (error) {
      console.error('Failed to fetch review queue:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (contentId: string) => {
    try {
      const response = await fetch('/api/content/review', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId,
          action: 'approve',
        }),
      });

      if (response.ok) {
        await fetchContent();
        setSelectedItems(new Set());
      }
    } catch (error) {
      console.error('Failed to approve content:', error);
    }
  };

  const handleReject = async (contentId: string, reason: string) => {
    try {
      const response = await fetch('/api/content/review', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId,
          action: 'reject',
          reason,
        }),
      });

      if (response.ok) {
        await fetchContent();
        setSelectedItems(new Set());
        setShowRejectDialog(false);
        setRejectReason('');
      }
    } catch (error) {
      console.error('Failed to reject content:', error);
    }
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedItems.size === 0) return;

    try {
      const response = await fetch('/api/content/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: bulkAction,
          contentIds: Array.from(selectedItems),
          ...(bulkAction === 'reject' && { options: { reason: rejectReason } }),
        }),
      });

      if (response.ok) {
        await fetchContent();
        setSelectedItems(new Set());
        setBulkAction(null);
        setShowRejectDialog(false);
        setRejectReason('');
      }
    } catch (error) {
      console.error('Failed to perform bulk action:', error);
    }
  };

  const toggleRowExpansion = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const toggleItemSelection = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  const toggleAllSelection = () => {
    if (selectedItems.size === content.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(content.map(c => c.id)));
    }
  };

  const getStatusColor = (status: ContentStatus) => {
    const colors: Record<ContentStatus, string> = {
      DRAFT: 'bg-gray-500',
      IN_REVIEW: 'bg-yellow-500',
      NEEDS_REVIEW: 'bg-orange-500',
      APPROVED: 'bg-green-500',
      PUBLISHED: 'bg-blue-500',
      REJECTED: 'bg-red-500',
      ARCHIVED: 'bg-gray-400',
    };
    return colors[status] || 'bg-gray-500';
  };

  const getQualityColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const filteredContent = content.filter(item => {
    if (searchQuery) {
      return item.title.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Review Queue</CardTitle>
              <CardDescription>
                Review and moderate AI-generated content
              </CardDescription>
            </div>
            <Button onClick={fetchContent} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Search by title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="w-[180px]">
              <Label htmlFor="status">Status</Label>
              <Select
                value={filterStatus}
                onValueChange={(value) => setFilterStatus(value as ContentStatus)}
              >
                <SelectTrigger id="status" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(ContentStatus).map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-[180px]">
              <Label htmlFor="type">Type</Label>
              <Select
                value={filterType}
                onValueChange={(value) => setFilterType(value as ContentType | 'all')}
              >
                <SelectTrigger id="type" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.values(ContentType).map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedItems.size > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {selectedItems.size} item(s) selected
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setBulkAction('reject');
                    setShowRejectDialog(true);
                  }}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject Selected
                </Button>
                <Button
                  onClick={() => {
                    setBulkAction('approve');
                    handleBulkAction();
                  }}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve Selected
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content Table */}
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={selectedItems.size === content.length && content.length > 0}
                    onCheckedChange={toggleAllSelection}
                  />
                </TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Quality</TableHead>
                <TableHead>Safety</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContent.map((item) => (
                <React.Fragment key={item.id}>
                  <TableRow>
                    <TableCell>
                      <Checkbox
                        checked={selectedItems.has(item.id)}
                        onCheckedChange={() => toggleItemSelection(item.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{item.title}</div>
                        <div className="flex items-center space-x-2 text-xs">
                          <Badge variant="outline">
                            {item.type.replace(/_/g, ' ')}
                          </Badge>
                          {item.agentType && (
                            <Badge variant="secondary">
                              <Sparkles className="mr-1 h-3 w-3" />
                              {item.agentType}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleRowExpansion(item.id)}
                        className="mt-1"
                      >
                        {expandedRows.has(item.id) ? (
                          <>
                            <ChevronUp className="mr-1 h-3 w-3" />
                            Hide Details
                          </>
                        ) : (
                          <>
                            <ChevronDown className="mr-1 h-3 w-3" />
                            Show Details
                          </>
                        )}
                      </Button>
                    </TableCell>
                    <TableCell>
                      {item.reviewData?.qualityScore !== undefined ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <div className="flex items-center space-x-1">
                                <TrendingUp className={`h-4 w-4 ${getQualityColor(item.reviewData.qualityScore)}`} />
                                <span className={`font-medium ${getQualityColor(item.reviewData.qualityScore)}`}>
                                  {(item.reviewData.qualityScore * 100).toFixed(0)}%
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Quality Score</p>
                              {item.reviewData.aiReview && (
                                <p className="text-xs">AI: {(item.reviewData.aiReview.score * 100).toFixed(0)}%</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.reviewData?.safetyCheck ? (
                        item.reviewData.safetyCheck.safe ? (
                          <Badge variant="outline" className="text-green-600">
                            <Shield className="mr-1 h-3 w-3" />
                            Safe
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-red-600">
                            <AlertCircle className="mr-1 h-3 w-3" />
                            {item.reviewData.safetyCheck.flags.length} issues
                          </Badge>
                        )
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(item.status)}>
                        {item.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPreviewContent(item);
                            setShowPreviewDialog(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleApprove(item.id)}
                        >
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedItems(new Set([item.id]));
                            setBulkAction('reject');
                            setShowRejectDialog(true);
                          }}
                        >
                          <XCircle className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedRows.has(item.id) && item.reviewData && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-muted/50">
                        <div className="p-4 space-y-3">
                          {item.reviewData.aiReview && (
                            <div>
                              <h4 className="font-semibold text-sm mb-1">AI Review</h4>
                              <p className="text-sm text-muted-foreground">
                                {item.reviewData.aiReview.feedback}
                              </p>
                              {item.reviewData.aiReview.suggestions.length > 0 && (
                                <ul className="list-disc list-inside mt-2 text-sm text-muted-foreground">
                                  {item.reviewData.aiReview.suggestions.map((s, i) => (
                                    <li key={i}>{s}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                          {item.reviewData.safetyCheck && item.reviewData.safetyCheck.flags.length > 0 && (
                            <div>
                              <h4 className="font-semibold text-sm mb-1">Safety Flags</h4>
                              <div className="space-y-1">
                                {item.reviewData.safetyCheck.flags.map((flag, i) => (
                                  <div key={i} className="text-sm">
                                    <Badge variant="outline" className="mr-2">
                                      {flag.severity}
                                    </Badge>
                                    {flag.description}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
              {filteredContent.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No content to review
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Content</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting {selectedItems.size > 1 ? `${selectedItems.size} items` : 'this content'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowRejectDialog(false);
              setRejectReason('');
              setBulkAction(null);
            }}>
              Cancel
            </Button>
            <Button onClick={handleBulkAction} disabled={!rejectReason}>
              Reject {selectedItems.size > 1 ? 'All' : 'Content'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewContent?.title}</DialogTitle>
            <DialogDescription>
              Content preview - {previewContent?.type.replace(/_/g, ' ')}
            </DialogDescription>
          </DialogHeader>
          {/* Content preview would go here */}
          <DialogFooter>
            <Button onClick={() => setShowPreviewDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
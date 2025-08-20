'use client';

// Content Editor Component
// Sprint 10: Content Pipeline - Rich text editing with markdown

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Save, 
  Eye, 
  Edit3, 
  CheckCircle, 
  XCircle,
  AlertCircle,
  FileText,
  Sparkles,
  Clock
} from 'lucide-react';
import { ContentStatus } from '@prisma/client';
import { format } from 'date-fns';

interface ContentData {
  id: string;
  title: string;
  content: string;
  excerpt?: string;
  type: string;
  status: ContentStatus;
  agentType?: string;
  reviewData?: any;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

interface ContentEditorProps {
  contentId?: string;
  initialContent?: ContentData;
  onSave?: (content: Partial<ContentData>) => Promise<void>;
  onApprove?: (contentId: string) => Promise<void>;
  onReject?: (contentId: string, reason: string) => Promise<void>;
  readOnly?: boolean;
}

export function ContentEditor({
  contentId,
  initialContent,
  onSave,
  onApprove,
  onReject,
  readOnly = false,
}: ContentEditorProps) {
  const [content, setContent] = useState<ContentData | null>(initialContent || null);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedContent, setEditedContent] = useState('');
  const [editedExcerpt, setEditedExcerpt] = useState('');
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Load content if contentId provided
  useEffect(() => {
    if (contentId && !initialContent) {
      fetchContent();
    }
  }, [contentId]);

  // Initialize form when content loads
  useEffect(() => {
    if (content) {
      setEditedTitle(content.title);
      setEditedContent(content.content);
      setEditedExcerpt(content.excerpt || '');
    }
  }, [content]);

  const fetchContent = async () => {
    if (!contentId) return;
    
    try {
      setLoading(true);
      const response = await fetch(`/api/content/${contentId}`);
      if (response.ok) {
        const data = await response.json();
        setContent(data);
      }
    } catch (error) {
      console.error('Failed to fetch content:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!onSave) return;

    try {
      setSaving(true);
      await onSave({
        title: editedTitle,
        content: editedContent,
        excerpt: editedExcerpt,
      });
      
      // Refresh content
      if (contentId) {
        await fetchContent();
      }
    } catch (error) {
      console.error('Failed to save content:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!onApprove || !contentId) return;

    try {
      setSaving(true);
      await onApprove(contentId);
      await fetchContent();
    } catch (error) {
      console.error('Failed to approve content:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!onReject || !contentId) return;

    try {
      setSaving(true);
      await onReject(contentId, rejectReason);
      setShowRejectDialog(false);
      setRejectReason('');
      await fetchContent();
    } catch (error) {
      console.error('Failed to reject content:', error);
    } finally {
      setSaving(false);
    }
  };

  const renderMarkdown = (text: string): string => {
    // Simple markdown to HTML conversion
    let html = text;
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
    
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em class="italic">$1</em>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary underline">$1</a>');
    
    // Lists
    html = html.replace(/^\* (.+)$/gim, '<li class="ml-4">• $1</li>');
    html = html.replace(/^\d+\. (.+)$/gim, '<li class="ml-4">$1</li>');
    
    // Paragraphs
    html = html.split('\n\n').map(p => `<p class="mb-4">${p}</p>`).join('');
    
    return html;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!content && !initialContent && contentId) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Content not found</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Content Editor</CardTitle>
              <CardDescription>
                {content ? `Editing: ${content.type.replace(/_/g, ' ')}` : 'Create new content'}
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              {content && (
                <>
                  <Badge className={getStatusColor(content.status)}>
                    {content.status}
                  </Badge>
                  {content.agentType && (
                    <Badge variant="outline">
                      <Sparkles className="mr-1 h-3 w-3" />
                      {content.agentType}
                    </Badge>
                  )}
                </>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Editor */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                placeholder="Enter content title..."
                disabled={readOnly}
              />
            </div>

            {/* Excerpt */}
            <div className="space-y-2">
              <Label htmlFor="excerpt">Excerpt (optional)</Label>
              <Textarea
                id="excerpt"
                value={editedExcerpt}
                onChange={(e) => setEditedExcerpt(e.target.value)}
                placeholder="Brief description of the content..."
                rows={2}
                disabled={readOnly}
              />
            </div>

            {/* Content Editor */}
            <div className="space-y-2">
              <Label>Content</Label>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'edit' | 'preview')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="edit">
                    <Edit3 className="mr-2 h-4 w-4" />
                    Edit
                  </TabsTrigger>
                  <TabsTrigger value="preview">
                    <Eye className="mr-2 h-4 w-4" />
                    Preview
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="edit">
                  <Textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    placeholder="Write your content in markdown..."
                    rows={20}
                    disabled={readOnly}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Supports markdown: # Headers, **bold**, *italic*, [links](url), lists
                  </p>
                </TabsContent>

                <TabsContent value="preview">
                  <div 
                    className="min-h-[400px] p-4 border rounded-md bg-background"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(editedContent) }}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Review Data */}
      {content?.reviewData && (
        <Card>
          <CardHeader>
            <CardTitle>Review Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {content.reviewData.aiReview && (
                <div>
                  <span className="font-semibold">AI Score:</span>{' '}
                  {(content.reviewData.aiReview.score * 100).toFixed(0)}%
                </div>
              )}
              {content.reviewData.qualityScore !== undefined && (
                <div>
                  <span className="font-semibold">Quality Score:</span>{' '}
                  {(content.reviewData.qualityScore * 100).toFixed(0)}%
                </div>
              )}
              {content.reviewData.suggestions && content.reviewData.suggestions.length > 0 && (
                <div>
                  <span className="font-semibold">Suggestions:</span>
                  <ul className="list-disc list-inside mt-1">
                    {content.reviewData.suggestions.map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {!readOnly && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between">
              <div className="flex space-x-2">
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  Save Draft
                </Button>
              </div>

              {content?.status === 'NEEDS_REVIEW' && (
                <div className="flex space-x-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowRejectDialog(true)}
                    disabled={saving}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                  <Button 
                    onClick={handleApprove}
                    disabled={saving}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      {content && (
        <div className="text-sm text-muted-foreground flex items-center space-x-4">
          <span className="flex items-center">
            <Clock className="mr-1 h-3 w-3" />
            Created: {format(new Date(content.createdAt), 'MMM d, yyyy h:mm a')}
          </span>
          {content.updatedAt !== content.createdAt && (
            <span>Updated: {format(new Date(content.updatedAt), 'MMM d, yyyy h:mm a')}</span>
          )}
          {content.publishedAt && (
            <span>Published: {format(new Date(content.publishedAt), 'MMM d, yyyy h:mm a')}</span>
          )}
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Content</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this content.
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
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleReject} disabled={!rejectReason || saving}>
              Reject Content
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
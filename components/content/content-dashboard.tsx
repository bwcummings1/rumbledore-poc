'use client';

// Content Dashboard Component
// Sprint 10: Content Pipeline

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart3, 
  FileText, 
  Clock, 
  CheckCircle, 
  XCircle,
  Eye,
  TrendingUp,
  Calendar,
  Sparkles
} from 'lucide-react';
import { ContentType, ContentStatus, AgentType } from '@prisma/client';
import { format } from 'date-fns';

interface ContentMetrics {
  totalGenerated: number;
  totalPublished: number;
  totalViews: number;
  avgQualityScore: number;
  avgGenerationTime: number;
  approvalRate: number;
  byType: Record<ContentType, number>;
  byAgent: Record<AgentType, number>;
  recentContent: ContentSummary[];
}

interface ContentSummary {
  id: string;
  title: string;
  type: ContentType;
  status: ContentStatus;
  agentType: AgentType;
  createdAt: Date;
  publishedAt?: Date;
  viewCount?: number;
  qualityScore?: number;
}

interface ContentDashboardProps {
  leagueId: string;
}

export function ContentDashboard({ leagueId }: ContentDashboardProps) {
  const [metrics, setMetrics] = useState<ContentMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchMetrics();
  }, [leagueId]);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/content/metrics?leagueId=${leagueId}`);
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
      }
    } catch (error) {
      console.error('Failed to fetch content metrics:', error);
    } finally {
      setLoading(false);
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

  const getAgentIcon = (agentType: AgentType) => {
    // Return appropriate icon based on agent type
    return <Sparkles className="h-4 w-4" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No content metrics available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metrics Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Generated</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalGenerated}</div>
            <p className="text-xs text-muted-foreground">
              Content pieces created
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Published</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalPublished}</div>
            <p className="text-xs text-muted-foreground">
              Live on the platform
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Views</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalViews.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Across all content
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(metrics.approvalRate * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Auto-approved content
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="recent">Recent Content</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Content by Type */}
          <Card>
            <CardHeader>
              <CardTitle>Content by Type</CardTitle>
              <CardDescription>Distribution of generated content</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(metrics.byType).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">{type.replace(/_/g, ' ')}</Badge>
                    </div>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Content by Agent */}
          <Card>
            <CardHeader>
              <CardTitle>Content by Agent</CardTitle>
              <CardDescription>Which AI agents are creating content</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(metrics.byAgent).map(([agent, count]) => (
                  <div key={agent} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {getAgentIcon(agent as AgentType)}
                      <span className="text-sm">{agent}</span>
                    </div>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recent" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Content</CardTitle>
              <CardDescription>Latest generated content pieces</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {metrics.recentContent.map((content) => (
                  <div
                    key={content.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="space-y-1">
                      <h4 className="font-semibold">{content.title}</h4>
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <Badge variant="secondary">{content.type.replace(/_/g, ' ')}</Badge>
                        <span>•</span>
                        <span>{content.agentType}</span>
                        <span>•</span>
                        <span>{format(new Date(content.createdAt), 'MMM d, h:mm a')}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={getStatusColor(content.status)}>
                        {content.status}
                      </Badge>
                      {content.viewCount !== undefined && (
                        <div className="flex items-center space-x-1 text-sm">
                          <Eye className="h-3 w-3" />
                          <span>{content.viewCount}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Avg Quality Score</span>
                  <span className="font-semibold">
                    {(metrics.avgQualityScore * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Avg Generation Time</span>
                  <span className="font-semibold">
                    {(metrics.avgGenerationTime / 1000).toFixed(1)}s
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Views per Post</span>
                  <span className="font-semibold">
                    {metrics.totalPublished > 0 
                      ? Math.round(metrics.totalViews / metrics.totalPublished)
                      : 0}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full" variant="outline">
                  <FileText className="mr-2 h-4 w-4" />
                  Generate New Content
                </Button>
                <Button className="w-full" variant="outline">
                  <Clock className="mr-2 h-4 w-4" />
                  View Schedules
                </Button>
                <Button className="w-full" variant="outline">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Export Analytics
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
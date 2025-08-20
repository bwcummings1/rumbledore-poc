'use client';

// Schedule Manager Component
// Sprint 10: Content Pipeline - Visual schedule configuration

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { 
  Calendar,
  Clock,
  Play,
  Pause,
  Trash2,
  Edit,
  Plus,
  RefreshCw,
  Sparkles,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { ContentType, AgentType } from '@prisma/client';
import { format, formatDistanceToNow } from 'date-fns';

interface Schedule {
  id: string;
  name: string;
  description?: string;
  type: ContentType;
  agentType: AgentType;
  cronExpression: string;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  templateId?: string;
  template?: {
    id: string;
    name: string;
  };
  _count?: {
    generatedContent: number;
  };
}

interface ScheduleManagerProps {
  leagueId: string;
}

// Common cron expressions
const CRON_PRESETS = [
  { label: 'Every day at 9 AM', value: '0 9 * * *' },
  { label: 'Every Monday at 9 AM', value: '0 9 * * 1' },
  { label: 'Every Tuesday at 9 AM', value: '0 9 * * 2' },
  { label: 'Every Wednesday at 10 AM', value: '0 10 * * 3' },
  { label: 'Every Friday at 2 PM', value: '0 14 * * 5' },
  { label: 'Every Sunday at 6 PM', value: '0 18 * * 0' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Custom', value: 'custom' },
];

export function ScheduleManager({ leagueId }: ScheduleManagerProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: ContentType.WEEKLY_RECAP,
    agentType: AgentType.COMMISSIONER,
    cronExpression: '0 9 * * 1',
    enabled: true,
  });
  const [cronPreset, setCronPreset] = useState('0 9 * * 1');
  const [customCron, setCustomCron] = useState('');

  useEffect(() => {
    fetchSchedules();
  }, [leagueId]);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/content/schedules?leagueId=${leagueId}`);
      if (response.ok) {
        const data = await response.json();
        setSchedules(data.schedules || []);
      }
    } catch (error) {
      console.error('Failed to fetch schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const response = await fetch('/api/content/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leagueId,
          ...formData,
          cronExpression: cronPreset === 'custom' ? customCron : cronPreset,
        }),
      });

      if (response.ok) {
        await fetchSchedules();
        setShowCreateDialog(false);
        resetForm();
      }
    } catch (error) {
      console.error('Failed to create schedule:', error);
    }
  };

  const handleUpdate = async () => {
    if (!selectedSchedule) return;

    try {
      const response = await fetch(`/api/content/schedules/${selectedSchedule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          cronExpression: cronPreset === 'custom' ? customCron : cronPreset,
        }),
      });

      if (response.ok) {
        await fetchSchedules();
        setShowEditDialog(false);
        setSelectedSchedule(null);
        resetForm();
      }
    } catch (error) {
      console.error('Failed to update schedule:', error);
    }
  };

  const handleToggle = async (scheduleId: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/content/schedules/${scheduleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });

      if (response.ok) {
        await fetchSchedules();
      }
    } catch (error) {
      console.error('Failed to toggle schedule:', error);
    }
  };

  const handleTrigger = async (scheduleId: string) => {
    try {
      const response = await fetch(`/api/content/schedules/${scheduleId}/trigger`, {
        method: 'POST',
      });

      if (response.ok) {
        // Show success message
        await fetchSchedules();
      }
    } catch (error) {
      console.error('Failed to trigger schedule:', error);
    }
  };

  const handleDelete = async (scheduleId: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    try {
      const response = await fetch(`/api/content/schedules/${scheduleId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchSchedules();
      }
    } catch (error) {
      console.error('Failed to delete schedule:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      type: ContentType.WEEKLY_RECAP,
      agentType: AgentType.COMMISSIONER,
      cronExpression: '0 9 * * 1',
      enabled: true,
    });
    setCronPreset('0 9 * * 1');
    setCustomCron('');
  };

  const openEditDialog = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setFormData({
      name: schedule.name,
      description: schedule.description || '',
      type: schedule.type,
      agentType: schedule.agentType,
      cronExpression: schedule.cronExpression,
      enabled: schedule.enabled,
    });
    
    const preset = CRON_PRESETS.find(p => p.value === schedule.cronExpression);
    if (preset) {
      setCronPreset(schedule.cronExpression);
    } else {
      setCronPreset('custom');
      setCustomCron(schedule.cronExpression);
    }
    
    setShowEditDialog(true);
  };

  const getAgentIcon = (agentType: AgentType) => {
    return <Sparkles className="h-4 w-4" />;
  };

  const getNextRunDescription = (nextRunAt?: string) => {
    if (!nextRunAt) return 'Not scheduled';
    const next = new Date(nextRunAt);
    if (next < new Date()) return 'Overdue';
    return formatDistanceToNow(next, { addSuffix: true });
  };

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
              <CardTitle>Content Schedules</CardTitle>
              <CardDescription>
                Manage automated content generation schedules
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Schedule
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Schedules Table */}
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Next Run</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell>
                    <Switch
                      checked={schedule.enabled}
                      onCheckedChange={(checked) => handleToggle(schedule.id, checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{schedule.name}</div>
                      {schedule.description && (
                        <div className="text-xs text-muted-foreground">
                          {schedule.description}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {schedule.type.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-1">
                      {getAgentIcon(schedule.agentType)}
                      <span className="text-sm">{schedule.agentType}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      {schedule.cronExpression}
                    </code>
                  </TableCell>
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <div className="flex items-center space-x-1">
                            <Clock className="h-3 w-3" />
                            <span className="text-sm">
                              {getNextRunDescription(schedule.nextRunAt)}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {schedule.nextRunAt && (
                            <p>{format(new Date(schedule.nextRunAt), 'PPpp')}</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {schedule._count?.generatedContent || 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTrigger(schedule.id)}
                        disabled={!schedule.enabled}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(schedule)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(schedule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {schedules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No schedules configured. Create one to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog || showEditDialog} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setShowEditDialog(false);
          setSelectedSchedule(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {showEditDialog ? 'Edit Schedule' : 'Create Schedule'}
            </DialogTitle>
            <DialogDescription>
              Configure automated content generation
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Weekly Recap"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Content Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value as ContentType })}
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(ContentType).map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent">AI Agent</Label>
                <Select
                  value={formData.agentType}
                  onValueChange={(value) => setFormData({ ...formData, agentType: value as AgentType })}
                >
                  <SelectTrigger id="agent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(AgentType).map((agent) => (
                      <SelectItem key={agent} value={agent}>
                        {agent}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cron">Schedule</Label>
              <Select
                value={cronPreset}
                onValueChange={setCronPreset}
              >
                <SelectTrigger id="cron">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRON_PRESETS.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {cronPreset === 'custom' && (
                <Input
                  value={customCron}
                  onChange={(e) => setCustomCron(e.target.value)}
                  placeholder="0 9 * * 1"
                  className="mt-2 font-mono text-sm"
                />
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
              />
              <Label htmlFor="enabled">Enable schedule immediately</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowCreateDialog(false);
              setShowEditDialog(false);
              setSelectedSchedule(null);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button onClick={showEditDialog ? handleUpdate : handleCreate}>
              {showEditDialog ? 'Update' : 'Create'} Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
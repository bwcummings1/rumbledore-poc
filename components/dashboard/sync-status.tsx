'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import { wsClient } from '@/lib/websocket/client';
import { formatDistanceToNow } from 'date-fns';

interface SyncStatusProps {
  leagueId: string;
  userId: string;
}

export function SyncStatus({ leagueId, userId }: SyncStatusProps) {
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Connect to WebSocket and join league room
    const cleanup = wsClient.onMount(userId, leagueId, {
      onSyncStatus: (data) => {
        switch (data.status) {
          case 'started':
            setSyncInProgress(true);
            setSyncProgress(0);
            setError(null);
            break;
          case 'progress':
            setSyncInProgress(true);
            setSyncProgress(data.progress || 0);
            break;
          case 'completed':
            setSyncInProgress(false);
            setSyncProgress(100);
            setError(null);
            fetchSyncStatus();
            break;
          case 'failed':
            setSyncInProgress(false);
            setSyncProgress(0);
            setError('Sync failed. Please try again.');
            break;
        }
      },
      onError: (error) => {
        console.error('WebSocket error:', error);
      },
    });

    // Fetch initial sync status
    fetchSyncStatus();

    return cleanup;
  }, [leagueId, userId]);

  const fetchSyncStatus = async () => {
    try {
      const response = await fetch(`/api/sync/${leagueId}`);
      if (response.ok) {
        const data = await response.json();
        setSyncInProgress(data.syncInProgress);
        setSyncProgress(data.progress || 0);
        if (data.lastSyncAt) {
          setLastSyncAt(new Date(data.lastSyncAt));
        }
      }
    } catch (err) {
      console.error('Failed to fetch sync status:', err);
    }
  };

  const triggerSync = async (fullSync = false) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/sync/${leagueId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fullSync }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start sync');
      }

      setSyncInProgress(true);
      setSyncProgress(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start sync');
    } finally {
      setLoading(false);
    }
  };

  const cancelSync = async () => {
    setLoading(true);

    try {
      const response = await fetch(`/api/sync/${leagueId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSyncInProgress(false);
        setSyncProgress(0);
      }
    } catch (err) {
      console.error('Failed to cancel sync:', err);
    } finally {
      setLoading(false);
    }
  };

  const getSyncStatusIcon = () => {
    if (syncInProgress) {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }
    if (error) {
      return <XCircle className="h-4 w-4 text-destructive" />;
    }
    if (lastSyncAt) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  };

  const getSyncStatusBadge = () => {
    if (syncInProgress) {
      return <Badge variant="default">Syncing</Badge>;
    }
    if (error) {
      return <Badge variant="destructive">Failed</Badge>;
    }
    if (lastSyncAt) {
      const hoursSinceSync = (Date.now() - lastSyncAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceSync < 1) {
        return <Badge variant="default">Up to date</Badge>;
      }
      if (hoursSinceSync < 24) {
        return <Badge variant="secondary">Recent</Badge>;
      }
      return <Badge variant="outline">Stale</Badge>;
    }
    return <Badge variant="outline">Never synced</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Data Sync</CardTitle>
            {getSyncStatusIcon()}
          </div>
          {getSyncStatusBadge()}
        </div>
        <CardDescription>
          {lastSyncAt
            ? `Last synced ${formatDistanceToNow(lastSyncAt, { addSuffix: true })}`
            : 'No sync history'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {syncInProgress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Sync Progress</span>
              <span className="text-muted-foreground">{Math.round(syncProgress)}%</span>
            </div>
            <Progress value={syncProgress} className="h-2" />
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          {!syncInProgress ? (
            <>
              <Button
                onClick={() => triggerSync(false)}
                disabled={loading}
                size="sm"
                className="flex-1"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Quick Sync
              </Button>
              <Button
                onClick={() => triggerSync(true)}
                disabled={loading}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                Full Sync
              </Button>
            </>
          ) : (
            <Button
              onClick={cancelSync}
              disabled={loading}
              variant="destructive"
              size="sm"
              className="w-full"
            >
              Cancel Sync
            </Button>
          )}
        </div>

        {lastSyncAt && !syncInProgress && (
          <div className="pt-2 border-t">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Last sync:</span>
              </div>
              <div className="text-right">
                {lastSyncAt.toLocaleTimeString()}
              </div>
              <div>
                <span className="text-muted-foreground">Next auto-sync:</span>
              </div>
              <div className="text-right flex items-center justify-end gap-1">
                <Clock className="h-3 w-3" />
                <span>In 4 hours</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SyncStatus;
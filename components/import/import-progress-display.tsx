'use client';

import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Pause, 
  Play, 
  X,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { WebSocketClient } from '@/lib/websocket/client';

interface ImportProgressDisplayProps {
  leagueId: string;
  importId?: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

interface ImportStatus {
  importId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED';
  percentage: number;
  processedItems: number;
  totalItems: number;
  currentSeason?: number;
  estimatedTimeRemaining?: number;
  checkpoints?: SeasonCheckpoint[];
  errors?: ImportError[];
}

interface SeasonCheckpoint {
  season: number;
  status: 'pending' | 'fetching' | 'processing' | 'completed' | 'failed';
  matchupsImported: number;
  playersImported: number;
  transactionsImported: number;
  error?: string;
}

interface ImportError {
  season: number;
  error: string;
  timestamp: string;
}

export function ImportProgressDisplay({ 
  leagueId, 
  importId,
  onComplete,
  onError 
}: ImportProgressDisplayProps) {
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    // Fetch initial status
    fetchStatus();

    // Set up WebSocket connection for real-time updates
    const wsClient = WebSocketClient.getInstance();
    
    const cleanup = wsClient.onMount('user-id', leagueId, {
      onConnect: () => setWsConnected(true),
      onDisconnect: () => setWsConnected(false),
      onImportProgress: (data: any) => {
        if (!importId || data.importId === importId) {
          setStatus(prev => ({
            ...prev!,
            ...data,
          }));
        }
      },
      onImportCompleted: (data: any) => {
        if (!importId || data.importId === importId) {
          setStatus(prev => ({
            ...prev!,
            status: 'COMPLETED',
            percentage: 100,
          }));
          onComplete?.();
        }
      },
      onImportFailed: (data: any) => {
        if (!importId || data.importId === importId) {
          setStatus(prev => ({
            ...prev!,
            status: 'FAILED',
            errors: [...(prev?.errors || []), {
              season: prev?.currentSeason || 0,
              error: data.error,
              timestamp: new Date().toISOString(),
            }],
          }));
          onError?.(data.error);
        }
      },
    });

    return cleanup;
  }, [leagueId, importId, onComplete, onError]);

  const fetchStatus = async () => {
    try {
      const params = importId ? `?importId=${importId}` : '';
      const response = await fetch(`/api/import/${leagueId}${params}`);
      
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch import status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    try {
      const params = importId ? `?importId=${importId}` : '';
      const response = await fetch(`/api/import/${leagueId}${params}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setStatus(prev => prev ? { ...prev, status: 'PAUSED' } : null);
      }
    } catch (error) {
      console.error('Failed to cancel import:', error);
    }
  };

  const handleResume = async () => {
    try {
      const response = await fetch(`/api/import/${leagueId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'resume',
          importId: status?.importId,
        }),
      });
      
      if (response.ok) {
        setStatus(prev => prev ? { ...prev, status: 'RUNNING' } : null);
        fetchStatus();
      }
    } catch (error) {
      console.error('Failed to resume import:', error);
    }
  };

  const getStatusIcon = () => {
    if (!status) return null;
    
    switch (status.status) {
      case 'COMPLETED':
        return <CheckCircle className="text-green-500 h-5 w-5" />;
      case 'FAILED':
        return <XCircle className="text-red-500 h-5 w-5" />;
      case 'PAUSED':
        return <Pause className="text-yellow-500 h-5 w-5" />;
      case 'RUNNING':
        return <Loader2 className="text-blue-500 h-5 w-5 animate-spin" />;
      default:
        return <Clock className="text-gray-500 h-5 w-5" />;
    }
  };

  const getStatusBadge = () => {
    if (!status) return null;
    
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      COMPLETED: 'default',
      FAILED: 'destructive',
      PAUSED: 'secondary',
      RUNNING: 'default',
      PENDING: 'outline',
    };
    
    return (
      <Badge variant={variants[status.status] || 'outline'}>
        {status.status}
      </Badge>
    );
  };

  const formatTime = (ms?: number) => {
    if (!ms) return 'N/A';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading import status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">
            No import data available
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <CardTitle>Historical Import Progress</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            {!wsConnected && (
              <Badge variant="outline" className="text-orange-500">
                <AlertCircle className="h-3 w-3 mr-1" />
                Offline
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Progress */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Overall Progress</span>
            <span className="font-semibold">{status.percentage}%</span>
          </div>
          <Progress value={status.percentage} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{status.processedItems} / {status.totalItems} seasons</span>
            {status.estimatedTimeRemaining && status.status === 'RUNNING' && (
              <span>~{formatTime(status.estimatedTimeRemaining)} remaining</span>
            )}
          </div>
        </div>
        
        {/* Current Season */}
        {status.currentSeason && status.status === 'RUNNING' && (
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-sm font-medium">
              Currently importing: Season {status.currentSeason}
            </p>
          </div>
        )}
        
        {/* Season Checkpoints */}
        {status.checkpoints && status.checkpoints.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Season Progress:</p>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {status.checkpoints.map((checkpoint) => (
                <div 
                  key={checkpoint.season} 
                  className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-muted/50"
                >
                  <div className={`w-2 h-2 rounded-full ${
                    checkpoint.status === 'completed' ? 'bg-green-500' :
                    checkpoint.status === 'failed' ? 'bg-red-500' :
                    checkpoint.status === 'processing' || checkpoint.status === 'fetching' ? 'bg-blue-500 animate-pulse' :
                    'bg-gray-300'
                  }`} />
                  <span className="font-medium">Season {checkpoint.season}</span>
                  {checkpoint.status === 'completed' && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      {checkpoint.matchupsImported} matches, {checkpoint.playersImported} players
                    </span>
                  )}
                  {checkpoint.error && (
                    <span className="text-xs text-red-500 ml-auto">
                      {checkpoint.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Errors */}
        {status.errors && status.errors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <p className="font-semibold mb-1">Import Errors:</p>
              <ul className="text-sm list-disc list-inside">
                {status.errors.slice(-3).map((error, index) => (
                  <li key={index}>
                    Season {error.season}: {error.error}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        
        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          {status.status === 'RUNNING' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              className="flex items-center gap-1"
            >
              <X className="h-4 w-4" />
              Cancel Import
            </Button>
          )}
          
          {status.status === 'PAUSED' && (
            <Button
              variant="default"
              size="sm"
              onClick={handleResume}
              className="flex items-center gap-1"
            >
              <Play className="h-4 w-4" />
              Resume Import
            </Button>
          )}
          
          {status.status === 'COMPLETED' && (
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStatus}
              className="flex items-center gap-1"
            >
              Refresh Status
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
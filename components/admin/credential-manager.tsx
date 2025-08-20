'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Shield, RefreshCw, AlertTriangle, CheckCircle, Clock, ExternalLink } from 'lucide-react';

interface CredentialStatus {
  hasCredentials: boolean;
  isExpired: boolean;
  isValid: boolean;
  lastValidated?: string;
  createdAt?: string;
  expiresAt?: string;
  league?: {
    name: string;
    espnLeagueId: string;
    season: number;
    lastSyncAt?: string;
  };
}

interface CredentialManagerProps {
  leagueId: string;
  onCredentialsUpdated?: () => void;
}

export function CredentialManager({ leagueId, onCredentialsUpdated }: CredentialManagerProps) {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
  }, [leagueId]);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/espn/cookies?leagueId=${leagueId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch credential status');
      }
      
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch credential status:', error);
      setError('Unable to load credential status');
    } finally {
      setLoading(false);
    }
  };

  const validateCredentials = async () => {
    setValidating(true);
    setError(null);
    
    try {
      const response = await fetch('/api/espn/cookies/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId })
      });
      
      if (!response.ok) {
        throw new Error('Validation failed');
      }
      
      const result = await response.json();
      
      if (result.valid) {
        // Refresh status after successful validation
        await fetchStatus();
        if (onCredentialsUpdated) {
          onCredentialsUpdated();
        }
      } else {
        setError(result.message || 'Credentials are invalid');
      }
    } catch (error) {
      console.error('Validation failed:', error);
      setError('Failed to validate credentials');
    } finally {
      setValidating(false);
    }
  };

  const deleteCredentials = async () => {
    if (!confirm('Are you sure you want to delete the stored ESPN credentials?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/espn/cookies?leagueId=${leagueId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete credentials');
      }
      
      // Refresh status
      await fetchStatus();
      if (onCredentialsUpdated) {
        onCredentialsUpdated();
      }
    } catch (error) {
      console.error('Failed to delete credentials:', error);
      setError('Failed to delete credentials');
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const getTimeAgo = (dateString?: string) => {
    if (!dateString) return null;
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else {
      return 'Recently';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center space-x-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Loading credential status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <CardTitle>ESPN Credentials</CardTitle>
          </div>
          {status?.league && (
            <Badge variant="outline">
              League ID: {status.league.espnLeagueId}
            </Badge>
          )}
        </div>
        <CardDescription>
          Manage ESPN Fantasy authentication for data synchronization
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {error && (
          <Alert className="border-red-500">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {status?.hasCredentials ? (
          <>
            {/* Status Alert */}
            <Alert className={
              status.isExpired ? 'border-orange-500' : 
              status.isValid ? 'border-green-500' : 
              'border-yellow-500'
            }>
              <AlertDescription className="flex items-center gap-2">
                {status.isExpired ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <span>Credentials have expired. Please update them using the browser extension.</span>
                  </>
                ) : status.isValid ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Credentials are active and working</span>
                  </>
                ) : (
                  <>
                    <Clock className="h-4 w-4 text-yellow-500" />
                    <span>Credentials need validation</span>
                  </>
                )}
              </AlertDescription>
            </Alert>

            {/* Credential Details */}
            <div className="space-y-2 text-sm">
              {status.league && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">League:</span>
                  <span className="font-medium">{status.league.name}</span>
                </div>
              )}
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created:</span>
                <span className="font-medium">
                  {formatDate(status.createdAt)}
                  {status.createdAt && (
                    <span className="text-muted-foreground ml-1">
                      ({getTimeAgo(status.createdAt)})
                    </span>
                  )}
                </span>
              </div>
              
              {status.lastValidated && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Validated:</span>
                  <span className="font-medium">
                    {formatDate(status.lastValidated)}
                    <span className="text-muted-foreground ml-1">
                      ({getTimeAgo(status.lastValidated)})
                    </span>
                  </span>
                </div>
              )}
              
              {status.expiresAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expires:</span>
                  <span className="font-medium">{formatDate(status.expiresAt)}</span>
                </div>
              )}
              
              {status.league?.lastSyncAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Sync:</span>
                  <span className="font-medium">
                    {getTimeAgo(status.league.lastSyncAt)}
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                onClick={validateCredentials}
                disabled={validating}
                variant="outline"
                size="sm"
              >
                {validating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Validate
                  </>
                )}
              </Button>
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.open('https://fantasy.espn.com', '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open ESPN
              </Button>
              
              <Button
                onClick={deleteCredentials}
                variant="destructive"
                size="sm"
              >
                Delete Credentials
              </Button>
            </div>
          </>
        ) : (
          <>
            <Alert>
              <AlertDescription>
                No ESPN credentials found for this league. Install the browser extension and capture cookies from ESPN Fantasy.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Setup Instructions:</h4>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Install the Rumbledore browser extension</li>
                <li>Log in to ESPN Fantasy</li>
                <li>Click the extension icon and capture your cookies</li>
                <li>Enter this league ID when prompted: <code className="bg-muted px-1 py-0.5 rounded">{leagueId}</code></li>
                <li>Send the cookies to Rumbledore</li>
              </ol>
              
              <Button 
                onClick={() => window.open('https://fantasy.espn.com', '_blank')}
                className="w-full"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Go to ESPN Fantasy
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
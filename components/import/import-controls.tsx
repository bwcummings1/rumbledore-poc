'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Upload, 
  RefreshCw, 
  AlertCircle,
  CheckCircle,
  Loader2,
  Calendar,
  Database,
  Zap
} from 'lucide-react';

interface ImportControlsProps {
  leagueId: string;
  onImportStarted?: (importId: string) => void;
  onSyncComplete?: () => void;
}

export function ImportControls({ 
  leagueId,
  onImportStarted,
  onSyncComplete 
}: ImportControlsProps) {
  const currentYear = new Date().getFullYear();
  const [startYear, setStartYear] = useState(currentYear - 5);
  const [endYear, setEndYear] = useState(currentYear - 1);
  const [validateAfterImport, setValidateAfterImport] = useState(true);
  const [optimizeStorage, setOptimizeStorage] = useState(false);
  const [skipExistingSeasons, setSkipExistingSeasons] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [syncRequirements, setSyncRequirements] = useState<any>(null);

  // Generate year options (last 15 years)
  const yearOptions = Array.from({ length: 15 }, (_, i) => currentYear - i);

  const handleHistoricalImport = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/import/${leagueId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startYear,
          endYear,
          options: {
            validateAfterImport,
            optimizeStorage,
            skipExistingSeasons,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start import');
      }

      setSuccess(`Import started successfully! Import ID: ${data.importId}`);
      onImportStarted?.(data.importId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleIncrementalSync = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/import/${leagueId}?mode=incremental`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          forceRefresh: false,
          maxSeasons: 10,
          includeCurrentSeason: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start sync');
      }

      setSyncRequirements(data.requirements);
      
      if (data.requirements.seasons.length === 0 && data.requirements.currentSeasonWeeks.length === 0) {
        setSuccess('All data is up to date!');
      } else {
        setSuccess('Incremental sync started successfully!');
      }
      
      onSyncComplete?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const checkSyncRequirements = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/import/${leagueId}?type=requirements`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check requirements');
      }

      setSyncRequirements(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runIntegrityCheck = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/import/${leagueId}?type=integrity`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to run integrity check');
      }

      if (data.valid) {
        setSuccess('Data integrity check passed! No issues found.');
      } else {
        setError(`Found ${data.issues.length} integrity issues. Check console for details.`);
        console.log('Integrity issues:', data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import & Sync Controls</CardTitle>
        <CardDescription>
          Import historical data or sync missing information
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="historical" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="historical">
              <Calendar className="h-4 w-4 mr-2" />
              Historical
            </TabsTrigger>
            <TabsTrigger value="incremental">
              <RefreshCw className="h-4 w-4 mr-2" />
              Incremental
            </TabsTrigger>
            <TabsTrigger value="maintenance">
              <Database className="h-4 w-4 mr-2" />
              Maintenance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="historical" className="space-y-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start-year">Start Year</Label>
                  <Select
                    value={startYear.toString()}
                    onValueChange={(value) => setStartYear(parseInt(value))}
                  >
                    <SelectTrigger id="start-year">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((year) => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end-year">End Year</Label>
                  <Select
                    value={endYear.toString()}
                    onValueChange={(value) => setEndYear(parseInt(value))}
                  >
                    <SelectTrigger id="end-year">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((year) => (
                        <SelectItem 
                          key={year} 
                          value={year.toString()}
                          disabled={year < startYear}
                        >
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="validate">Validate After Import</Label>
                  <Switch
                    id="validate"
                    checked={validateAfterImport}
                    onCheckedChange={setValidateAfterImport}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="optimize">Optimize Storage</Label>
                  <Switch
                    id="optimize"
                    checked={optimizeStorage}
                    onCheckedChange={setOptimizeStorage}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="skip">Skip Existing Seasons</Label>
                  <Switch
                    id="skip"
                    checked={skipExistingSeasons}
                    onCheckedChange={setSkipExistingSeasons}
                  />
                </div>
              </div>

              <Button
                onClick={handleHistoricalImport}
                disabled={loading || startYear > endYear}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Starting Import...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import {endYear - startYear + 1} Season{endYear - startYear > 0 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="incremental" className="space-y-4">
            <div className="space-y-4">
              {syncRequirements && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-semibold mb-1">Sync Requirements:</p>
                    <ul className="text-sm list-disc list-inside">
                      {syncRequirements.seasons.length > 0 && (
                        <li>Missing seasons: {syncRequirements.seasons.join(', ')}</li>
                      )}
                      {syncRequirements.currentSeasonWeeks.length > 0 && (
                        <li>Missing weeks: {syncRequirements.currentSeasonWeeks.join(', ')}</li>
                      )}
                      {syncRequirements.totalMissingRecords > 0 && (
                        <li>Estimated records to sync: {syncRequirements.totalMissingRecords}</li>
                      )}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={checkSyncRequirements}
                  variant="outline"
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 mr-2" />
                      Check Requirements
                    </>
                  )}
                </Button>

                <Button
                  onClick={handleIncrementalSync}
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Start Sync
                    </>
                  )}
                </Button>
              </div>

              <p className="text-sm text-muted-foreground">
                Incremental sync will automatically detect and import any missing data
                from previous seasons and current season weeks.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="maintenance" className="space-y-4">
            <div className="space-y-4">
              <Button
                onClick={runIntegrityCheck}
                variant="outline"
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Running Check...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Run Integrity Check
                  </>
                )}
              </Button>

              <p className="text-sm text-muted-foreground">
                Check for duplicate records, missing data, and other integrity issues
                in your imported historical data.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Status Messages */}
        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mt-4 border-green-500 bg-green-50 dark:bg-green-950">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-700 dark:text-green-300">
              {success}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
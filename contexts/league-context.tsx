'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useLeagues } from '@/hooks/api/use-leagues';
import { League } from '@/types';

interface LeagueContextType {
  currentLeague: League | null;
  leagues: League[];
  isLoading: boolean;
  switchLeague: (leagueId: string) => void;
  defaultLeagueId: string | null;
  setDefaultLeague: (leagueId: string) => void;
}

const LeagueContext = createContext<LeagueContextType | undefined>(undefined);

export function LeagueProvider({ children }: { children: ReactNode }) {
  const { data: leagues = [], isLoading } = useLeagues();
  const [currentLeague, setCurrentLeague] = useState<League | null>(null);
  const [defaultLeagueId, setDefaultLeagueId] = useState<string | null>(null);

  // Load default league from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('defaultLeagueId');
      if (stored) {
        setDefaultLeagueId(stored);
      }
    }
  }, []);

  // Set current league when leagues load
  useEffect(() => {
    if (leagues.length > 0 && !currentLeague) {
      const defaultLeague = defaultLeagueId 
        ? leagues.find(l => l.id === defaultLeagueId) 
        : leagues[0];
      
      if (defaultLeague) {
        setCurrentLeague(defaultLeague);
      }
    }
  }, [leagues, defaultLeagueId, currentLeague]);

  const switchLeague = useCallback((leagueId: string) => {
    const league = leagues.find(l => l.id === leagueId);
    if (league) {
      setCurrentLeague(league);
    }
  }, [leagues]);

  const setDefaultLeague = useCallback((leagueId: string) => {
    setDefaultLeagueId(leagueId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('defaultLeagueId', leagueId);
    }
  }, []);

  return (
    <LeagueContext.Provider value={{
      currentLeague,
      leagues,
      isLoading,
      switchLeague,
      defaultLeagueId,
      setDefaultLeague,
    }}>
      {children}
    </LeagueContext.Provider>
  );
}

export const useLeagueContext = () => {
  const context = useContext(LeagueContext);
  if (!context) {
    throw new Error('useLeagueContext must be used within LeagueProvider');
  }
  return context;
};
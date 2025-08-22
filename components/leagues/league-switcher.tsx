'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, Settings, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useLeagueContext } from '@/contexts/league-context';
import { Badge } from '@/components/ui/badge';

export function LeagueSwitcher() {
  const { 
    currentLeague, 
    leagues, 
    switchLeague, 
    defaultLeagueId,
    setDefaultLeague,
    isLoading
  } = useLeagueContext();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[250px] justify-between"
          disabled={isLoading}
        >
          {currentLeague ? (
            <div className="flex items-center gap-2">
              <span className="truncate">{currentLeague.name}</span>
              {currentLeague.id === defaultLeagueId && (
                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
              )}
            </div>
          ) : (
            isLoading ? 'Loading leagues...' : 'Select league...'
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0">
        <Command>
          <CommandInput placeholder="Search leagues..." />
          <CommandEmpty>No league found.</CommandEmpty>
          <CommandGroup>
            {(leagues || []).map((league) => (
              <CommandItem
                key={league.id}
                onSelect={() => {
                  switchLeague(league.id);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    currentLeague?.id === league.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span>{league.name}</span>
                    {league.id === defaultLeagueId && (
                      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Season {league.season} • {(league.settings as any)?.teamCount || 0} teams
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
          {currentLeague && (
            <>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    if (currentLeague) {
                      setDefaultLeague(currentLeague.id);
                    }
                    setOpen(false);
                  }}
                >
                  <Star className="mr-2 h-4 w-4" />
                  Set as default
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    // Navigate to league settings
                    window.location.href = `/leagues/${currentLeague.id}/settings`;
                    setOpen(false);
                  }}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  League settings
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Filter, X, Calendar, Tag } from 'lucide-react';

interface ContentFiltersProps {
  onFilterChange?: (filters: any) => void;
  categories?: string[];
  tags?: string[];
}

export function ContentFilters({ onFilterChange, categories = [], tags = [] }: ContentFiltersProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('latest');

  const defaultCategories = ['News', 'Analysis', 'Betting', 'Fantasy', 'AI Generated'];
  const defaultTags = ['NFL', 'Injuries', 'Trades', 'Waivers', 'DFS', 'Dynasty', 'Predictions'];

  const categoryList = categories.length > 0 ? categories : defaultCategories;
  const tagList = tags.length > 0 ? tags : defaultTags;

  const handleSearch = () => {
    if (onFilterChange) {
      onFilterChange({
        search: searchQuery,
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        dateRange,
        sortBy,
      });
    }
  };

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedTags([]);
    setDateRange('all');
    setSortBy('latest');
    if (onFilterChange) {
      onFilterChange({});
    }
  };

  const hasActiveFilters = searchQuery || selectedCategory !== 'all' || selectedTags.length > 0 || dateRange !== 'all' || sortBy !== 'latest';

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search articles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-9"
              />
            </div>
            <Button onClick={handleSearch}>Search</Button>
          </div>

          {/* Filter Row */}
          <div className="flex flex-wrap gap-2">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categoryList.map((cat) => (
                  <SelectItem key={cat} value={cat.toLowerCase()}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[150px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="season">This Season</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Latest</SelectItem>
                <SelectItem value="popular">Most Popular</SelectItem>
                <SelectItem value="trending">Trending</SelectItem>
                <SelectItem value="discussed">Most Discussed</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="ml-auto"
              >
                <X className="h-4 w-4 mr-1" />
                Clear Filters
              </Button>
            )}
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Tag className="h-4 w-4" />
              <span>Popular Tags:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {tagList.map((tag) => (
                <Badge
                  key={tag}
                  variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => handleTagToggle(tag)}
                >
                  {tag}
                  {selectedTags.includes(tag) && (
                    <X className="h-3 w-3 ml-1" />
                  )}
                </Badge>
              ))}
            </div>
          </div>

          {/* Active Filters Display */}
          {hasActiveFilters && (
            <div className="flex items-center gap-2 text-sm">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Active filters:</span>
              <div className="flex gap-1">
                {searchQuery && (
                  <Badge variant="secondary">Search: {searchQuery}</Badge>
                )}
                {selectedCategory !== 'all' && (
                  <Badge variant="secondary">Category: {selectedCategory}</Badge>
                )}
                {dateRange !== 'all' && (
                  <Badge variant="secondary">Date: {dateRange}</Badge>
                )}
                {sortBy !== 'latest' && (
                  <Badge variant="secondary">Sort: {sortBy}</Badge>
                )}
                {selectedTags.length > 0 && (
                  <Badge variant="secondary">
                    {selectedTags.length} tag{selectedTags.length > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
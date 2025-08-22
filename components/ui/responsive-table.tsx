'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';

export interface ResponsiveTableColumn<T = any> {
  key: string;
  label: string;
  priority?: number; // 1 = always show, 2 = tablet+, 3 = desktop only
  align?: 'left' | 'center' | 'right';
  className?: string;
  render?: (value: any, row: T) => React.ReactNode;
}

export interface ResponsiveTableProps<T = any> {
  columns: ResponsiveTableColumn<T>[];
  data: T[];
  keyExtractor?: (row: T, index: number) => string;
  mobileCard?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
  emptyMessage?: string;
}

export function ResponsiveTable<T = any>({
  columns,
  data,
  keyExtractor,
  mobileCard,
  onRowClick,
  className,
  emptyMessage = 'No data available',
}: ResponsiveTableProps<T>) {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Filter columns based on priority and screen size
  const visibleColumns = columns.filter(col => {
    if (!col.priority) return true; // No priority = always show
    if (isMobile) return col.priority === 1;
    if (isTablet) return col.priority <= 2;
    return true; // Desktop shows all
  });

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  // Get row key
  const getRowKey = (row: T, index: number): string => {
    if (keyExtractor) return keyExtractor(row, index);
    if ((row as any).id) return String((row as any).id);
    return String(index);
  };

  // Empty state
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  // Mobile card view
  if (isMobile && mobileCard) {
    return (
      <div className={cn("space-y-2", className)}>
        {data.map((row, index) => {
          const key = getRowKey(row, index);
          return (
            <Card 
              key={key}
              className={cn(
                "p-4 transition-colors",
                onRowClick && "cursor-pointer hover:bg-accent"
              )}
              onClick={() => onRowClick?.(row)}
            >
              {mobileCard(row)}
            </Card>
          );
        })}
      </div>
    );
  }

  // Responsive table view
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full">
        <thead>
          <tr className="border-b">
            {visibleColumns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-3 font-medium text-sm",
                  col.align === 'center' && "text-center",
                  col.align === 'right' && "text-right",
                  !col.align && "text-left",
                  col.className
                )}
              >
                {col.label}
              </th>
            ))}
            {isMobile && columns.length > visibleColumns.length && (
              <th className="w-10"></th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => {
            const key = getRowKey(row, rowIndex);
            const isExpanded = expandedRows.has(key);
            const hiddenColumns = columns.filter(col => !visibleColumns.includes(col));

            return (
              <>
                <tr 
                  key={key}
                  className={cn(
                    "border-b transition-colors",
                    onRowClick && !isMobile && "cursor-pointer hover:bg-accent",
                    isExpanded && "bg-accent/50"
                  )}
                  onClick={() => !isMobile && onRowClick?.(row)}
                >
                  {visibleColumns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3 text-sm",
                        col.align === 'center' && "text-center",
                        col.align === 'right' && "text-right",
                        col.className
                      )}
                    >
                      {col.render 
                        ? col.render((row as any)[col.key], row) 
                        : (row as any)[col.key]}
                    </td>
                  ))}
                  {isMobile && hiddenColumns.length > 0 && (
                    <td className="px-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRow(key);
                        }}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </td>
                  )}
                </tr>
                {isMobile && isExpanded && hiddenColumns.length > 0 && (
                  <tr key={`${key}-expanded`}>
                    <td 
                      colSpan={visibleColumns.length + 1} 
                      className="px-4 py-3 bg-accent/30"
                    >
                      <div className="space-y-2">
                        {hiddenColumns.map((col) => (
                          <div key={col.key} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{col.label}:</span>
                            <span className="font-medium">
                              {col.render 
                                ? col.render((row as any)[col.key], row) 
                                : (row as any)[col.key]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Pre-configured responsive table for common use cases
export function SimpleResponsiveTable<T = any>({
  data,
  columns,
  ...props
}: Omit<ResponsiveTableProps<T>, 'mobileCard'>) {
  // Generate a simple mobile card from the first 3 columns
  const mobileCard = (row: T) => {
    const mainColumns = columns.slice(0, 3);
    return (
      <div className="space-y-1">
        {mainColumns.map((col, index) => (
          <div key={col.key} className={index === 0 ? "font-medium" : "text-sm text-muted-foreground"}>
            {col.render 
              ? col.render((row as any)[col.key], row) 
              : (row as any)[col.key]}
          </div>
        ))}
      </div>
    );
  };

  return (
    <ResponsiveTable
      data={data}
      columns={columns}
      mobileCard={mobileCard}
      {...props}
    />
  );
}
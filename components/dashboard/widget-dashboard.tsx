'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings2, Plus, GripVertical, X } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Widget components
import { StandingsWidget } from '@/components/widgets/standings-widget';
import { BankrollWidget } from '@/components/widgets/bankroll-widget';
import { MatchupWidget } from '@/components/widgets/matchup-widget';
import { TransactionsWidget } from '@/components/widgets/transactions-widget';
import { ChatWidget } from '@/components/widgets/chat-widget';
import { NewsWidget } from '@/components/widgets/news-widget';
import { cn } from '@/lib/utils';

const AVAILABLE_WIDGETS = [
  { id: 'standings', name: 'Standings', component: StandingsWidget, cols: 1 },
  { id: 'bankroll', name: 'Bankroll', component: BankrollWidget, cols: 1 },
  { id: 'matchup', name: 'Current Matchup', component: MatchupWidget, cols: 2 },
  { id: 'transactions', name: 'Recent Transactions', component: TransactionsWidget, cols: 1 },
  { id: 'chat', name: 'AI Chat', component: ChatWidget, cols: 2 },
  { id: 'news', name: 'Latest News', component: NewsWidget, cols: 1 },
];

interface WidgetDashboardProps {
  className?: string;
}

export function WidgetDashboard({ className }: WidgetDashboardProps) {
  const [widgets, setWidgets] = useState<string[]>(() => {
    // Load saved widget configuration from localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dashboardWidgets');
      return saved ? JSON.parse(saved) : ['standings', 'bankroll', 'matchup'];
    }
    return ['standings', 'bankroll', 'matchup'];
  });
  
  const [editMode, setEditMode] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    // Save widget configuration to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('dashboardWidgets', JSON.stringify(widgets));
    }
  }, [widgets]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setWidgets((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const addWidget = (widgetId: string) => {
    if (!widgets.includes(widgetId)) {
      setWidgets([...widgets, widgetId]);
    }
  };

  const removeWidget = (widgetId: string) => {
    setWidgets(widgets.filter(id => id !== widgetId));
  };

  const availableToAdd = AVAILABLE_WIDGETS.filter(w => !widgets.includes(w.id));

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Your Dashboard</h2>
        <Button
          variant={editMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => setEditMode(!editMode)}
        >
          <Settings2 className="h-4 w-4 mr-1" />
          {editMode ? 'Done' : 'Customize'}
        </Button>
      </div>

      {editMode && availableToAdd.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Add Widgets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {availableToAdd.map((widget) => (
                <Button
                  key={widget.id}
                  variant="outline"
                  size="sm"
                  onClick={() => addWidget(widget.id)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {widget.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={widgets}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {widgets.map((widgetId) => {
              const widget = AVAILABLE_WIDGETS.find(w => w.id === widgetId);
              if (!widget) return null;

              return (
                <SortableWidget
                  key={widgetId}
                  id={widgetId}
                  widget={widget}
                  editMode={editMode}
                  onRemove={removeWidget}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {widgets.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Settings2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Widgets Added</h3>
            <p className="text-muted-foreground text-center mb-4">
              Click "Customize" above to add widgets to your dashboard
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface SortableWidgetProps {
  id: string;
  widget: typeof AVAILABLE_WIDGETS[0];
  editMode: boolean;
  onRemove: (id: string) => void;
}

function SortableWidget({ id, widget, editMode, onRemove }: SortableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Component = widget.component;

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes}
      className={cn(
        'relative',
        widget.cols === 2 && 'lg:col-span-2',
        isDragging && 'opacity-50 z-50'
      )}
    >
      {editMode && (
        <div className="absolute top-2 right-2 z-10 flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 bg-background/80 backdrop-blur"
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 bg-background/80 backdrop-blur"
            onClick={() => onRemove(id)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      <Component />
    </div>
  );
}
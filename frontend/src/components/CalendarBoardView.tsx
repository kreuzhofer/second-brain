import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarBusyBlock,
  CalendarSettings,
  CalendarSource,
  WeekPlanItem,
  WeekPlanResponse,
  WeekPlanUnscheduledItem
} from '@/services/api';
import {
  addDaysToYmd,
  dayIndexFromPlanStart,
  formatDayHeader,
  getBusyBlockTextStyle,
  generateTimeLabels,
  parseTimeToMinutes,
  timeToMinuteOffset,
  withAlpha
} from '@/components/calendar-board-helpers';
import { CheckCircle2, ChevronLeft, ChevronRight, Circle } from 'lucide-react';

const PIXELS_PER_MINUTE = 1.5;
const TIME_LABEL_STEP = 60;
const FULL_DAY_MINUTES = 1440;

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  task:     { bg: 'bg-blue-100',   border: 'border-blue-300',   text: 'text-blue-900' },
  admin:    { bg: 'bg-blue-100',   border: 'border-blue-300',   text: 'text-blue-900' },
  projects: { bg: 'bg-green-100',  border: 'border-green-300',  text: 'text-green-900' },
  ideas:    { bg: 'bg-amber-100',  border: 'border-amber-300',  text: 'text-amber-900' },
  people:   { bg: 'bg-pink-100',   border: 'border-pink-300',   text: 'text-pink-900' }
};

interface CalendarBoardViewProps {
  plan: WeekPlanResponse;
  busyBlocks: CalendarBusyBlock[];
  calendarSources: CalendarSource[];
  settings: CalendarSettings;
  visibleDays: number;
  startDayOffset: number;
  onNavigate: (offset: number) => void;
  onEntryClick: (path: string) => void;
  onMarkDone: (entryPath: string) => Promise<void>;
}

interface PositionedItem {
  item: WeekPlanItem;
  dayIndex: number;
  topPx: number;
  heightPx: number;
}

interface PositionedBusyBlock {
  block: CalendarBusyBlock;
  dayIndex: number;
  topPx: number;
  heightPx: number;
}

export default function CalendarBoardView({
  plan,
  busyBlocks,
  settings,
  visibleDays,
  startDayOffset,
  onNavigate,
  onEntryClick,
  onMarkDone
}: CalendarBoardViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [markingDone, setMarkingDone] = useState<string | null>(null);
  const [confirmingDone, setConfirmingDone] = useState<string | null>(null);
  const [nowMinute, setNowMinute] = useState(() => {
    const now = new Date();
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  });

  const workdayStartMinutes = parseTimeToMinutes(settings.workdayStartTime);
  const workdayEndMinutes = parseTimeToMinutes(settings.workdayEndTime);
  const totalHeightPx = FULL_DAY_MINUTES * PIXELS_PER_MINUTE;

  // How many columns to render (extra peek column when visibleDays === 1)
  const hasPeek = visibleDays === 1;
  const renderCols = hasPeek ? 2 : visibleDays;

  // Compute plan day count from plan date range
  const planDayCount = useMemo(() => {
    const start = new Date(`${plan.startDate}T00:00:00Z`).getTime();
    const end = new Date(`${plan.endDate}T00:00:00Z`).getTime();
    return Math.ceil((end - start) / 86_400_000) + 1;
  }, [plan.startDate, plan.endDate]);

  // Grid template columns string
  const gridCols = hasPeek
    ? '50px 1fr 0.33fr'
    : `50px repeat(${visibleDays}, 1fr)`;

  // Update current time every 60s
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setNowMinute(now.getUTCHours() * 60 + now.getUTCMinutes());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to working hours start on mount
  useEffect(() => {
    if (!scrollRef.current) return;
    const scrollTarget = Math.max(0, workdayStartMinutes * PIXELS_PER_MINUTE - 40);
    scrollRef.current.scrollTop = scrollTarget;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Full-day time labels (00:00 through 23:00)
  const timeLabels = useMemo(
    () => generateTimeLabels(0, FULL_DAY_MINUTES, TIME_LABEL_STEP),
    []
  );

  const dayHeaders = useMemo(() => {
    const headers: string[] = [];
    for (let i = 0; i < renderCols; i++) {
      headers.push(formatDayHeader(addDaysToYmd(plan.startDate, startDayOffset + i)));
    }
    return headers;
  }, [plan.startDate, startDayOffset, renderCols]);

  // Position plan items — relative to midnight (no clamping)
  const positionedItems: PositionedItem[] = useMemo(() => {
    const result: PositionedItem[] = [];
    for (const item of plan.items) {
      const di = dayIndexFromPlanStart(item.start, plan.startDate);
      if (di < startDayOffset || di >= startDayOffset + renderCols) continue;

      const minuteOfDay = timeToMinuteOffset(item.start, 0);
      result.push({
        item,
        dayIndex: di,
        topPx: minuteOfDay * PIXELS_PER_MINUTE,
        heightPx: item.durationMinutes * PIXELS_PER_MINUTE
      });
    }
    return result;
  }, [plan.items, plan.startDate, startDayOffset, renderCols]);

  // Position busy blocks — relative to midnight (no clamping)
  const positionedBusy: PositionedBusyBlock[] = useMemo(() => {
    const result: PositionedBusyBlock[] = [];
    for (const block of busyBlocks) {
      if (block.isAllDay) continue;

      const di = dayIndexFromPlanStart(block.startAt, plan.startDate);
      if (di < startDayOffset || di >= startDayOffset + renderCols) continue;

      const startMinute = timeToMinuteOffset(block.startAt, 0);
      const endDate = new Date(block.endAt);
      const endMinute = endDate.getUTCHours() * 60 + endDate.getUTCMinutes();
      const duration = endMinute - startMinute;
      if (duration <= 0) continue;

      result.push({
        block,
        dayIndex: di,
        topPx: startMinute * PIXELS_PER_MINUTE,
        heightPx: duration * PIXELS_PER_MINUTE
      });
    }
    return result;
  }, [busyBlocks, plan.startDate, startDayOffset, renderCols]);

  // All-day busy blocks
  const allDayBlocks = useMemo(() => {
    const result: Array<{ block: CalendarBusyBlock; dayIndex: number }> = [];
    for (const block of busyBlocks) {
      if (!block.isAllDay) continue;
      const di = dayIndexFromPlanStart(block.startAt, plan.startDate);
      if (di < startDayOffset || di >= startDayOffset + renderCols) continue;
      result.push({ block, dayIndex: di });
    }
    return result;
  }, [busyBlocks, plan.startDate, startDayOffset, renderCols]);

  // Unscheduled items
  const visibleUnscheduled: WeekPlanUnscheduledItem[] = plan.unscheduled;

  // Current time indicator — relative to midnight
  const showNowLine = nowMinute >= 0 && nowMinute <= FULL_DAY_MINUTES;
  const nowTopPx = nowMinute * PIXELS_PER_MINUTE;

  // Today's day index (absolute, relative to plan start)
  const todayYmd = new Date().toISOString().slice(0, 10);
  const todayDayIndex = dayIndexFromPlanStart(`${todayYmd}T00:00:00Z`, plan.startDate);

  // Working hours shading positions
  const beforeWorkPx = workdayStartMinutes * PIXELS_PER_MINUTE;
  const afterWorkTopPx = workdayEndMinutes * PIXELS_PER_MINUTE;
  const afterWorkHeightPx = (FULL_DAY_MINUTES - workdayEndMinutes) * PIXELS_PER_MINUTE;

  // Navigation helpers
  const canGoPrev = startDayOffset > 0;
  const canGoNext = startDayOffset + visibleDays < planDayCount;
  const todayOffset = todayDayIndex;

  const handlePrev = () => {
    onNavigate(Math.max(0, startDayOffset - visibleDays));
  };
  const handleNext = () => {
    onNavigate(Math.min(planDayCount - 1, startDayOffset + visibleDays));
  };
  const handleToday = () => {
    onNavigate(Math.max(0, Math.min(todayOffset, planDayCount - 1)));
  };

  const handleMarkDone = async (entryPath: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (confirmingDone !== entryPath) {
      setConfirmingDone(entryPath);
      return;
    }
    setConfirmingDone(null);
    setMarkingDone(entryPath);
    try {
      await onMarkDone(entryPath);
    } finally {
      setMarkingDone(null);
    }
  };

  const handleCancelConfirm = (entryPath: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (confirmingDone === entryPath) {
      setConfirmingDone(null);
    }
  };

  const getCategoryColors = (category: string) =>
    CATEGORY_COLORS[category] || CATEGORY_COLORS.task;

  const getSourceColor = (block: CalendarBusyBlock): string =>
    block.sourceColor || '#94a3b8';
  const busyBlockTextStyle = getBusyBlockTextStyle();

  const isPeekColumn = (colIndex: number) => hasPeek && colIndex === 1;

  return (
    <div className="space-y-2">
      {/* Navigation bar */}
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={handlePrev}
          disabled={!canGoPrev}
          className="h-7 w-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
          title="Previous"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleToday}
          className="h-7 px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-accent"
        >
          Today
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!canGoNext}
          className="h-7 w-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
          title="Next"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* All-day events banner */}
      {allDayBlocks.length > 0 && (
        <div
          className="grid gap-px overflow-hidden"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="text-[10px] text-muted-foreground flex items-center justify-center">
            All day
          </div>
          {Array.from({ length: renderCols }, (_, ci) => {
            const absDayIndex = startDayOffset + ci;
            const dayBlocks = allDayBlocks.filter((b) => b.dayIndex === absDayIndex);
            return (
              <div key={ci} className={`space-y-px ${isPeekColumn(ci) ? 'opacity-40' : ''}`}>
                {dayBlocks.map((b) => (
                  <div
                    key={b.block.id}
                    className="rounded px-1.5 py-0.5 text-[10px] truncate text-white"
                    style={{ backgroundColor: getSourceColor(b.block) }}
                    title={[b.block.title, b.block.location, b.block.sourceName].filter(Boolean).join(' · ')}
                  >
                    {b.block.title || b.block.sourceName}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Board grid */}
      <div
        ref={scrollRef}
        className="overflow-y-auto overflow-x-hidden rounded-md border border-border"
        style={{ maxHeight: 'min(600px, calc(100dvh - 340px))' }}
      >
        {/* Day column headers */}
        <div
          className="grid sticky top-0 z-20 bg-background border-b border-border"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="p-1" />
          {dayHeaders.map((header, ci) => {
            const absDayIndex = startDayOffset + ci;
            return (
              <div
                key={ci}
                className={`p-1.5 text-center text-[11px] font-medium border-l border-border ${
                  absDayIndex === todayDayIndex ? 'bg-blue-50 text-blue-700' : 'text-muted-foreground'
                } ${isPeekColumn(ci) ? 'opacity-40' : ''}`}
              >
                {header}
              </div>
            );
          })}
        </div>

        {/* Time grid body */}
        <div
          className="grid relative"
          style={{
            gridTemplateColumns: gridCols,
            height: totalHeightPx
          }}
        >
          {/* Time gutter labels */}
          <div className="relative">
            {timeLabels.map((tl) => (
              <div
                key={tl.label}
                className="absolute right-1 text-[10px] text-muted-foreground leading-none"
                style={{ top: tl.offsetMinutes * PIXELS_PER_MINUTE - 5 }}
              >
                {tl.label}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {Array.from({ length: renderCols }, (_, ci) => {
            const absDayIndex = startDayOffset + ci;
            const isPeek = isPeekColumn(ci);
            return (
              <div key={ci} className={`relative border-l border-border ${isPeek ? 'opacity-40 pointer-events-none' : ''}`}>
                {/* Non-working hours shading */}
                <div
                  className="absolute left-0 right-0 bg-muted/30 pointer-events-none"
                  style={{ top: 0, height: beforeWorkPx }}
                />
                <div
                  className="absolute left-0 right-0 bg-muted/30 pointer-events-none"
                  style={{ top: afterWorkTopPx, height: afterWorkHeightPx }}
                />

                {/* Hour grid lines */}
                {timeLabels.map((tl) => (
                  <div
                    key={tl.label}
                    className="absolute left-0 right-0 border-t border-border/40"
                    style={{ top: tl.offsetMinutes * PIXELS_PER_MINUTE }}
                  />
                ))}

                {/* Busy blocks (behind tasks) */}
                {positionedBusy
                  .filter((pb) => pb.dayIndex === absDayIndex)
                  .map((pb) => (
                    <div
                      key={pb.block.id}
                      className="absolute left-0.5 right-0.5 rounded overflow-hidden z-[1] pointer-events-none"
                      style={{
                        top: pb.topPx,
                        height: Math.max(pb.heightPx, 4),
                        backgroundColor: withAlpha(getSourceColor(pb.block), 0.25)
                      }}
                      title={[pb.block.title, pb.block.location, pb.block.sourceName].filter(Boolean).join(' · ')}
                    >
                      {pb.heightPx >= 20 && (
                        <div
                          className="px-1 pt-0.5 text-[9px] font-medium truncate"
                          style={{ color: busyBlockTextStyle.titleColor }}
                        >
                          {pb.block.title || pb.block.sourceName}
                        </div>
                      )}
                      {pb.block.location && pb.heightPx >= 36 && (
                        <div
                          className="px-1 text-[8px] truncate"
                          style={{ color: busyBlockTextStyle.locationColor, opacity: 0.9 }}
                        >
                          {pb.block.location}
                        </div>
                      )}
                    </div>
                  ))}

                {/* Task blocks */}
                {positionedItems
                  .filter((pi) => pi.dayIndex === absDayIndex)
                  .map((pi) => {
                    const colors = getCategoryColors(pi.item.category);
                    const isMarking = markingDone === pi.item.entryPath;
                    const isConfirming = confirmingDone === pi.item.entryPath;
                    const isTask = pi.item.category === 'task' || pi.item.category === 'admin';
                    return (
                      <button
                        key={`${pi.item.entryPath}-${pi.item.start}`}
                        type="button"
                        onClick={() => {
                          if (isConfirming) {
                            setConfirmingDone(null);
                          }
                          onEntryClick(pi.item.entryPath);
                        }}
                        className={`absolute left-1 right-1 rounded border overflow-hidden z-[2] text-left cursor-pointer hover:shadow-md transition-shadow ${colors.bg} ${colors.border}`}
                        style={{
                          top: pi.topPx,
                          height: Math.max(pi.heightPx, 18)
                        }}
                        title={`${pi.item.title} (${pi.item.durationMinutes}m)`}
                      >
                        <div className="flex items-start gap-0.5 px-1 pt-0.5">
                          {isTask && (
                            <button
                              type="button"
                              onClick={(e) => handleMarkDone(pi.item.entryPath, e)}
                              className="shrink-0 mt-px hover:scale-125 transition-transform"
                              disabled={isMarking}
                              title={isConfirming ? 'Click to confirm' : 'Mark done'}
                            >
                              {isMarking ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 animate-pulse" />
                              ) : isConfirming ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-amber-500" />
                              ) : (
                                <Circle className="h-3.5 w-3.5 text-muted-foreground hover:text-green-600" />
                              )}
                            </button>
                          )}
                          {isConfirming ? (
                            <span className="text-[10px] font-medium leading-tight text-amber-700 flex items-center gap-1">
                              Complete task?
                              <button
                                type="button"
                                onClick={(e) => handleCancelConfirm(pi.item.entryPath, e)}
                                className="text-[9px] text-muted-foreground hover:text-foreground underline"
                              >
                                cancel
                              </button>
                            </span>
                          ) : (
                            <span className={`text-[10px] font-medium leading-tight truncate ${colors.text}`}>
                              {pi.item.title}
                            </span>
                          )}
                        </div>
                        {!isConfirming && pi.heightPx >= 36 && (
                          <div className="px-1 text-[9px] text-muted-foreground truncate">
                            {pi.item.durationMinutes}m
                          </div>
                        )}
                      </button>
                    );
                  })}

                {/* Current time indicator */}
                {showNowLine && absDayIndex === todayDayIndex && (
                  <div
                    className="absolute left-0 right-0 z-10 pointer-events-none"
                    style={{ top: nowTopPx }}
                  >
                    <div className="h-0.5 bg-red-500 relative">
                      <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-red-500" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Unscheduled items */}
      {visibleUnscheduled.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Unscheduled ({visibleUnscheduled.length})
          </div>
          {visibleUnscheduled.map((item) => (
            <button
              key={`${item.entryPath}-${item.reasonCode}`}
              type="button"
              onClick={() => onEntryClick(item.entryPath)}
              className="w-full rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-left"
            >
              <div className="text-xs font-medium">{item.sourceName}</div>
              <div className="mt-0.5 text-[11px] text-amber-800">{item.reason}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

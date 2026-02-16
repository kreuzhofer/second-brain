import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, EntryWithPath, FocusTrack } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useEntries } from '@/state/entries';
import { getMarkDoneButtonState } from './deep-focus-helpers';
import {
  X,
  Play,
  Pause,
  SkipForward,
  ThumbsUp,
  ThumbsDown,
  Volume2,
  Timer,
  Loader2
} from 'lucide-react';

const PRESET_MINUTES = [5, 10, 15, 20, 30, 45, 60];

interface DeepFocusViewProps {
  entry: EntryWithPath | null;
  onClose: () => void;
  initialMinutes?: number;
}

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export function DeepFocusView({ entry, onClose, initialMinutes }: DeepFocusViewProps) {
  const { refresh } = useEntries();
  const [selectedMinutes, setSelectedMinutes] = useState(25);
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [track, setTrack] = useState<FocusTrack | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(40);
  const [showProgressForm, setShowProgressForm] = useState(false);
  const [progressNote, setProgressNote] = useState('');
  const [updatingTitle, setUpdatingTitle] = useState(false);
  const [isMarkingDone, setIsMarkingDone] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [congratsMessage, setCongratsMessage] = useState<string | null>(null);
  const [showCongrats, setShowCongrats] = useState(false);

  const playerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const endTimeRef = useRef<number | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const completedRef = useRef(false);
  const pendingStartRef = useRef(false);
  const initialDurationRef = useRef<number | null>(null);
  const loadedTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (entry) {
      setTitleDraft(String((entry.entry as any)?.name || ''));
      const nextMinutes = Math.max(1, initialMinutes ?? 25);
      setSelectedMinutes(nextMinutes);
      setRemainingSeconds(nextMinutes * 60);
      setSessionComplete(false);
      setSessionError(null);
      setStatusMessage(null);
      setShowProgressForm(false);
      setProgressNote('');
      setIsMarkingDone(false);
      completedRef.current = false;
      loadTrack('auto');
    }
  }, [entry, initialMinutes]);

  useEffect(() => {
    if (!entry) {
      return;
    }
    loadYouTubeApi().then(() => {
      if (!playerContainerRef.current || playerRef.current) return;
      playerRef.current = new window.YT.Player(playerContainerRef.current, {
        height: '1',
        width: '1',
        playerVars: { controls: 0, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            setPlayerReady(true);
            if (track?.youtubeId) {
              playerRef.current.cueVideoById(track.youtubeId);
            }
            playerRef.current.setVolume(volume);
          }
        }
      });
    });
  }, [entry, track?.youtubeId, volume]);

  useEffect(() => {
    if (!playerReady || !playerRef.current || !track?.youtubeId) return;
    if (loadedTrackIdRef.current === track.youtubeId) {
      return;
    }
    if (pendingStartRef.current || isRunning) {
      playerRef.current.loadVideoById(track.youtubeId);
      playerRef.current.playVideo();
      setIsPlaying(true);
      pendingStartRef.current = false;
    } else {
      playerRef.current.cueVideoById(track.youtubeId);
    }
    loadedTrackIdRef.current = track.youtubeId;
  }, [playerReady, track?.youtubeId, isRunning]);

  useEffect(() => {
    if (!playerReady || !playerRef.current || !track?.youtubeId) return;
    if (isRunning) {
      if (loadedTrackIdRef.current !== track.youtubeId) {
        playerRef.current.loadVideoById(track.youtubeId);
        loadedTrackIdRef.current = track.youtubeId;
      }
      playerRef.current.playVideo();
      setIsPlaying(true);
      pendingStartRef.current = false;
    } else {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
    }
  }, [playerReady, isRunning, track?.youtubeId]);

  useEffect(() => {
    if (!playerRef.current) return;
    playerRef.current.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(() => {
      if (!endTimeRef.current) return;
      const diff = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      setRemainingSeconds(diff);
      if (diff <= 0 && !completedRef.current) {
        completedRef.current = true;
        handleSessionComplete();
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [isRunning]);

  if (!entry) return null;

  const startTimer = () => {
    const isNewSession = !startedAtRef.current || sessionComplete;
    const seconds = isNewSession
      ? Math.max(1, Math.round(selectedMinutes * 60))
      : Math.max(1, remainingSeconds);
    if (isNewSession) {
      setRemainingSeconds(seconds);
      initialDurationRef.current = seconds;
      startedAtRef.current = new Date().toISOString();
    }
    setIsRunning(true);
    setSessionComplete(false);
    completedRef.current = false;
    const now = Date.now();
    endTimeRef.current = now + seconds * 1000;
    setSessionError(null);
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => undefined);
      }
    }
    pendingStartRef.current = true;
    if (playerReady && track?.youtubeId) {
      playMusic();
    }
  };

  const handleExit = () => {
    if (isRunning && !window.confirm('End the current focus session?')) {
      return;
    }
    setIsRunning(false);
    pauseMusic();
    onClose();
  };

  const pauseTimer = () => {
    setIsRunning(false);
    pauseMusic();
  };

  const resetTimer = () => {
    setIsRunning(false);
    setSessionComplete(false);
    completedRef.current = false;
    setRemainingSeconds(selectedMinutes * 60);
    startedAtRef.current = null;
    initialDurationRef.current = null;
    pauseMusic();
  };

  const handleSessionComplete = async () => {
    setIsRunning(false);
    setSessionComplete(true);
    pauseMusic();
    playDing();
    setStatusMessage('Session complete.');
    maybeNotifySessionComplete();

    if (!entry || !startedAtRef.current) {
      return;
    }

    const endedAt = new Date().toISOString();
    try {
      await api.focus.recordSession({
        entryPath: entry.path,
        durationSeconds: initialDurationRef.current ?? selectedMinutes * 60,
        startedAt: startedAtRef.current,
        endedAt,
        trackYoutubeId: track?.youtubeId
      });
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Failed to record focus session');
    }
  };

  const handleLogProgress = async () => {
    if (!progressNote.trim()) return;
    try {
      await api.focus.logProgress(entry.path, progressNote.trim());
      setProgressNote('');
      setShowProgressForm(false);
      setStatusMessage('Progress logged.');
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Failed to log progress');
    }
  };

  const handleUpdateTitle = async () => {
    if (!titleDraft.trim()) return;
    setUpdatingTitle(true);
    try {
      const updated = await api.entries.update(entry.path, { name: titleDraft.trim() });
      (entry.entry as any).name = updated.entry.name;
      setStatusMessage('Task updated.');
      void refresh();
      setUpdatingTitle(false);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Failed to update task');
      setUpdatingTitle(false);
    }
  };

  const handleMarkDone = async () => {
    if (isMarkingDone) return;
    setIsMarkingDone(true);
    try {
      const updated = await api.entries.update(entry.path, { status: 'done' });
      (entry.entry as any).status = updated.entry.status;
      const minutes = initialDurationRef.current
        ? Math.round(initialDurationRef.current / 60)
        : undefined;
      const congrats = await api.focus.congrats({
        entryPath: entry.path,
        entryName: String((entry.entry as any)?.name || ''),
        minutes
      });
      setCongratsMessage(congrats.message);
      setShowCongrats(true);
      void refresh();
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Failed to mark done');
    } finally {
      setIsMarkingDone(false);
    }
  };

  const loadTrack = async (mode: 'auto' | 'new', excludeYoutubeId?: string) => {
    setTrackLoading(true);
    setTrackError(null);
    try {
      const next = await api.focus.nextTrack(mode, excludeYoutubeId);
      setTrack(next);
    } catch (err) {
      setTrackError(err instanceof Error ? err.message : 'Failed to load focus track');
    } finally {
      setTrackLoading(false);
    }
  };

  const rateTrack = async (rating: number) => {
    if (!track) return;
    try {
      const updated = await api.focus.rateTrack(track.youtubeId, rating);
      if (rating < 0) {
        await loadTrack('new', track.youtubeId);
      } else {
        setTrack(updated);
      }
    } catch (err) {
      setTrackError(err instanceof Error ? err.message : 'Failed to rate track');
    }
  };

  const playMusic = () => {
    if (!playerRef.current) return;
    playerRef.current.playVideo();
    setIsPlaying(true);
    pendingStartRef.current = false;
  };

  const pauseMusic = () => {
    if (!playerRef.current) return;
    playerRef.current.pauseVideo();
    setIsPlaying(false);
  };

  const toggleMusic = () => {
    if (isPlaying) {
      pauseMusic();
    } else {
      playMusic();
    }
  };

  const handleNextTrack = async () => {
    await loadTrack('new', track?.youtubeId);
    if (isRunning) {
      playMusic();
    }
  };

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const title = String((entry.entry as any)?.name || 'Deep Focus');
  const notes = entry.content?.trim() || 'No notes yet.';
  const markDoneState = getMarkDoneButtonState(isMarkingDone);

  const modal = (
    <div className="fixed inset-0 z-50 bg-background text-foreground">
      <div className="h-full w-full flex flex-col">
        <header className="flex items-center justify-between px-8 py-5 border-b border-border">
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-muted-foreground">
            <Timer className="h-4 w-4" />
            Deep Focus
          </div>
          <Button variant="ghost" size="icon" onClick={handleExit} aria-label="Exit focus view">
            <X className="h-5 w-5" />
          </Button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
          <section className="space-y-6">
            <div className="space-y-2">
              <div className="text-3xl font-semibold leading-tight">{title}</div>
              {(entry.entry as any)?.status && (
                <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs uppercase tracking-wide">
                  {(entry.entry as any).status}
                </span>
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Notes</div>
              <p className="mt-3 text-base leading-relaxed whitespace-pre-wrap">{notes}</p>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-2xl border border-border p-5 space-y-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Timer</div>
              <div className="text-5xl font-semibold tabular-nums">{formattedTime}</div>

              <div className="grid grid-cols-4 gap-2">
                {PRESET_MINUTES.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    className={`min-h-[44px] rounded-md border px-2 py-1 text-xs font-medium ${
                      selectedMinutes === mins ? 'bg-foreground text-background' : 'text-muted-foreground'
                    }`}
                    onClick={() => {
                      setSelectedMinutes(mins);
                      if (!isRunning) {
                        setRemainingSeconds(mins * 60);
                      }
                    }}
                  >
                    {mins}m
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={selectedMinutes}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (!Number.isNaN(next)) {
                      setSelectedMinutes(next);
                      if (!isRunning) {
                        setRemainingSeconds(next * 60);
                      }
                    }
                  }}
                  className="h-11 sm:h-9"
                />
                <span className="text-xs text-muted-foreground">minutes</span>
              </div>

              <div className="flex items-center gap-2">
                {!isRunning ? (
                  <Button className="flex-1" onClick={startTimer}>
                    {remainingSeconds < selectedMinutes * 60 && !sessionComplete ? 'Resume' : 'Start'}
                  </Button>
                ) : (
                  <Button className="flex-1" variant="outline" onClick={pauseTimer}>
                    Pause
                  </Button>
                )}
                <Button variant="ghost" onClick={resetTimer}>
                  Reset
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border p-5 space-y-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Music</div>
              {trackLoading && <p className="text-sm text-muted-foreground">Loading track…</p>}
              {trackError && <p className="text-sm text-destructive">{trackError}</p>}
              {!trackLoading && !trackError && track && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">{track.title || 'Focus track'}</div>
                  <div className="text-xs text-muted-foreground">{track.channelTitle}</div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="icon" onClick={toggleMusic} disabled={!track}>
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="icon" onClick={handleNextTrack} disabled={!track}>
                  <SkipForward className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => rateTrack(1)}
                  disabled={!track}
                  className={track?.rating === 1 ? 'bg-foreground text-background' : undefined}
                >
                  <ThumbsUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => rateTrack(-1)}
                  disabled={!track}
                  className={track?.rating === -1 ? 'bg-foreground text-background' : undefined}
                >
                  <ThumbsDown className="h-4 w-4" />
                </Button>
                {track && (
                  <div className="text-xs text-muted-foreground">
                    {track.likesCount ?? 0} likes · {track.dislikesCount ?? 0} dislikes
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            {sessionComplete && (
              <div className="rounded-2xl border border-border p-5 space-y-4 bg-muted/40">
                <div className="text-sm font-medium">Session complete</div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleMarkDone} disabled={markDoneState.disabled} aria-busy={isMarkingDone}>
                    {markDoneState.showSpinner && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {markDoneState.label}
                  </Button>
                  <Button variant="outline" onClick={() => setShowProgressForm((prev) => !prev)}>
                    Log progress
                  </Button>
                  <Button variant="outline" onClick={() => setUpdatingTitle((prev) => !prev)}>
                    Update next action
                  </Button>
                  <Button variant="ghost" onClick={() => startTimer()}>
                    Start another
                  </Button>
                </div>

                {showProgressForm && (
                  <div className="space-y-2">
                    <Textarea
                      value={progressNote}
                      onChange={(event) => setProgressNote(event.target.value)}
                      placeholder="What did you move forward?"
                    />
                    <div className="flex gap-2">
                      <Button onClick={handleLogProgress} disabled={!progressNote.trim()}>
                        Save note
                      </Button>
                      <Button variant="ghost" onClick={() => setShowProgressForm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {updatingTitle && (
                  <div className="space-y-2">
                    <Input
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      placeholder="Update the task name"
                    />
                    <div className="flex gap-2">
                      <Button onClick={handleUpdateTitle} disabled={!titleDraft.trim()}>
                        Save update
                      </Button>
                      <Button variant="ghost" onClick={() => setUpdatingTitle(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {sessionError && <p className="text-sm text-destructive">{sessionError}</p>}
            {statusMessage && <p className="text-xs text-muted-foreground">{statusMessage}</p>}
          </section>
        </div>

        <div className="absolute top-0 left-0">
          <div ref={playerContainerRef} className="w-1 h-1 opacity-0 pointer-events-none" />
        </div>
      </div>
      {showCongrats && congratsMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-w-lg w-full rounded-2xl bg-background border border-border p-6 space-y-4 text-center">
            <div className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Well done</div>
            <p className="text-lg font-medium">{congratsMessage}</p>
            <Button
              onClick={() => {
                setShowCongrats(false);
                setCongratsMessage(null);
                onClose();
              }}
            >
              Continue
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(modal, document.body);
}

function maybeNotifySessionComplete() {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (document.visibilityState === 'visible') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification('Deep Focus session complete', {
      body: 'Your focus timer finished. Ready for the next step?'
    });
  } catch {
    // ignore notification errors
  }
}

function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();

  return new Promise((resolve) => {
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (existing) {
      window.onYouTubeIframeAPIReady = () => resolve();
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    window.onYouTubeIframeAPIReady = () => resolve();
    document.body.appendChild(tag);
  });
}

function playDing() {
  if (typeof window === 'undefined') return;
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = 880;
  gain.gain.value = 0.05;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.6);
  oscillator.stop(context.currentTime + 0.6);
}

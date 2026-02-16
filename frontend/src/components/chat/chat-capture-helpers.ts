export interface TaskCaptureAction {
  type: 'start_focus_5m';
  entryPath: string;
  entryName: string;
  durationMinutes: number;
  label: string;
}

export interface CaptureEntrySummary {
  path: string;
  category: string;
  name: string;
}

export function buildTaskCaptureAction(
  entry?: CaptureEntrySummary
): TaskCaptureAction | undefined {
  if (!entry) return undefined;
  if (entry.category !== 'task' && entry.category !== 'admin') return undefined;
  return {
    type: 'start_focus_5m',
    entryPath: entry.path,
    entryName: entry.name,
    durationMinutes: 5,
    label: 'Start 5 minutes now'
  };
}

export function hasAudioCaptureSupport(input: {
  navigator?: { mediaDevices?: { getUserMedia?: unknown } };
  MediaRecorder?: unknown;
}): boolean {
  return Boolean(
    input.MediaRecorder &&
    input.navigator?.mediaDevices &&
    typeof input.navigator.mediaDevices.getUserMedia === 'function'
  );
}

export function toBase64Payload(audioData: string): string {
  const commaIndex = audioData.indexOf(',');
  if (commaIndex < 0) return audioData;
  return audioData.slice(commaIndex + 1);
}

export interface VoiceButtonUiStateInput {
  isRecording: boolean;
  isTranscribing: boolean;
}

export interface VoiceButtonUiState {
  label: string;
  className: string;
}

export function getVoiceButtonUiState(input: VoiceButtonUiStateInput): VoiceButtonUiState {
  const label = input.isTranscribing
    ? 'Transcribing voice input'
    : input.isRecording
      ? 'Release to transcribe'
      : 'Hold to talk';

  const baseClassName = 'h-11 w-11 sm:h-10 sm:w-10 shrink-0 touch-none';
  if (input.isRecording) {
    return {
      label,
      className: `${baseClassName} bg-primary text-primary-foreground hover:bg-primary/90`
    };
  }
  return {
    label,
    className: baseClassName
  };
}

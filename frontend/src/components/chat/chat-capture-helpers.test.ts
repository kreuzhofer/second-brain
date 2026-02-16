import { describe, expect, it, vi } from 'vitest';
import {
  buildTaskCaptureAction,
  getSupportedAudioMimeType,
  getVoiceButtonUiState,
  hasAudioCaptureSupport,
  toBase64Payload
} from './chat-capture-helpers';

describe('buildTaskCaptureAction', () => {
  it('returns action for task category', () => {
    const action = buildTaskCaptureAction({
      path: 'task/pay-invoice',
      category: 'task',
      name: 'Pay invoice'
    });

    expect(action).toEqual({
      type: 'start_focus_5m',
      entryPath: 'task/pay-invoice',
      entryName: 'Pay invoice',
      durationMinutes: 5,
      label: 'Start 5 minutes now'
    });
  });

  it('returns undefined for non-task category', () => {
    const action = buildTaskCaptureAction({
      path: 'projects/redesign',
      category: 'projects',
      name: 'Redesign'
    });

    expect(action).toBeUndefined();
  });
});

describe('hasAudioCaptureSupport', () => {
  it('returns true when mediaDevices and MediaRecorder are available', () => {
    const supported = hasAudioCaptureSupport({
      navigator: { mediaDevices: { getUserMedia: vi.fn() } },
      MediaRecorder: class MockRecorder {}
    });

    expect(supported).toBe(true);
  });

  it('returns false when getUserMedia is missing', () => {
    const supported = hasAudioCaptureSupport({
      navigator: {},
      MediaRecorder: class MockRecorder {}
    });

    expect(supported).toBe(false);
  });
});

describe('toBase64Payload', () => {
  it('strips data URL prefixes', () => {
    expect(toBase64Payload('data:audio/webm;base64,aGVsbG8=')).toBe('aGVsbG8=');
  });

  it('keeps plain base64 unchanged', () => {
    expect(toBase64Payload('aGVsbG8=')).toBe('aGVsbG8=');
  });
});

describe('getSupportedAudioMimeType', () => {
  it('selects the first supported mime type', () => {
    const mimeType = getSupportedAudioMimeType({
      isTypeSupported: (type: string) => type === 'audio/mp4'
    });

    expect(mimeType).toBe('audio/mp4');
  });

  it('returns undefined when no mime type is supported', () => {
    const mimeType = getSupportedAudioMimeType({
      isTypeSupported: () => false
    });

    expect(mimeType).toBeUndefined();
  });
});

describe('getVoiceButtonUiState', () => {
  it('uses fixed-size classes in idle and recording states', () => {
    const idle = getVoiceButtonUiState({ isRecording: false, isTranscribing: false });
    const recording = getVoiceButtonUiState({ isRecording: true, isTranscribing: false });

    for (const state of [idle, recording]) {
      expect(state.className).toContain('h-11');
      expect(state.className).toContain('w-11');
      expect(state.className).toContain('sm:h-10');
      expect(state.className).toContain('sm:w-10');
      expect(state.className).toContain('shrink-0');
      expect(state.className).toContain('touch-none');
    }
  });

  it('returns clear labels per voice state', () => {
    expect(getVoiceButtonUiState({ isRecording: false, isTranscribing: false }).label).toBe('Start voice input');
    expect(getVoiceButtonUiState({ isRecording: true, isTranscribing: false }).label).toBe('Stop recording');
    expect(getVoiceButtonUiState({ isRecording: false, isTranscribing: true }).label).toBe('Transcribing voice input');
  });

  it('uses inverted icon styling while recording', () => {
    const recording = getVoiceButtonUiState({ isRecording: true, isTranscribing: false });

    expect(recording.className).toContain('border-primary');
    expect(recording.className).toContain('bg-primary');
    expect(recording.className).toContain('text-primary-foreground');
    expect(recording.className).toContain('[&_svg]:text-primary-foreground');
  });
});

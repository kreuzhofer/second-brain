export function getMarkDoneButtonState(isMarkingDone: boolean): {
  label: string;
  showSpinner: boolean;
  disabled: boolean;
} {
  return {
    label: isMarkingDone ? 'Marking done...' : 'Mark done',
    showSpinner: isMarkingDone,
    disabled: isMarkingDone
  };
}

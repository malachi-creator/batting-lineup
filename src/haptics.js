export function tap(ms = 10) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

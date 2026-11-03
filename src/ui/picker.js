'use strict';
const $ = (id) => document.getElementById(id);
let state,
  sourceId = '',
  sourceType = 'window';
function button(label, className, callback, aria) {
  const element = document.createElement('button');
  element.textContent = label;
  element.className = className;
  element.setAttribute('aria-label', aria);
  element.addEventListener('click', callback);
  return element;
}
function updateSources() {
  if (!state?.capture) return;
  const previous = state.capture.sources.find((item) => item.id === sourceId);
  if (previous && previous.display !== (sourceType === 'screen')) sourceId = '';
  const sources = state.capture.sources.filter((item) =>
    sourceType === 'screen' ? item.display : !item.display,
  );
  $('captureSources').replaceChildren();
  for (const source of sources) {
    const card = button(
      '',
      'source-card' + (source.id === sourceId ? ' selected' : ''),
      () => {
        sourceId = source.id;
        updateSources();
      },
      'Share ' + source.name,
    );
    card.setAttribute('aria-pressed', String(source.id === sourceId));
    const image = document.createElement('img');
    image.src = source.thumbnail;
    image.alt = '';
    const label = document.createElement('strong');
    label.textContent = source.name;
    card.append(image, label);
    $('captureSources').append(card);
  }
  if (!sources.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-copy';
    empty.textContent =
      sourceType === 'screen'
        ? 'No displays were returned by Windows.'
        : 'No application windows are available. Open the app you want to share, cancel, and try again.';
    $('captureSources').append(empty);
  }
  const selected = state.capture.sources.find((item) => item.id === sourceId);
  $('captureConfirm').disabled = !selected;
  $('displayAudioLabel').hidden = !selected?.display;
  const audioSource = selected?.display
    ? state.capture.sources.find(
        (item) => item.id === $('displayAudioSource').value && !item.display,
      )
    : selected;
  const supportsAudio = audioSource?.audio && state.capture.audioRequested;
  $('captureAudio').disabled = !supportsAudio;
  if (!supportsAudio) $('captureAudio').checked = false;
  $('captureAudioHint').textContent = !selected
    ? 'Choose an application first.'
    : selected.display && !audioSource
      ? 'Choose an application above to include only its sound.'
      : !state.capture.audioRequested
        ? 'Enable source audio in the room before sharing.'
        : !audioSource?.audio
          ? state.nativeAudioSupported
            ? 'Scoped audio is unavailable for this window. Choose the application that is playing sound.'
            : 'Application audio needs Windows build 20348+ on x64. Your screen can still be shared.'
          : 'Only this application and its child processes. Other apps stay private.';
  for (const [id, type] of [
    ['windowsTab', 'window'],
    ['displaysTab', 'screen'],
  ]) {
    $(id).classList.toggle('active', type === sourceType);
    $(id).setAttribute('aria-pressed', String(type === sourceType));
  }
}

async function command(name, payload) {
  const result = await window.picker.command(name, payload);
  if (!result?.ok) {
    $('pickerError').textContent = result?.error || 'Could not select this source.';
    $('pickerError').hidden = false;
  }
  return result;
}
for (const [id, type] of [
  ['windowsTab', 'window'],
  ['displaysTab', 'screen'],
])
  $(id).addEventListener('click', () => {
    sourceType = type;
    updateSources();
  });
for (const id of ['captureCancel', 'captureCancelX'])
  $(id).addEventListener('click', () => command('cancel'));
$('displayAudioSource').addEventListener('change', () => {
  updateSources();
  if (!$('captureAudio').disabled) $('captureAudio').checked = true;
});
$('captureConfirm').addEventListener('click', async () => {
  $('captureConfirm').disabled = true;
  const result = await command('select', {
    requestId: state.capture.id,
    sourceId,
    audio: $('captureAudio').checked,
    audioSourceId: $('displayAudioSource').value,
  });
  if (!result?.ok) updateSources();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') command('cancel');
});
command('ready').then((result) => {
  if (!result?.capture) return;
  state = { capture: result.capture, nativeAudioSupported: result.capture.nativeAudioSupported };
  for (const app of state.capture.sources.filter((item) => !item.display && item.audio)) {
    const option = document.createElement('option');
    option.value = app.id;
    option.textContent = app.name;
    $('displayAudioSource').append(option);
  }
  updateSources();
  $('windowsTab').focus();
});

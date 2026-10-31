/* Cinematic viewing controls: unobstructed video, accessible side controls.
 * Kept separate from the campaign script so multiplayer, narration and skip
 * still use their existing event handlers. No server changes.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const story = $('story');
  const video = $('storyVideo');
  const card = story && story.querySelector('.card');
  const storyIndex = $('storyIndex');
  const playButton = $('storyPlay');
  const skipButton = $('storySkip');
  const soundButton = $('storySound');
  const voiceButton = $('storyVoice');
  if (!story || !video || !card || !storyIndex || !playButton ||
      !skipButton || !soundButton || !voiceButton) return;

  const style = document.createElement('style');
  style.textContent = [
    '#story .card{transition:opacity .32s ease,transform .32s ease,visibility .32s ease}',
    '#story.story-clean .card{opacity:0;visibility:hidden;pointer-events:none;transform:translateY(12px)}',
    '#story.story-clean::before{background:linear-gradient(0deg,#07060c55 0%,transparent 48%)}',
    '#story .story-side-controls{position:absolute;z-index:8;right:max(9px,env(safe-area-inset-right));top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:10px;align-items:center;pointer-events:auto}',
    '#story .story-side-controls button{width:44px;height:44px;display:grid;place-items:center;padding:0;border-radius:14px;background:#120f1cba;border:1px solid #bda577b0;color:#f6e8d1;font-size:22px;line-height:1;backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);touch-action:manipulation;-webkit-tap-highlight-color:transparent}',
    '#story .story-side-controls button:hover,#story .story-side-controls button:focus-visible{border-color:#efbe55;outline:2px solid #efbe5544;outline-offset:2px}',
    '#story .story-side-controls button:disabled{opacity:.45;cursor:not-allowed}',
    '#story #storySideDetails[aria-pressed="true"]{background:#77521bdc;border-color:#efbe55}',
    '@media(max-height:460px){#story .story-side-controls{gap:6px;right:max(6px,env(safe-area-inset-right))}#story .story-side-controls button{width:38px;height:38px;font-size:19px;border-radius:11px}}',
    '@media(prefers-reduced-motion:reduce){#story .card{transition:none}}'
  ].join('\n');
  document.head.appendChild(style);

  const toolbar = document.createElement('div');
  toolbar.className = 'story-side-controls';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Cinematic controls');
  toolbar.innerHTML =
    '<button type="button" id="storySideVolume" title="Enable video sound" aria-label="Enable video sound">🔇</button>' +
    '<button type="button" id="storySideSkip" title="Skip cinematic sequence" aria-label="Skip cinematic sequence">⏭</button>' +
    '<button type="button" id="storySideDetails" title="Show story details" aria-label="Show story details" aria-pressed="false">☷</button>';
  story.appendChild(toolbar);
  const volume = $('storySideVolume');
  const skip = $('storySideSkip');
  const details = $('storySideDetails');

  let timer = null;
  let pinned = false;
  let activeBefore = false;

  const visible = () => !story.classList.contains('hidden');
  const isVideo = () => !video.classList.contains('hidden');
  const needsPlay = () => !playButton.classList.contains('hidden');

  function cancelTimer() {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  }
  function setPanel(open) {
    story.classList.toggle('story-clean', !open);
    card.inert = !open;
    card.setAttribute('aria-hidden', String(!open));
    details.textContent = open ? '✕' : '☷';
    details.setAttribute('aria-pressed', String(open));
    const label = open ? 'Hide story details' : 'Show story details';
    details.setAttribute('aria-label', label);
    details.title = label;
  }
  function updateVolume() {
    const target = isVideo() ? soundButton : voiceButton;
    const on = target.textContent.includes(': ON');
    volume.textContent = on ? '🔊' : '🔇';
    const label = (isVideo() ? 'Video audio' : 'Narration') + (on ? ': on (tap to mute)' : ': off (tap to enable)');
    volume.setAttribute('aria-label', label);
    volume.title = label;
    skip.disabled = skipButton.disabled;
  }
  function scheduleHide() {
    cancelTimer();
    if (!visible() || pinned || !isVideo() || video.paused || needsPlay()) return;
    timer = setTimeout(() => {
      timer = null;
      if (visible() && !pinned && isVideo() && !video.paused && !needsPlay()) setPanel(false);
    }, 4200);
  }
  function newScene() {
    pinned = false;
    cancelTimer();
    setPanel(true);
    updateVolume();
    scheduleHide();
  }
  function visibilityChanged() {
    const isActive = visible();
    if (isActive !== activeBefore) {
      activeBefore = isActive;
      if (isActive) newScene();
      else { cancelTimer(); pinned = false; setPanel(true); }
    }
  }
  function reactToPlayButton() {
    if (visible() && needsPlay()) {
      cancelTimer();
      pinned = false;
      setPanel(true);  // Mobile autoplay blocked: never conceal PLAY VIDEO
    } else if (visible()) scheduleHide();
  }

  volume.addEventListener('click', () => {
    (isVideo() ? soundButton : voiceButton).click();
    updateVolume();
  });
  skip.addEventListener('click', () => {
    if (!skipButton.disabled) skipButton.click(); // keep existing multiplayer seen/skip logic
  });
  details.addEventListener('click', () => {
    pinned = story.classList.contains('story-clean');
    cancelTimer();
    setPanel(pinned);
    if (!pinned) scheduleHide();
  });

  video.addEventListener('playing', scheduleHide);
  video.addEventListener('pause', () => { cancelTimer(); });
  storyIndex.addEventListener('click', () => {}); // index itself remains non-interactive
  new MutationObserver(() => newScene()).observe(storyIndex, { childList: true, subtree: true, characterData: true });
  new MutationObserver(visibilityChanged).observe(story, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(reactToPlayButton).observe(playButton, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(updateVolume).observe(soundButton, { childList: true, subtree: true });
  new MutationObserver(updateVolume).observe(voiceButton, { childList: true, subtree: true });
  new MutationObserver(updateVolume).observe(skipButton, { attributes: true, attributeFilter: ['disabled'] });

  updateVolume();
  visibilityChanged();
  window.__chaminukaCinematicControls = { showDetails: () => { pinned = true; cancelTimer(); setPanel(true); } };
})();

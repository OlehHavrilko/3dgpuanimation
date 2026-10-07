import { content } from '../content';
import { Voice } from './voice';

/** The nav button for spoken narration: hidden where speech synthesis does not exist. */
export function setupVoice() {
  const voice = new Voice();
  const button = document.getElementById('nav-voice') as HTMLButtonElement;
  const paint = () => {
    button.classList.toggle('on', voice.enabled);
    button.textContent = voice.enabled ? content.ui.voice.on : content.ui.voice.off;
    button.setAttribute('aria-pressed', String(voice.enabled));
  };
  if (!voice.supported) {
    button.hidden = true;
    return voice;
  }
  const toggle = voice.toggle.bind(voice);
  voice.toggle = () => {
    const on = toggle();
    paint();
    return on;
  };
  button.addEventListener('click', () => voice.toggle());
  paint();
  return voice;
}

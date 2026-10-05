import { Ambience } from '../core/Audio';
import { content } from '../content';

const STORAGE_KEY = 'gpu-atom:sound-invite';

/**
 * Ambient sound bed: the nav toggle, the M key hook and the one-time invitation shown when
 * the descent starts (a user gesture, so audio may start). The choice is remembered.
 */
export function setupSound() {
  const ambience = new Ambience();
  const button = document.getElementById('nav-sound') as HTMLButtonElement;
  const invite = document.getElementById('sound-invite')!;
  let seen = false;
  try {
    seen = localStorage.getItem(STORAGE_KEY) === 'dismissed';
  } catch {
    /* private mode / storage disabled: just show it */
  }
  const remember = () => {
    seen = true;
    try {
      localStorage.setItem(STORAGE_KEY, 'dismissed');
    } catch {
      /* ignore */
    }
  };
  const toggle = () => {
    const on = ambience.toggle();
    button.classList.toggle('on', on);
    button.textContent = on ? content.ui.sound.on : content.ui.sound.off;
  };
  button.addEventListener('click', toggle);

  let timer = 0;
  const hideInvite = () => {
    window.clearTimeout(timer);
    invite.classList.remove('on');
    invite.setAttribute('aria-hidden', 'true');
  };
  /** Starting the descent is a user gesture: the one good moment to offer the sound bed. */
  const offer = () => {
    if (seen || ambience.enabled) return;
    // Let the Act I card land first: the invitation is the second beat of the opening.
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (seen || ambience.enabled) return;
      invite.classList.add('on');
      invite.setAttribute('aria-hidden', 'false');
      timer = window.setTimeout(hideInvite, 12000);
    }, 2600);
  };
  document.getElementById('si-on')!.addEventListener('click', () => {
    hideInvite();
    remember();
    if (!ambience.enabled) toggle();
    ambience.whoosh();
  });
  document.getElementById('si-off')!.addEventListener('click', () => {
    hideInvite();
    remember();
  });

  return {
    ambience,
    offer,
    /** M key: toggle, and an explicit "on" counts as an answer to the invitation. */
    toggleFromKey() {
      toggle();
      if (ambience.enabled) remember();
    },
  };
}

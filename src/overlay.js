(() => {
  const $ = (id) => document.getElementById(id);
  const plane = $('plane'), stage = $('stage'), bubble = $('bubble'), buttons = $('buttons');
  let cfg = null, busy = false;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // tiny chime via WebAudio (no asset files)
  function chime(notes = [660, 880, 1320]) {
    if (!cfg?.sound) return;
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      notes.forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = f;
        const t = ac.currentTime + i * 0.12;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.12, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.55);
      });
    } catch {}
  }

  // Only the card + buttons capture the mouse; everything else is click-through.
  const cap = (on) => window.api?.interactive(on);
  [bubble, buttons].forEach((el) => {
    el.addEventListener('mouseenter', () => cap(true));
    el.addEventListener('mouseleave', () => cap(false));
  });

  let leaving = false;
  const wrap = $('buddyWrap');
  async function leave() {
    if (leaving) return; leaving = true;
    cap(false);
    plane.style.display = 'none';
    bubble.classList.add('fade'); buttons.classList.add('fade');   // card + buttons vanish at once
    await sleep(250);
    wrap.classList.remove('walkIn'); wrap.classList.add('walkOut'); // walk back off screen
    await sleep(2150);
    window.api?.done();
  }

  // One click -> record the answer and vanish immediately.
  function answer(action) {
    if (busy) return; busy = true;
    window.api?.respond(action);
    leave();
  }
  $('yes').addEventListener('click', () => answer('yes'));
  $('later').addEventListener('click', () => answer('snooze'));

  async function play(data) {
    cfg = data;
    $('msg').innerHTML = `Time to drink water, <b>${esc(data.userName)}</b>!`;
    $('sub').textContent = '1 glass';
    $('later').textContent = `Snooze ${data.snoozeMinutes}m`;

    if (data.buddyImg) {
      const img = document.createElement('img');
      img.id = 'buddyImg'; img.alt = '';
      img.src = data.buddyImg;
      const svg = $('buddy'); svg.replaceWith(img);
    }

    if (data.plane) {
      $('bannerText').textContent = `Time to hydrate, ${data.userName}!`;
      plane.classList.remove('hidden'); plane.classList.add('fly'); chime([523, 659, 784]);
      await sleep(1500);
    }
    stage.classList.remove('hidden'); stage.classList.add('show');
    wrap.classList.add('walkIn');                 // walks in from the right edge
    await sleep(2350);                            // ...and stops
    wrap.classList.remove('walkIn'); wrap.style.transform = 'translateX(0)';
    bubble.classList.add('pop'); buttons.classList.add('show');
    if (!data.plane) chime([523, 659, 784]);
  }

  if (window.api) {
    window.api.onShow(play);
    window.api.onLeave(leave);
  } else {
    window.__play = play;
  }
})();

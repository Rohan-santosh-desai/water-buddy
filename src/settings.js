(async () => {
  const $ = (id) => document.getElementById(id);
  const PRESETS = [20, 30, 45, 60, 90];
  const c = await window.api.getConfig();

  $('today').textContent = `Today: ${c.count} / ${c.dailyGoal} glasses`;
  $('interval').value = c.intervalMinutes;
  $('snooze').value = c.snoozeMinutes;
  $('auto').value = c.autoDismissSeconds;
  $('hs').value = c.activeHours.start;
  $('he').value = c.activeHours.end;
  $('goal').value = c.dailyGoal;
  $('name').value = c.userName;
  $('plane').checked = c.plane;
  $('sound').checked = c.sound;
  $('login').checked = c.openAtLogin;

  function drawChips() {
    const cur = Number($('interval').value);
    $('chips').innerHTML = '';
    PRESETS.forEach((m) => {
      const b = document.createElement('button');
      b.className = 'chip' + (cur === m ? ' on' : ''); b.textContent = `${m}m`;
      b.onclick = () => { $('interval').value = m; drawChips(); };
      $('chips').appendChild(b);
    });
  }
  $('interval').addEventListener('input', drawChips);
  drawChips();

  const read = () => ({
    userName: $('name').value.trim(),
    intervalMinutes: $('interval').value,
    snoozeMinutes: $('snooze').value,
    autoDismissSeconds: $('auto').value,
    activeHours: { start: $('hs').value, end: $('he').value },
    dailyGoal: $('goal').value,
    plane: $('plane').checked,
    sound: $('sound').checked,
    openAtLogin: $('login').checked,
  });
  const flash = (t) => { $('status').textContent = t; setTimeout(() => ($('status').textContent = ''), 2500); };

  $('pick').onclick = async () => { if (await window.api.pickImage()) flash('Character updated. Hit Preview to see it.'); };
  $('reset').onclick = async () => { await window.api.resetImage(); flash('Back to the default character.'); };

  $('save').onclick = async () => { await window.api.setConfig(read()); flash(`Saved. Next reminder in ${$('interval').value} min.`); };
  $('test').onclick = async () => { await window.api.setConfig(read()); window.api.test(); };
})();

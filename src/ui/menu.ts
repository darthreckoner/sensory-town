// Global menu: the round 🏠 button top-left on every scene (except the
// profile picker). Big nav cards + settings + share/import island.
import { scenes, type SceneName } from '../core/scene';
import { store } from '../core/store';
import { bus } from '../core/events';
import { tuning } from '../tuning';
import { audio } from '../juice/audio';
import { exportTown, pickTownFile, applyImportedTown } from '../core/share';
import { el, button, sheet, confirmDialog, toast, bindTap } from './ui';
import { charmCount, charmTotal } from '../core/unlocks';
import { initReveal } from './reveal';
import { initLayoutChecks } from './layoutcheck';

let menuBtn: HTMLButtonElement;

export function initMenu(): void {
  const root = document.getElementById('ui')!;
  menuBtn = button(null, { icon: '☰', cls: 'round tl', tap: 'soft' }, () => openMenu());
  menuBtn.style.zIndex = '30';
  menuBtn.id = 'menu-btn';
  root.appendChild(menuBtn);
  scenes.sceneHooks.push((s) => {
    menuBtn.style.display = s.showMenuButton ? '' : 'none';
  });
  initReveal(); // v3 locker: the unlock reveal card
  if (import.meta.env.DEV) initLayoutChecks(); // window.__layout (phone layout checks)
}

// ── v3 locker ── the ☰ menu: six big cards (Island · Locker · Build · Studio · Audio · Island swap), Fortnite-style.
type NavId = 'town' | 'dressup' | 'build' | 'workshop' | 'audio' | 'share';
const NAV: { id: NavId; icon: string; label: string; sub: string; color: string }[] = [
  { id: 'town', icon: '🏝️', label: 'Island', sub: 'Play', color: 'linear-gradient(180deg,#35d6ff,#2f6bff)' },
  { id: 'dressup', icon: '🧥', label: 'Locker', sub: 'Outfits & gear', color: 'linear-gradient(180deg,#b27cff,#7a35ff)' },
  { id: 'build', icon: '🏗️', label: 'Build', sub: 'Wood · brick · metal', color: 'linear-gradient(180deg,#ffd84a,#ff8a1f)' },
  { id: 'workshop', icon: '🎬', label: 'Studio', sub: 'Squish · slime · wax', color: 'linear-gradient(180deg,#ff6fb0,#e0287a)' },
  { id: 'audio', icon: '🔊', label: 'Audio', sub: 'Music & sounds', color: 'linear-gradient(180deg,#5de6a8,#16b27a)' },
  { id: 'share', icon: '📦', label: 'Island swap', sub: 'Share · import', color: 'linear-gradient(180deg,#8fa0ff,#4a5cff)' },
];

export function openMenu(): void {
  sheet((body, close) => {
    const head = el('div', 'row', body);
    head.style.justifyContent = 'space-between';
    head.style.marginBottom = '14px';
    const who = el('div', '', head);
    el('h2', '', who, `Hey, ${escapeHtml(store.profile.name)}!`).style.margin = '0';
    el('div', 'label', who, `💎 ${charmCount()} / ${charmTotal()} charms`);
    button(head, { icon: '✕', cls: 'round', tap: 'back' }, close);

    const grid = el('div', 'grid-nav', body);
    const cur = scenes.current?.name;
    for (const n of NAV) {
      const c = el('button', `navcard${(n.id === cur || (n.id === 'build' && false)) ? ' here' : ''}`, grid);
      c.style.background = n.color;
      el('span', 'ico', c, n.icon);
      el('span', '', c, n.label);
      el('span', 'sub', c, n.sub);
      bindTap(c, () => {
        bus.emit('uiTap', { kind: 'big' });
        if (n.id === 'audio') {
          close();
          openSettings();
          return;
        }
        if (n.id === 'share') {
          close();
          openShareSheet();
          return;
        }
        close();
        // ── v3 build ── "Build" is build mode in the world now (the separate Build scene is retired from the main flow)
        if (n.id === 'build') {
          if (scenes.current?.name === 'town') bus.emit('buildToggle', { on: true });
          else void scenes.go('town').then(() => bus.emit('buildToggle', { on: true }));
          return;
        }
        if (scenes.current?.name !== n.id) void scenes.go(n.id);
      });
    }

    const row = el('div', 'row wrap', body);
    row.style.marginTop = '20px';
    row.style.justifyContent = 'center';
    button(row, { icon: '👤', label: 'Switch player' }, () => {
      close();
      void scenes.go('picker');
    });
  });
}

/** Share my island (a file you can AirDrop / save) or load a friend's. */
export function openShareSheet(): void {
  sheet((body, close) => {
    const head = el('div', 'row', body);
    head.style.justifyContent = 'space-between';
    head.style.marginBottom = '14px';
    el('h2', '', head, 'Island swap').style.margin = '0';
    button(head, { icon: '✕', cls: 'round', tap: 'back' }, close);
    el('p', 'label', body, 'Send your island to a friend’s iPad, or load theirs. Builds and decor come along.');
    const row = el('div', 'row wrap', body);
    row.style.marginTop = '14px';
    row.style.justifyContent = 'center';
    button(row, { icon: '📤', label: 'Share my island', cls: 'big blue' }, async () => {
      const r = await exportTown();
      if (r !== 'cancelled') toast(r === 'shared' ? 'Island shared 📤' : 'Island saved to Files 📁');
    });
    button(row, { icon: '📥', label: 'Import an island', cls: 'big' }, async () => {
      const data = await pickTownFile();
      if (!data) {
        toast("That file isn't an island file");
        return;
      }
      const ok = await confirmDialog('Replace this island with the new one?', 'Yes, replace', 'Keep mine', '🏝️');
      if (!ok) return;
      applyImportedTown(data);
      close();
      toast('New island loaded 🏝️');
      void scenes.go(store.data.activeProfileId ? 'town' : 'picker');
    });
  });
}

export function openSettings(): void {
  sheet((body, close) => {
    el('h2', '', body, 'Audio');
    const s = store.data.settings;
    const slider = (label: string, value: number, set: (v: number) => void) => {
      const r = el('div', 'row', body);
      r.style.justifyContent = 'space-between';
      el('div', 'label', r, label).style.minWidth = '150px';
      const input = el('input', 'slider', r) as HTMLInputElement;
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.05';
      input.value = String(value);
      input.addEventListener('input', () => set(parseFloat(input.value)));
      input.addEventListener('change', () => bus.emit('uiTap', { kind: 'soft' }));
    };
    slider('Master', s.master, (v) => store.update((d) => (d.settings.master = v)));
    slider('Effects', s.sfx, (v) => store.update((d) => (d.settings.sfx = v)));
    slider('Music', s.music, (v) => store.update((d) => (d.settings.music = v)));
    const r = el('div', 'row', body);
    r.style.marginTop = '8px';
    const tog = button(r, { icon: s.musicInWorkshop ? '✅' : '⬜', label: 'Music in Studio' }, () => {
      store.update((d) => (d.settings.musicInWorkshop = !d.settings.musicInWorkshop));
      tog.querySelector('.ico')!.textContent = store.data.settings.musicInWorkshop ? '✅' : '⬜';
    });
    el('p', 'label', body, 'No sound? Turn off silent mode on the iPad and turn the volume up.');
    const done = el('div', 'row', body);
    done.style.justifyContent = 'center';
    button(done, { label: 'Done', cls: 'primary big' }, close);
  });
}

/** Push saved settings into the tuning + audio engine (called on change). */
export function syncSettings(): void {
  const s = store.data.settings;
  tuning.audio.master = s.master;
  tuning.audio.sfx = s.sfx;
  tuning.audio.music = s.music;
  tuning.audio.musicInWorkshop = s.musicInWorkshop;
  audio.applyVolumes();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
export { escapeHtml };

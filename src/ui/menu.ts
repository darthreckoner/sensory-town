// Global menu: the round 🏠 button top-left on every scene (except the
// profile picker). Big nav cards + settings + share/import town.
import { scenes, type SceneName } from '../core/scene';
import { store } from '../core/store';
import { bus } from '../core/events';
import { tuning } from '../tuning';
import { audio } from '../juice/audio';
import { exportTown, pickTownFile, applyImportedTown } from '../core/share';
import { el, button, sheet, confirmDialog, toast, bindTap } from './ui';

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
}

const NAV: { scene: SceneName; icon: string; label: string; color: string }[] = [
  { scene: 'town', icon: '🏙️', label: 'Town', color: 'linear-gradient(135deg,#00d4ff,#3d6bff)' },
  { scene: 'build', icon: '🏠', label: 'Build', color: 'linear-gradient(135deg,#ffc93c,#ff8a3d)' },
  { scene: 'workshop', icon: '🎬', label: 'Studio', color: 'linear-gradient(135deg,#ff2e88,#7c4dff)' },
  { scene: 'dressup', icon: '🕶️', label: 'Style', color: 'linear-gradient(135deg,#7c4dff,#3a1fa8)' },
];

export function openMenu(): void {
  sheet((body, close) => {
    const head = el('div', 'row', body);
    head.style.justifyContent = 'space-between';
    head.style.marginBottom = '14px';
    el('h2', '', head, `Hey, ${escapeHtml(store.profile.name)} 👋`).style.margin = '0';
    button(head, { icon: '✕', cls: 'round', tap: 'back' }, close);

    const grid = el('div', 'grid-nav', body);
    for (const n of NAV) {
      const c = el('button', 'navcard', grid);
      c.style.background = n.color;
      el('span', 'ico', c, n.icon);
      el('span', '', c, n.label);
      if (scenes.current?.name === n.scene) c.style.outline = '6px solid #fff';
      bindTap(c, () => {
        bus.emit('uiTap', { kind: 'big' });
        close();
        if (scenes.current?.name !== n.scene) void scenes.go(n.scene);
      });
    }

    const row = el('div', 'row wrap', body);
    row.style.marginTop = '18px';
    row.style.justifyContent = 'center';
    button(row, { icon: '👤', label: 'Switch player' }, () => {
      close();
      void scenes.go('picker');
    });
    button(row, { icon: '🔊', label: 'Audio' }, () => {
      close();
      openSettings();
    });
    button(row, { icon: '📤', label: 'Share town' }, async () => {
      const r = await exportTown();
      if (r !== 'cancelled') toast(r === 'shared' ? 'Town shared 📤' : 'Town saved to Files 📁');
    });
    button(row, { icon: '📥', label: 'Import town' }, async () => {
      const data = await pickTownFile();
      if (!data) {
        toast("That file isn't a town file");
        return;
      }
      const ok = await confirmDialog('Replace this town with the new one?', 'Yes, replace', 'Keep mine', '🏘️');
      if (!ok) return;
      applyImportedTown(data);
      close();
      toast('New town loaded 🏙️');
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

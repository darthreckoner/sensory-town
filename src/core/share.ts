// Export / import the whole shared town + all profiles as one JSON file.
// Used to swap towns between the two iPads over AirDrop / Files.
import { store } from './store';
import { bus } from './events';
import { SAVE_VERSION, type SaveData } from './model';

export async function exportTown(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  await store.flush();
  const payload = { app: 'sensory-town', exportedAt: new Date().toISOString(), ...structuredClone(store.data) };
  const json = JSON.stringify(payload);
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `sensory-town-${stamp}.json`;
  const file = new File([json], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Sensory Town', text: 'Our town!' });
      bus.emit('townExported', {});
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled';
      // fall through to download
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  bus.emit('townExported', {});
  return 'downloaded';
}

/** Opens a file picker; resolves with parsed save data (not yet applied). */
export function pickTownFile(): Promise<SaveData | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json,text/plain';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      input.remove();
      if (!f) return resolve(null);
      try {
        const data = JSON.parse(await f.text());
        if (!data || !Array.isArray(data.profiles) || !data.town) return resolve(null);
        resolve(data as SaveData);
      } catch {
        resolve(null);
      }
    });
    input.click();
  });
}

export function applyImportedTown(data: SaveData): void {
  const activeName = store.profile?.name;
  const next = structuredClone(data);
  next.version = Math.min(next.version ?? 1, SAVE_VERSION);
  // keep this device's settings
  next.settings = store.data.settings;
  // try to keep the same kid active (match by name), otherwise go back to the picker
  const same = next.profiles.find((p) => p.name === activeName);
  next.activeProfileId = same?.id ?? null;
  store.replaceAll(next);
  bus.emit('townImported', {});
}

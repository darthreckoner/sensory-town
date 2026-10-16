// The single in-memory source of truth for saved data. Mutate via
// store.update(fn) — that schedules an autosave and notifies listeners.
import type { Profile, SaveData, Creation, House } from './model';
import { emptySave, makeProfile } from './model';
import { loadRaw, migrate, writeRaw, requestPersistence } from './save';
import { tuning } from '../tuning';

type Listener = (data: SaveData) => void;

class Store {
  data: SaveData = emptySave(tuning.app.defaultProfileNames);
  private listeners = new Set<Listener>();
  private saveTimer: number | null = null;

  async load(): Promise<void> {
    const raw = await loadRaw();
    this.data = migrate(raw);
    if (this.data.profiles.length === 0) {
      this.data.profiles = tuning.app.defaultProfileNames.map((n, i) => makeProfile(n, i));
    }
    void requestPersistence();
    if (!raw) await writeRaw(this.data);
  }

  /** Apply a change and autosave (debounced). */
  update(fn: (d: SaveData) => void): void {
    fn(this.data);
    this.scheduleSave();
    for (const l of this.listeners) l(this.data);
  }

  onChange(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  scheduleSave(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void writeRaw(this.data);
    }, tuning.app.autosaveDebounceMs);
  }

  async flush(): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await writeRaw(this.data);
  }

  /** Replace everything (used by Import Town). */
  replaceAll(next: SaveData): void {
    this.data = migrate(next);
    this.scheduleSave();
    for (const l of this.listeners) l(this.data);
  }

  // ── Convenience accessors ──
  get profile(): Profile {
    const p = this.data.profiles.find((x) => x.id === this.data.activeProfileId);
    return p ?? this.data.profiles[0];
  }

  profileById(id: string): Profile | undefined {
    return this.data.profiles.find((p) => p.id === id);
  }

  setActiveProfile(id: string): void {
    this.update((d) => {
      d.activeProfileId = id;
    });
  }

  addProfile(name: string): Profile | null {
    if (this.data.profiles.length >= tuning.app.maxProfiles) return null;
    const p = makeProfile(name, this.data.profiles.length);
    this.update((d) => d.profiles.push(p));
    return p;
  }

  addCreation(c: Creation): void {
    this.update(() => {
      this.profile.creations.unshift(c);
    });
  }

  /** Find a creation anywhere (houses can display their owner's creations). */
  creationById(id: string): Creation | undefined {
    for (const p of this.data.profiles) {
      const c = p.creations.find((x) => x.id === id);
      if (c) return c;
    }
    return undefined;
  }

  houseOnPlot(plot: number): House | undefined {
    return this.data.town.houses.find((h) => h.plot === plot);
  }
}

export const store = new Store();

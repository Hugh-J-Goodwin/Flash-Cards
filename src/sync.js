import {empty, validate} from './model.js';

const PREFIX = 'study-space-v2:';
export const libraryKey = owner => PREFIX + (owner || 'guest');
export const freshSnapshot = () => ({data: empty(), version: null, dirty: false, revision: 0});

// The old shared library is preserved as a backup, never assigned to an account silently.
export function readSnapshot(storage, owner) {
  const raw = storage.getItem(libraryKey(owner));
  if (raw) {
    const s = JSON.parse(raw);
    validate(s.data);
    if (!(s.version === null || Number.isSafeInteger(s.version) && s.version > 0) || typeof s.dirty !== 'boolean' || !Number.isSafeInteger(s.revision) || s.revision < 0) throw Error('Invalid saved library metadata. Export a backup before restoring it.');
    return s;
  }
  if (!owner) {
    const legacy = storage.getItem('study-space-v1');
    if (legacy) return {...freshSnapshot(), data: validate(JSON.parse(legacy))};
  }
  return freshSnapshot();
}

export class LibraryStore {
  constructor(storage) { this.storage = storage; this.owner = null; this.snapshot = freshSnapshot(); this.error = ''; this.load(null); }
  load(owner) {
    this.owner = owner;
    this.error = '';
    try { this.snapshot = readSnapshot(this.storage, owner); }
    catch (e) { this.snapshot = freshSnapshot(); this.error = `Saved library could not be read: ${e.message}`; }
  }
  write(snapshot) {
    this.storage.setItem(libraryKey(this.owner), JSON.stringify(snapshot));
    this.snapshot = snapshot;
  }
  save(data) {
    if (this.error) throw Error(this.error);
    validate(data);
    const disk = readSnapshot(this.storage, this.owner);
    if (disk.revision !== this.snapshot.revision) throw Error('This library changed in another tab. Close this editor and refresh before editing. Your unsaved input is still here.');
    this.write({...this.snapshot, data, dirty: true, revision: this.snapshot.revision + 1});
  }
  // Sync responses must not erase a newer edit or another tab's local changes.
  accept(remote, expectedRevision) {
    if (readSnapshot(this.storage, this.owner).revision !== expectedRevision || this.snapshot.revision !== expectedRevision) return false;
    const data = remote ? validate(remote.data) : empty();
    this.write({data, version: remote?.version ?? null, dirty: false, revision: expectedRevision + 1});
    return true;
  }
  acknowledge(version, sentRevision) {
    const current = readSnapshot(this.storage, this.owner);
    if (current.version !== this.snapshot.version) return false;
    this.write({...current, version, dirty: current.revision !== sentRevision, revision: current.revision + 1});
    return true;
  }
}

export class SyncEngine {
  constructor({store, remote, changed = () => {}, status = () => {}, canApply = () => true}) {
    Object.assign(this, {store, remote, changed, status, canApply});
    this.generation = 0; this.busy = false; this.conflict = null; this.timer = null;
  }
  switchAccount(owner) {
    clearTimeout(this.timer); this.generation++; this.busy = false; this.conflict = null;
    this.store.load(owner); this.changed();
    this.report(owner ? 'Connecting to your library…' : 'Saved on this device');
    if (owner) this.schedule(0);
  }
  report(text) { this.status(text, this.conflict); }
  schedule(delay = 800) { clearTimeout(this.timer); if (this.store.owner) this.timer = setTimeout(() => this.run(), delay); }
  async run() {
    if (!this.store.owner || this.busy || this.store.error) return;
    if (this.conflict) { this.report('Sync paused: open Sign in to resolve conflicting versions.'); return; }
    const owner = this.store.owner, generation = this.generation;
    const current = () => generation === this.generation && owner === this.store.owner;
    this.busy = true;
    try {
      this.report('Syncing…');
      const remote = await this.remote.read(owner);
      if (!current()) return;
      // Absorb changes from another tab before comparing versions.
      if (readSnapshot(this.store.storage, owner).revision !== this.store.snapshot.revision) {
        if (!this.canApply()) { this.report('Another tab has changes. Close your editor to refresh.'); return; }
        this.store.load(owner); this.changed();
      }
      const local = this.store.snapshot;
      if (local.dirty) {
        if ((remote?.version ?? null) !== local.version) {
          this.conflict = remote || {data: empty(), version: null};
          this.report('Sync paused: another device has changes. Choose which library to keep.'); return;
        }
        const version = await this.remote.write(owner, structuredClone(local.data), local.version);
        if (!current()) return;
        if (version === null) { this.report('Another device saved first. Checking for conflicts…'); this.schedule(0); return; }
        this.store.acknowledge(version, local.revision);
        this.changed(false);
        this.report(this.store.snapshot.dirty ? 'More changes waiting to sync…' : 'All changes synced');
        if (this.store.snapshot.dirty) this.schedule();
      } else if ((remote?.version ?? null) !== local.version) {
        if (!this.canApply()) { this.report('Cloud updates waiting. Finish your editor or quiz to load them.'); return; }
        if (this.store.accept(remote, local.revision)) { this.changed(); this.report('All changes synced'); }
        else { this.report('Local changes waiting to sync…'); this.schedule(); }
      } else this.report('All changes synced');
    } catch (e) {
      if (current()) this.report(`Saved locally · sync pending: ${e.message}`);
    } finally { if (current()) this.busy = false; }
  }
  async resolve(choice) {
    if (!this.conflict || this.busy) return;
    const expected = this.conflict.version, owner = this.store.owner, generation = this.generation;
    this.busy = true;
    try {
      const latest = await this.remote.read(owner);
      if (generation !== this.generation) return;
      if ((latest?.version ?? null) !== expected) { this.conflict = latest || {data: empty(), version: null}; this.report('The cloud changed again. Review the latest backup before choosing.'); return; }
      // Preserve the version about to be replaced before either resolution.
      const backup = {local: this.store.snapshot.data, cloud: latest?.data || empty(), savedAt: Date.now()};
      this.store.storage.setItem(`study-space-conflict:${owner}`, JSON.stringify(backup));
      if (choice === 'cloud') {
        if (!this.store.accept(latest, this.store.snapshot.revision)) throw Error('Another tab changed this library. Refresh before resolving.');
      } else {
        const sent = this.store.snapshot;
        const version = await this.remote.write(owner, structuredClone(sent.data), expected);
        if (generation !== this.generation) return;
        if (version === null) throw Error('Cloud changed during resolution. Try again.');
        this.store.acknowledge(version, sent.revision);
      }
      this.conflict = null; this.changed(); this.report('All changes synced');
      if (this.store.snapshot.dirty) this.schedule();
    } catch (e) { if (generation === this.generation) this.report(`Resolution paused: ${e.message}`); }
    finally { if (generation === this.generation) this.busy = false; }
  }
}

export function supabaseRemote(client) {
  return {
    async read(owner) {
      const {data, error} = await client.from('study_libraries').select('data,version').eq('user_id', owner).maybeSingle();
      if (error) throw error;
      if (data) { validate(data.data); if (!Number.isSafeInteger(data.version) || data.version < 1) throw Error('Invalid cloud version.'); }
      return data;
    },
    async write(owner, data, version) {
      const query = version === null
        ? client.from('study_libraries').insert({user_id: owner, data, version: 1})
        : client.from('study_libraries').update({data, version: version + 1}).eq('user_id', owner).eq('version', version);
      const result = await query.select('version');
      if (result.error) { if (result.error.code === '23505') return null; throw result.error; }
      return result.data?.[0]?.version ?? null;
    }
  };
}

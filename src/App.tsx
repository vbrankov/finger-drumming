import { useEffect, useRef, useState } from 'react';
import type { Kit, Song } from './model/types';
import { useMidiStatus } from './hooks';
import KitEditor from './screens/KitEditor';
import Kits from './screens/Kits';
import Practice from './screens/Practice';
import Settings from './screens/Settings';
import SongEditor from './screens/SongEditor';
import Songs from './screens/Songs';
import ImportDialog from './components/ImportDialog';
import { applyImport, clearShareFromLocation, decodeShare, describeOutcome, planImport, shareTokenFromLocation } from './share';
import type { ImportOutcome, ImportPlan, Resolution } from './share';
import { MANUAL_URL } from './links';
import { getState, useStore } from './store';

type Screen =
  | { name: 'songs' }
  | { name: 'kits' }
  | { name: 'settings' }
  | { name: 'practice'; song: Song }
  | { name: 'edit-song'; song: Song }
  | { name: 'edit-kit'; kit: Kit; back: Screen };

function collectSongIds(p: { t: string; song?: { id?: string }; items?: unknown[] }): string[] {
  if (p.t === 'song') return p.song?.id ? [p.song.id] : [];
  if (p.t === 'pack') return (p.items as { t: string; song?: { id?: string }; items?: unknown[] }[]).flatMap(collectSongIds);
  return [];
}

const TABS: { name: 'songs' | 'kits' | 'settings'; label: string }[] = [
  { name: 'songs', label: 'Songs' },
  { name: 'kits', label: 'Kits' },
  { name: 'settings', label: 'Settings' },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'songs' });
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<ImportPlan | null>(null);
  const { kits } = useStore();
  const midi = useMidiStatus();

  function finishLinkImport(plan: ImportPlan, outcome: ImportOutcome) {
    setNotice(describeOutcome(outcome, plan));
    if (outcome.song) setScreen({ name: 'practice', song: outcome.song });
    else if (outcome.kit) setScreen({ name: 'edit-kit', kit: outcome.kit, back: { name: 'kits' } });
    else {
      // Nothing new (identical or skipped): still open what the link pointed at, if we have it.
      const s = getState().songs.find((x) => x.id === linkSongIds.current[0]);
      if (s) setScreen({ name: 'practice', song: s });
    }
  }
  const linkSongIds = useRef<string[]>([]);

  // A share link (#s=…) adds its song/kit to the library and opens it.
  useEffect(() => {
    const token = shareTokenFromLocation();
    if (!token) return;
    clearShareFromLocation();
    decodeShare(token).then((payload) => {
      if (!payload) {
        setNotice('That share link could not be read.');
        return;
      }
      const plan = planImport([payload]);
      linkSongIds.current = collectSongIds(payload);
      if (plan.conflicts.length) setPendingPlan(plan);
      else finishLinkImport(plan, applyImport(plan, {}));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const section = screen.name === 'practice' || screen.name === 'edit-song' ? 'songs' : screen.name === 'edit-kit' ? 'kits' : screen.name;

  let body;
  switch (screen.name) {
    case 'songs':
      body = <Songs onPractice={(song) => setScreen({ name: 'practice', song })} onEdit={(song) => setScreen({ name: 'edit-song', song })} />;
      break;
    case 'kits':
      body = <Kits onEdit={(kit) => setScreen({ name: 'edit-kit', kit, back: { name: 'kits' } })} />;
      break;
    case 'settings':
      body = <Settings />;
      break;
    case 'practice':
      body = <Practice key={screen.song.id} song={screen.song} onBack={() => setScreen({ name: 'songs' })} onSettings={() => setScreen({ name: 'settings' })} />;
      break;
    case 'edit-song':
      body = (
        <SongEditor
          key={screen.song.id}
          song={screen.song}
          onDone={() => setScreen({ name: 'songs' })}
          onEditKit={(kitId) => {
            const kit = kits.find((k) => k.id === kitId);
            if (kit) setScreen({ name: 'edit-kit', kit, back: screen });
          }}
        />
      );
      break;
    case 'edit-kit':
      body = <KitEditor key={screen.kit.id} kit={screen.kit} onDone={() => setScreen(screen.back)} />;
      break;
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Finger Drumming</h1>
        <nav>
          {TABS.map((t) => (
            <button key={t.name} className={section === t.name ? 'active' : ''} onClick={() => setScreen({ name: t.name } as Screen)}>
              {t.label}
            </button>
          ))}
        </nav>
        <a className="help" href={MANUAL_URL} target="_blank" rel="noreferrer" title="Manual">
          Help
        </a>
        <span className={'status' + (midi.ok ? '' : ' bad')}>
          {midi.ok ? (midi.inputs.length ? 'MIDI: ' + midi.inputs.map((i) => i.name).join(', ') : 'MIDI: no inputs') : (midi.error ?? 'MIDI…')}
        </span>
      </header>
      {notice && (
        <div className="notice" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
      {pendingPlan && (
        <ImportDialog
          conflicts={pendingPlan.conflicts.map((c) => c.conflict)}
          onCancel={() => setPendingPlan(null)}
          onDone={(res: Record<string, Resolution>) => {
            const plan = pendingPlan;
            setPendingPlan(null);
            finishLinkImport(plan, applyImport(plan, res));
          }}
        />
      )}
      <main>{body}</main>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { Kit, Pattern, Song } from './model/types';
import { useMidiStatus } from './hooks';
import KitEditor from './screens/KitEditor';
import Kits from './screens/Kits';
import Practice from './screens/Practice';
import SongEditor from './screens/SongEditor';
import Songs from './screens/Songs';
import Settings from './screens/Settings';
import PatternEditor from './screens/PatternEditor';
import Patterns from './screens/Patterns';
import ImportDialog from './components/ImportDialog';
import { applyImport, clearShareFromLocation, decodeShare, describeOutcome, planImport, shareTokenFromLocation } from './share';
import type { ImportOutcome, ImportPlan, Resolution, SharePayload } from './share';
import { MANUAL_URL } from './links';
import { getState, useStore } from './store';

type Screen =
  | { name: 'patterns' }
  | { name: 'songs' }
  | { name: 'kits' }
  | { name: 'settings' }
  | { name: 'practice'; pattern: Pattern }
  | { name: 'practice-song'; song: Song }
  | { name: 'edit-pattern'; pattern: Pattern }
  | { name: 'edit-song'; song: Song }
  | { name: 'edit-kit'; kit: Kit; back: Screen };

/** The first song / pattern id a payload refers to, for opening an item that was already present. */
function firstIds(p: SharePayload): { song?: string; pattern?: string } {
  if (p.t === 'song') return { song: p.song.id };
  if (p.t === 'pattern') return { pattern: p.pattern.id };
  if (p.t === 'pack') {
    for (const i of p.items) {
      const r = firstIds(i);
      if (r.song || r.pattern) return r;
    }
  }
  return {};
}

const TABS: { name: 'patterns' | 'songs' | 'kits' | 'settings'; label: string }[] = [
  { name: 'patterns', label: 'Patterns' },
  { name: 'songs', label: 'Songs' },
  { name: 'kits', label: 'Kits' },
  { name: 'settings', label: 'Settings' },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'patterns' });
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<ImportPlan | null>(null);
  const { kits } = useStore();
  const midi = useMidiStatus();

  function finishLinkImport(plan: ImportPlan, outcome: ImportOutcome) {
    setNotice(describeOutcome(outcome, plan));
    if (outcome.song) setScreen({ name: 'practice-song', song: outcome.song });
    else if (outcome.pattern) setScreen({ name: 'practice', pattern: outcome.pattern });
    else if (outcome.kit) setScreen({ name: 'edit-kit', kit: outcome.kit, back: { name: 'kits' } });
    else {
      // Nothing new (identical or skipped): still open what the link pointed at, if we have it.
      const st = getState();
      const song = st.songs.find((x) => x.id === linkIds.current.song);
      const pattern = st.patterns.find((x) => x.id === linkIds.current.pattern);
      if (song) setScreen({ name: 'practice-song', song });
      else if (pattern) setScreen({ name: 'practice', pattern });
    }
  }
  const linkIds = useRef<{ song?: string; pattern?: string }>({});

  // A share link (#s=…) adds its content to the library and opens it.
  useEffect(() => {
    const token = shareTokenFromLocation();
    if (!token) return;
    clearShareFromLocation();
    decodeShare(token).then((d) => {
      if (!d.ok) {
        setNotice(d.reason === 'newer' ? 'That link was made with a newer version of the app; reload to update.' : 'That share link could not be read.');
        return;
      }
      const plan = planImport([d.payload]);
      linkIds.current = firstIds(d.payload);
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

  const section =
    screen.name === 'practice' || screen.name === 'edit-pattern'
      ? 'patterns'
      : screen.name === 'practice-song' || screen.name === 'edit-song'
        ? 'songs'
        : screen.name === 'edit-kit'
          ? 'kits'
          : screen.name;

  // Practice and the editors drop the top bar to save vertical space; their own "← Back" button leads out.
  const detail = !TABS.some((t) => t.name === screen.name);

  let body;
  switch (screen.name) {
    case 'patterns':
      body = <Patterns onPractice={(pattern) => setScreen({ name: 'practice', pattern })} onEdit={(pattern) => setScreen({ name: 'edit-pattern', pattern })} />;
      break;
    case 'songs':
      body = (
        <Songs
          onPractice={(song) => setScreen({ name: 'practice-song', song })}
          onEdit={(song) => setScreen({ name: 'edit-song', song })}
        />
      );
      break;
    case 'practice-song':
      body = <Practice key={'song:' + screen.song.id} target={{ kind: 'song', song: screen.song }} onBack={() => setScreen({ name: 'songs' })} onSettings={() => setScreen({ name: 'settings' })} />;
      break;
    case 'edit-song':
      body = <SongEditor key={screen.song.id} song={screen.song} onDone={() => setScreen({ name: 'songs' })} />;
      break;
    case 'kits':
      body = <Kits onEdit={(kit) => setScreen({ name: 'edit-kit', kit, back: { name: 'kits' } })} />;
      break;
    case 'settings':
      body = <Settings />;
      break;
    case 'practice':
      body = <Practice key={screen.pattern.id} target={{ kind: 'pattern', pattern: screen.pattern }} onBack={() => setScreen({ name: 'patterns' })} onSettings={() => setScreen({ name: 'settings' })} />;
      break;
    case 'edit-pattern':
      body = (
        <PatternEditor
          key={screen.pattern.id}
          pattern={screen.pattern}
          onDone={() => setScreen({ name: 'patterns' })}
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
    <div className={'app' + (detail ? ' detail' : '')}>
      {!detail && (
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
      )}
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

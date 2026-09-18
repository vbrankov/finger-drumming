import { useEffect, useState } from 'react';
import type { Kit, Song } from './model/types';
import { useMidiStatus } from './hooks';
import KitEditor from './screens/KitEditor';
import Kits from './screens/Kits';
import Practice from './screens/Practice';
import Settings from './screens/Settings';
import SongEditor from './screens/SongEditor';
import Songs from './screens/Songs';
import { clearShareFromLocation, decodeShare, importShared, shareTokenFromLocation } from './share';
import { useStore } from './store';

type Screen =
  | { name: 'songs' }
  | { name: 'kits' }
  | { name: 'settings' }
  | { name: 'practice'; song: Song }
  | { name: 'edit-song'; song: Song }
  | { name: 'edit-kit'; kit: Kit; back: Screen };

const TABS: { name: 'songs' | 'kits' | 'settings'; label: string }[] = [
  { name: 'songs', label: 'Songs' },
  { name: 'kits', label: 'Kits' },
  { name: 'settings', label: 'Settings' },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'songs' });
  const [notice, setNotice] = useState<string | null>(null);
  const { kits } = useStore();
  const midi = useMidiStatus();

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
      const r = importShared(payload);
      if (r.song) {
        setNotice((r.added ? 'Added ' : 'You already had ') + '\u201c' + r.song.name + '\u201d' + (r.song.author ? ' by ' + r.song.author : '') + '.');
        setScreen({ name: 'practice', song: r.song });
      } else {
        setNotice((r.added ? 'Added kit ' : 'You already had kit ') + '\u201c' + r.kit.name + '\u201d.');
        setScreen({ name: 'edit-kit', kit: r.kit, back: { name: 'kits' } });
      }
    });
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
        <span className={'status' + (midi.ok ? '' : ' bad')}>
          {midi.ok ? (midi.inputs.length ? 'MIDI: ' + midi.inputs.map((i) => i.name).join(', ') : 'MIDI: no inputs') : (midi.error ?? 'MIDI…')}
        </span>
      </header>
      {notice && (
        <div className="notice" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
      <main>{body}</main>
    </div>
  );
}

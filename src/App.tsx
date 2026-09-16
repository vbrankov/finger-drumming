import { useState } from 'react';
import type { Kit, Song } from './model/types';
import { useMidiStatus } from './hooks';
import KitEditor from './screens/KitEditor';
import Kits from './screens/Kits';
import Practice from './screens/Practice';
import Settings from './screens/Settings';
import SongEditor from './screens/SongEditor';
import Songs from './screens/Songs';
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
  const { kits } = useStore();
  const midi = useMidiStatus();

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
      body = <Practice key={screen.song.id} song={screen.song} onBack={() => setScreen({ name: 'songs' })} />;
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
      <main>{body}</main>
    </div>
  );
}

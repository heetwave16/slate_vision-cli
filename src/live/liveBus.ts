import type { VizEvent } from '../engine/types';

type Listener = (ev: VizEvent) => void;

/**
 * Bridge between the live shell daemon (local-daemon/) and the app's
 * animation pipeline. The daemon emits the SAME VizEvent shapes the
 * sandbox interpreter produces, so StagePanels/FsCanvas/light-log need
 * zero changes — they just consume events from here too.
 */
const listeners = new Set<Listener>();

export const liveBus = {
  emit(ev: VizEvent) {
    for (const l of listeners) {
      try { l(ev); } catch (e) { console.error('liveBus listener', e); }
    }
  },
  on(l: Listener): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
};

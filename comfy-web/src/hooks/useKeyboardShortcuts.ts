'use client';

import { useHotkeys } from 'react-hotkeys-hook';
import { useEditorStore } from '@/stores/editorStore';
import { findItemAtTime } from '@/utils/timeline';

export function useKeyboardShortcuts() {
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const currentTime = useEditorStore((s) => s.currentTime);
  const splitItem = useEditorStore((s) => s.splitItem);
  const removeItem = useEditorStore((s) => s.removeItem);
  const selectedItemId = useEditorStore((s) => s.selectedItemId);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const duration = useEditorStore((s) => s.duration);
  const items = useEditorStore((s) => s.items);

  const getStore = useEditorStore.getState;

  useHotkeys('space', (e) => {
    e.preventDefault();
    togglePlay();
  });

  useHotkeys('s', (e) => {
    e.preventDefault();
    const state = getStore();
    const item = findItemAtTime(state.items, state.currentTime);
    if (item) {
      splitItem(item.id, state.currentTime);
    }
  });

  useHotkeys('delete', (e) => {
    e.preventDefault();
    if (selectedItemId) {
      removeItem(selectedItemId);
    }
  });

  useHotkeys('arrowleft', (e) => {
    e.preventDefault();
    setPlaying(false);
    setCurrentTime(Math.max(0, getStore().currentTime - 1));
  });

  useHotkeys('arrowright', (e) => {
    e.preventDefault();
    setPlaying(false);
    setCurrentTime(Math.min(duration, getStore().currentTime + 1));
  });

  useHotkeys('shift+arrowleft', (e) => {
    e.preventDefault();
    setPlaying(false);
    setCurrentTime(Math.max(0, getStore().currentTime - 0.1));
  });

  useHotkeys('shift+arrowright', (e) => {
    e.preventDefault();
    setPlaying(false);
    setCurrentTime(Math.min(duration, getStore().currentTime + 0.1));
  });

  useHotkeys('ctrl+z', (e) => {
    e.preventDefault();
    getStore().undo();
  });

  useHotkeys('ctrl+shift+z', (e) => {
    e.preventDefault();
    getStore().redo();
  });
}

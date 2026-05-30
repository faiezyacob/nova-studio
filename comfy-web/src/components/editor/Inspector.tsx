'use client';

import { useEditorStore } from '@/stores/editorStore';
import { formatTime } from '@/utils/timeline';

export default function Inspector() {
  const selectedItemId = useEditorStore((s) => s.selectedItemId);
  const items = useEditorStore((s) => s.items);
  const trimItem = useEditorStore((s) => s.trimItem);
  const removeItem = useEditorStore((s) => s.removeItem);

  const selectedItem = selectedItemId ? items[selectedItemId] : null;

  if (!selectedItem) {
    return (
      <div className="shrink-0 border-t border-[#3a3936] bg-[#1f1f1d] px-4 py-3">
        <p className="text-[11px] text-[#6b6560] text-center py-2">No clip selected</p>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-[#3a3936] bg-[#1f1f1d] px-4 py-3">
      <div className="flex items-start gap-4">
        <div className="h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-black">
          {selectedItem.thumbnail ? (
            <img src={selectedItem.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-[#4a4944]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-[#bcb6aa] font-medium truncate">{selectedItem.title}</p>
          <div className="mt-1.5 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-[#6b6560] uppercase tracking-wider">In</span>
              <input
                type="number"
                min={0}
                step={0.1}
                value={Math.round(selectedItem.sourceStart * 10) / 10}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  trimItem(selectedItem.id, val, selectedItem.sourceEnd);
                }}
                className="w-14 rounded-md border border-[#3a3936] bg-[#2a2a28] px-2 py-1 text-xs text-[#edeae2] outline-none tabular-nums focus:border-[#c9a87a]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-[#6b6560] uppercase tracking-wider">Out</span>
              <input
                type="number"
                min={0}
                step={0.1}
                value={Math.round(selectedItem.sourceEnd * 10) / 10}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  trimItem(selectedItem.id, selectedItem.sourceStart, val);
                }}
                className="w-14 rounded-md border border-[#3a3936] bg-[#2a2a28] px-2 py-1 text-xs text-[#edeae2] outline-none tabular-nums focus:border-[#c9a87a]"
              />
            </div>
            <span className="text-[10px] text-[#6b6560] font-mono tabular-nums">
              {formatTime(selectedItem.duration)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 self-center">
          <button
            onClick={() => removeItem(selectedItem.id)}
            className="rounded-lg p-1.5 text-[#8b3a3a] transition hover:bg-[#3f2a27] hover:text-[#ffbeb4]"
            title="Remove clip (Delete)"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

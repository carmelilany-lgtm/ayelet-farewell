"use client";

import {
  syncProgramEndTimes,
  type ProgramItem,
} from "@/lib/site-content-defaults";

function emptyItem(time = ""): ProgramItem {
  return { time, endTime: "", title: "" };
}

function suggestNextStart(items: ProgramItem[]): string {
  const last = items[items.length - 1];
  if (!last) return "18:00";
  return last.endTime.trim() || last.time.trim() || "";
}

export function ProgramScheduleEditor({
  items,
  onChange,
}: {
  items: ProgramItem[];
  onChange: (items: ProgramItem[]) => void;
}) {
  const rows = items.length ? items : [emptyItem("18:00")];

  function commit(next: ProgramItem[], syncFromStarts = true) {
    onChange(syncFromStarts ? syncProgramEndTimes(next) : next);
  }

  function updateRow(
    index: number,
    patch: Partial<ProgramItem>,
    opts?: { syncEnds?: boolean }
  ) {
    const next = rows.map((row, i) =>
      i === index ? { ...row, ...patch } : { ...row }
    );
    // Changing a start time updates the previous item's end automatically.
    if (patch.time !== undefined && index > 0) {
      next[index - 1] = { ...next[index - 1], endTime: patch.time };
    }
    commit(next, opts?.syncEnds ?? false);
  }

  function addRow() {
    commit([...rows, emptyItem(suggestNextStart(rows))], false);
  }

  function removeRow(index: number) {
    if (rows.length <= 1) {
      commit([emptyItem("18:00")], false);
      return;
    }
    const next = rows.filter((_, i) => i !== index);
    // Re-link ends to the new neighbor starts after delete.
    commit(syncProgramEndTimes(next, { preserveLastEnd: true }), false);
  }

  return (
    <div className="schedule-editor">
      <div className="schedule-editor-head">
        <p className="schedule-editor-title">לוח זמנים</p>
        <p className="schedule-editor-hint">
          סיום מתעדכן לפי תחילת הבא, אפשר גם להשאיר ריק או לערוך ידנית
        </p>
      </div>

      <div className="schedule-editor-list">
        {rows.map((item, index) => (
          <div key={index} className="schedule-editor-row">
            <div className="schedule-editor-times">
              <label className="schedule-editor-field">
                <span>התחלה</span>
                <input
                  type="time"
                  value={item.time}
                  onChange={(e) =>
                    updateRow(index, { time: e.target.value })
                  }
                  aria-label={`שעת התחלה לפריט ${index + 1}`}
                />
              </label>
              <span className="schedule-editor-sep" aria-hidden="true">
                –
              </span>
              <label className="schedule-editor-field schedule-editor-end">
                <span>סיום (אופציונלי)</span>
                <input
                  type="time"
                  value={item.endTime}
                  onChange={(e) =>
                    updateRow(
                      index,
                      { endTime: e.target.value },
                      { syncEnds: false }
                    )
                  }
                  aria-label={`שעת סיום לפריט ${index + 1}`}
                />
              </label>
            </div>
            <label className="schedule-editor-field schedule-editor-title-field">
              <span>האירוע</span>
              <input
                type="text"
                value={item.title}
                placeholder="מה קורה בשעה הזו"
                onChange={(e) =>
                  updateRow(index, { title: e.target.value }, { syncEnds: false })
                }
                aria-label={`תיאור פריט ${index + 1}`}
              />
            </label>
            <button
              type="button"
              className="schedule-editor-remove"
              onClick={() => removeRow(index)}
              aria-label={`מחיקת פריט ${index + 1}`}
            >
              מחיקה
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="schedule-editor-add" onClick={addRow}>
        + הוספת אירוע
      </button>
    </div>
  );
}

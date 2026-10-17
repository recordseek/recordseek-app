import { usePersistedSaveToSourceBox } from '../prefs';

/** Remembered opt-in for filing new sources in the RecordSeek source-box folder. */
export function SourceBoxCheckbox() {
  const [save, setSave] = usePersistedSaveToSourceBox();
  return (
    <label className="field-hint" title="Also file this source in the RecordSeek folder of your FamilySearch Source Box">
      <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
      Save to Source Box
    </label>
  );
}

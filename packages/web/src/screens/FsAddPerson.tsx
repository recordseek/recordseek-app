import { type FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { hasPersonName } from '@recordseek/core';
import { useSession, emptyNewPerson } from '../session/SessionContext';
import { BackButton } from '../components/BackButton';
import { ForwardButton } from '../components/ForwardButton';

/**
 * fs-addperson — enter a brand-new person's vitals (Standard name template).
 * No API call here; fs-create assembles + creates the person. The legacy
 * screen's dead $scope.logout/advancedSearch bindings and the
 * $rootScope.newPerson-undefined crashes are not carried forward.
 */
export function FsAddPerson() {
  const { state, setNewPerson } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!state.newPerson) {
      setNewPerson(emptyNewPerson());
    }
  }, [state.newPerson, setNewPerson]);

  const p = state.newPerson ?? emptyNewPerson();
  // FamilySearch can't create a person without a name (opaque 400), so a name
  // is required before moving on (RECORDSEEK-EZ).
  const named = hasPersonName(p);

  function next(event: FormEvent): void {
    event.preventDefault();
    if (!named) return;
    navigate('/fs-addattach');
  }

  return (
    <main>
      <h3>Create a New Person</h3>
      <form onSubmit={next}>
        <label>
          Given Name(s)
          <input value={p.givenName} onChange={(e) => setNewPerson({ givenName: e.target.value })} />
        </label>
        <label>
          Last Names
          <input value={p.surname} onChange={(e) => setNewPerson({ surname: e.target.value })} />
        </label>
        <label>
          Gender
          <select value={p.gender} onChange={(e) => setNewPerson({ gender: e.target.value })}>
            <option value="Unknown">Unknown</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </label>

        <fieldset>
          <legend>Status</legend>
          <label>
            <input type="radio" name="status" checked={!p.living} onChange={() => setNewPerson({ living: false })} /> Deceased
          </label>
          <label>
            <input type="radio" name="status" checked={p.living} onChange={() => setNewPerson({ living: true })} /> Living
          </label>
        </fieldset>

        <label>
          Date of Birth
          <input value={p.birthDate} onChange={(e) => setNewPerson({ birthDate: e.target.value })} />
        </label>
        <label>
          Birthplace
          <input value={p.birthPlace} onChange={(e) => setNewPerson({ birthPlace: e.target.value })} />
        </label>
        <label>
          Date of Death
          <input value={p.deathDate} disabled={p.living} onChange={(e) => setNewPerson({ deathDate: e.target.value })} />
        </label>
        <label>
          Place of Death
          <input value={p.deathPlace} disabled={p.living} onChange={(e) => setNewPerson({ deathPlace: e.target.value })} />
        </label>

        {!named && <p className="field-hint">Enter at least a given name or last name to continue.</p>}
        <div className="form-footer">
          <BackButton onClick={() => navigate('/fs-search')} />
          <ForwardButton type="submit" disabled={!named}>
            Next
          </ForwardButton>
        </div>
      </form>
    </main>
  );
}

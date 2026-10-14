import { HashRouter, Routes, Route, Navigate } from 'react-router';
import { CaptureProvider } from './capture/CaptureContext';
import { SessionProvider } from './session/SessionContext';
import { Main } from './screens/Main';
import { Source } from './screens/Source';
import { AuthCheck } from './screens/AuthCheck';
import { About } from './screens/About';
import { Support } from './screens/Support';
import { Loading } from './screens/Loading';
import { ASource } from './screens/ASource';
import { FsSearch } from './screens/FsSearch';
import { FsResults } from './screens/FsResults';
import { FsAttach } from './screens/FsAttach';
import { FsCreate } from './screens/FsCreate';
import { FsComplete } from './screens/FsComplete';
import { FsAddPerson } from './screens/FsAddPerson';
import { FsAddAttach } from './screens/FsAddAttach';
import { JustCitation } from './screens/JustCitation';
import { Header } from './screens/Header';
import { OAuthGate } from './auth/OAuthGate';

export function App() {
  return (
    <CaptureProvider>
      <SessionProvider>
        <HashRouter>
          <Header />
          <OAuthGate>
            <Routes>
            <Route path="/" element={<Main />} />
            <Route path="/fs-source" element={<Source />} />
            <Route path="/auth" element={<AuthCheck />} />
            <Route path="/about" element={<About />} />
            <Route path="/support" element={<Support />} />
            <Route path="/loading" element={<Loading />} />
            <Route path="/a-source" element={<ASource />} />
            <Route path="/citation" element={<JustCitation />} />
            <Route path="/fs-search" element={<FsSearch />} />
            <Route path="/fs-results" element={<FsResults />} />
            <Route path="/fs-attach" element={<FsAttach />} />
            <Route path="/fs-create" element={<FsCreate />} />
            <Route path="/fs-complete" element={<FsComplete />} />
            <Route path="/fs-addperson" element={<FsAddPerson />} />
            <Route path="/fs-addattach" element={<FsAddAttach />} />
            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </OAuthGate>
        </HashRouter>
      </SessionProvider>
    </CaptureProvider>
  );
}

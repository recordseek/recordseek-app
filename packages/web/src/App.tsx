import { type ReactNode } from 'react';
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
import { Ancestry2 } from './screens/Ancestry2';
import { Ancestry2Search } from './screens/Ancestry2Search';
import { Ancestry2Attach } from './screens/Ancestry2Attach';
import { Ancestry2Complete } from './screens/Ancestry2Complete';
import { FsSearch } from './screens/FsSearch';
import { FsResults } from './screens/FsResults';
import { FsAttach } from './screens/FsAttach';
import { FsCreate } from './screens/FsCreate';
import { FsComplete } from './screens/FsComplete';
import { FsAddPerson } from './screens/FsAddPerson';
import { FsAddAttach } from './screens/FsAddAttach';
import { JustCitation } from './screens/JustCitation';
import { Donate } from './screens/Donate';
import { Zotero } from './screens/Zotero';
import { Geni } from './screens/Geni';
import { GeniSearch } from './screens/GeniSearch';
import { GeniResults } from './screens/GeniResults';
import { GeniAttach } from './screens/GeniAttach';
import { GeniComplete } from './screens/GeniComplete';
import { GeniFlowProvider } from './session/GeniContext';
import { isDevMode } from './devFlag';
import { isNativeApp } from './appFlag';
import { Header } from './screens/Header';
import { Announcement } from './components/Announcement';
import { OAuthGate } from './auth/OAuthGate';

/** Hidden destinations: without dev mode they bounce to the home screen. */
function DevOnly({ children }: { children: ReactNode }) {
  return isDevMode() ? children : <Navigate to="/" replace />;
}

export function App() {
  return (
    <CaptureProvider>
      <SessionProvider>
        <GeniFlowProvider>
        <HashRouter>
          <Announcement />
          <Header />
          <OAuthGate>
            <Routes>
            <Route path="/" element={<Main />} />
            <Route path="/fs-source" element={<Source />} />
            <Route path="/auth" element={<AuthCheck />} />
            <Route path="/about" element={<About />} />
            <Route path="/support" element={<Support />} />
            {/* Donations use PayPal, which App Store guideline 3.1.1 forbids
                inside the app, so the route is unavailable in the native app. */}
            <Route path="/donate" element={isNativeApp() ? <Navigate to="/" replace /> : <Donate />} />
            <Route path="/loading" element={<Loading />} />
            <Route path="/a-source" element={<ASource />} />
            <Route path="/ancestry2" element={<DevOnly><Ancestry2 /></DevOnly>} />
            <Route path="/ancestry2-search" element={<DevOnly><Ancestry2Search /></DevOnly>} />
            <Route path="/ancestry2-attach" element={<DevOnly><Ancestry2Attach /></DevOnly>} />
            <Route path="/ancestry2-complete" element={<DevOnly><Ancestry2Complete /></DevOnly>} />
            <Route path="/citation" element={<JustCitation />} />
            <Route path="/fs-search" element={<FsSearch />} />
            <Route path="/fs-results" element={<FsResults />} />
            <Route path="/fs-attach" element={<FsAttach />} />
            <Route path="/fs-create" element={<FsCreate />} />
            <Route path="/fs-complete" element={<FsComplete />} />
            <Route path="/fs-addperson" element={<FsAddPerson />} />
            <Route path="/fs-addattach" element={<FsAddAttach />} />
            <Route path="/zotero" element={<DevOnly><Zotero /></DevOnly>} />
            <Route path="/geni" element={<DevOnly><Geni /></DevOnly>} />
            <Route path="/geni-search" element={<DevOnly><GeniSearch /></DevOnly>} />
            <Route path="/geni-results" element={<DevOnly><GeniResults /></DevOnly>} />
            <Route path="/geni-attach" element={<DevOnly><GeniAttach /></DevOnly>} />
            <Route path="/geni-complete" element={<DevOnly><GeniComplete /></DevOnly>} />
            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </OAuthGate>
        </HashRouter>
        </GeniFlowProvider>
      </SessionProvider>
    </CaptureProvider>
  );
}

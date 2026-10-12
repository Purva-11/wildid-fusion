import { useState } from 'react';
import type { Animal, CameraTrapRecord, MatchCandidate, Screen } from '@/types';
import { Layout } from '@/components/Layout';
import { Dashboard } from '@/screens/Dashboard';
import { IdentifyAnimal } from '@/screens/IdentifyAnimal';
import { MatchResults } from '@/screens/MatchResults';
import { CameraTrapHistory } from '@/screens/CameraTrapHistory';
import { AnimalRegistry } from '@/screens/AnimalRegistry';
import { Verification } from '@/screens/Verification';

function App() {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [matchCandidates, setMatchCandidates] = useState<MatchCandidate[]>([]);
  const [uploadedImageUrl, setUploadedImageUrl] = useState('');
  const [historyAnimalId, setHistoryAnimalId] = useState('');
  const [verifyCandidate, setVerifyCandidate] = useState<MatchCandidate | null>(null);
  const [verifyRecord, setVerifyRecord] = useState<CameraTrapRecord | null>(null);
  const [verifyAnimal, setVerifyAnimal] = useState<Animal | null>(null);

  const navigate = (s: Screen) => {
    setScreen(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMatchFound = (candidates: MatchCandidate[], imageUrl: string) => {
    setMatchCandidates(candidates);
    setUploadedImageUrl(imageUrl);
    navigate('match-results');
  };

  const handleViewHistory = (animalId: string) => {
    setHistoryAnimalId(animalId);
    navigate('camera-trap-history');
  };

  const handleVerifyCandidate = (candidate: MatchCandidate) => {
    setVerifyCandidate(candidate);
    setVerifyAnimal(candidate.animal);
    setVerifyRecord(null);
    navigate('verification');
  };

  const handleVerifyRecord = (record: CameraTrapRecord, animal: Animal) => {
    setVerifyRecord(record);
    setVerifyAnimal(animal);
    setVerifyCandidate(null);
    navigate('verification');
  };

  return (
    <Layout currentScreen={screen} onNavigate={navigate}>
      {screen === 'dashboard' && <Dashboard onNavigate={navigate} />}
      {screen === 'identify' && (
        <IdentifyAnimal onMatchFound={handleMatchFound} onNavigate={navigate} />
      )}
      {screen === 'match-results' && (
        <MatchResults
          candidates={matchCandidates}
          uploadedImageUrl={uploadedImageUrl}
          onViewHistory={handleViewHistory}
          onVerify={handleVerifyCandidate}
          onNavigate={navigate}
        />
      )}
      {screen === 'camera-trap-history' && (
        <CameraTrapHistory
          animalId={historyAnimalId}
          onNavigate={navigate}
          onVerify={handleVerifyRecord}
        />
      )}
      {screen === 'registry' && (
        <AnimalRegistry onNavigate={navigate} onViewHistory={handleViewHistory} />
      )}
      {screen === 'verification' && (
        <Verification
          pendingCandidate={verifyCandidate}
          pendingRecord={verifyRecord}
          pendingAnimal={verifyAnimal}
          uploadedImageUrl={uploadedImageUrl}
          onNavigate={navigate}
        />
      )}
    </Layout>
  );
}

export default App;

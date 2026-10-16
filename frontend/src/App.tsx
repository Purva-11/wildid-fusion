import { useState } from 'react';
import type { Animal, CameraTrapRecord, CandidateMatch, MatchCandidate, ReIDRankingResult, Screen } from '@/types';
import { Layout } from '@/components/Layout';
import { Dashboard } from '@/screens/Dashboard';
import { IdentifyAnimal } from '@/screens/IdentifyAnimal';
import { MatchResults } from '@/screens/MatchResults';
import { CameraTrapHistory } from '@/screens/CameraTrapHistory';
import { AnimalRegistry } from '@/screens/AnimalRegistry';
import { Verification } from '@/screens/Verification';
import { API_BASE_URL } from '@/services/api';

function App() {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [matchResult, setMatchResult] = useState<ReIDRankingResult | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState('');
  const [historyAnimalId, setHistoryAnimalId] = useState('');
  const [verifyCandidate, setVerifyCandidate] = useState<MatchCandidate | null>(null);
  const [verifyRecord, setVerifyRecord] = useState<CameraTrapRecord | null>(null);
  const [verifyAnimal, setVerifyAnimal] = useState<Animal | null>(null);

  const navigate = (s: Screen) => {
    setScreen(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMatchFound = (result: ReIDRankingResult, imageUrl: string) => {
    setMatchResult(result);
    setUploadedImageUrl(imageUrl);
    navigate('match-results');
  };

  const handleViewHistory = (animalId: string) => {
    setHistoryAnimalId(animalId);
    navigate('camera-trap-history');
  };

  const handleVerifyCandidate = (candidate: CandidateMatch) => {
    const refImageId = typeof candidate.metadata.matched_reference_image_id === 'string'
      ? candidate.metadata.matched_reference_image_id
      : 'demo_zebra';
    const photoUrl = typeof candidate.metadata.photo_url === 'string'
      ? candidate.metadata.photo_url
      : `${API_BASE_URL}/static/images/${refImageId}.png`;
    const viewStr = typeof candidate.metadata.view === 'string'
      ? candidate.metadata.view
      : 'Standard profile';
    const totalSightings = typeof candidate.metadata.total_reference_images === 'number'
      ? candidate.metadata.total_reference_images
      : 1;

    const animalObj: Animal = {
      id: candidate.individual_id,
      name: candidate.animal_name || candidate.individual_id,
      species: matchResult?.species || 'Plains Zebra',
      photoUrl,
      firstSighted: '2024-01-15T08:30:00Z',
      lastSighted: '2025-10-10T14:22:00Z',
      totalSightings,
      status: 'confirmed',
      description: `Registered individual in reference gallery (${candidate.match_tier} tier match).`,
      distinguishingFeatures: [viewStr],
      habitat: 'Savanna & Woodland',
      conservationStatus: 'Near Threatened',
    };
    setVerifyCandidate(null);
    setVerifyAnimal(animalObj);
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
          result={matchResult}
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

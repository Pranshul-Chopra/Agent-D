import React, { useState, useEffect } from 'react';
import type { NavTab, UpdateData, Patient } from './types';
import Titlebar from './components/Titlebar';
import Sidebar from './components/Sidebar';
import UpdaterToast from './components/UpdaterToast';
import CommandPalette from './components/CommandPalette';
import HomeView from './views/HomeView';
import BoardView from './views/BoardView';
import DocsView from './views/DocsView';
import ChatView from './views/ChatView';
import SettingsView from './views/SettingsView';
import PatientsView from './views/PatientsView';
import ConsultationsView from './views/ConsultationsView';
import ErrorBoundary from './components/ErrorBoundary';
import WhatsNewModal from './components/WhatsNewModal';
import OnboardingModal from './components/onboarding/OnboardingModal';
import { LATEST_RELEASE } from './data/whatsNewData';
import AppBridge from './services/bridge';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('chat');
  const [previousTab, setPreviousTab] = useState<NavTab | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [updateData, setUpdateData] = useState<UpdateData>({ status: 'idle', version: LATEST_RELEASE.version });
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isWhatsNewOpen, setIsWhatsNewOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [activePatient, setActivePatient] = useState<Patient | null>(null);
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);

  const handleCloseWhatsNew = () => {
    const currentVersion = updateData.version || LATEST_RELEASE.version;
    localStorage.setItem('dc_last_seen_version', currentVersion);
    localStorage.setItem('dc_installed_version', currentVersion);
    setIsWhatsNewOpen(false);
  };

  const handleOpenWhatsNew = () => {
    setIsWhatsNewOpen(true);
  };

  // Only pop up What's New once when an update actually went through and restarted into the new version
  const checkUpdateStatusOnBoot = (liveVersion: string) => {
    try {
      const justRestartedFromUpdate = localStorage.getItem('dc_just_updated_restart') === 'true';
      const previousInstalledVersion = localStorage.getItem('dc_installed_version');
      const lastSeenVersion = localStorage.getItem('dc_last_seen_version');

      // Clear the one-time restart flag
      if (justRestartedFromUpdate) {
        localStorage.removeItem('dc_just_updated_restart');
      }

      if (!previousInstalledVersion) {
        // First-time fresh install: save baseline version without interrupting user
        localStorage.setItem('dc_installed_version', liveVersion);
        localStorage.setItem('dc_last_seen_version', liveVersion);
        return;
      }

      // An update actually went through if:
      // 1. The in-app auto-updater restarted into the new build, OR
      // 2. The binary version actually changed from a previously installed version
      const versionActuallyChanged = previousInstalledVersion !== liveVersion;
      const notYetSeenForThisVersion = lastSeenVersion !== liveVersion;

      if ((justRestartedFromUpdate || versionActuallyChanged) && notYetSeenForThisVersion) {
        // App just restarted after the update actually went through!
        setIsWhatsNewOpen(true);
        localStorage.setItem('dc_installed_version', liveVersion);
      } else {
        // Everyday normal app opening: do NOT pop up
        localStorage.setItem('dc_installed_version', liveVersion);
      }
    } catch (err) {
      console.warn('Could not check update status:', err);
    }
  };

  useEffect(() => {
    // 1. Listen for background auto-updater events via Electron contextBridge
    const unsubscribe = AppBridge.os.onUpdateStatus((data) => {
      setUpdateData(data);
    });

    // 2. Fetch updater info on boot and trigger automated background update check
    AppBridge.os.getUpdaterInfo().then((info) => {
      const liveVersion = info.version || LATEST_RELEASE.version;
      setUpdateData((prev) => ({
        ...prev,
        version: liveVersion,
        isPortable: info.isPortable,
      }));

      // Check if this boot is right after an update actually went through
      checkUpdateStatusOnBoot(liveVersion);

      // Onboarding wizard deferred - do not auto-popup on boot
      // Can be launched on demand from Settings or Help menu

      // Automatically check for updates silently on startup
      AppBridge.os.checkForUpdates();

      // Load initial patient chart from secure local context DB
      AppBridge.api.listPatients().then((res) => {
        if (res.patients && res.patients.length > 0) {
          setActivePatient(res.patients[0]);
        }
      }).catch(() => {});
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // View Transitions Navigation
  const navigateWithTransition = (tab: NavTab) => {
    if (tab === activeTab) return;
    setPreviousTab(activeTab);

    if ('startViewTransition' in document && typeof (document as any).startViewTransition === 'function') {
      (document as any).startViewTransition(() => {
        setActiveTab(tab);
      });
    } else {
      setActiveTab(tab);
    }
  };

  const handleNavigate = (tab: NavTab, projectId?: number | null) => {
    if (projectId !== undefined) {
      setSelectedProjectId(projectId);
    }
    navigateWithTransition(tab);
  };

  // Universal Global Keyboard Shortcuts Engine
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      // Allow Esc to close palette if open
      if (e.key === 'Escape' && isPaletteOpen) {
        setIsPaletteOpen(false);
        return;
      }

      // Check for modifier keys (Ctrl or Cmd)
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 'k') {
          e.preventDefault();
          e.stopPropagation();
          setIsPaletteOpen((prev) => !prev);
        } else if (key === 'b') {
          e.preventDefault();
          setIsSidebarCollapsed((prev) => !prev);
        } else if (key === '1') {
          e.preventDefault();
          navigateWithTransition('chat');
        } else if (key === '2') {
          e.preventDefault();
          navigateWithTransition('home');
        } else if (key === '3') {
          e.preventDefault();
          navigateWithTransition('patients');
        } else if (key === '4') {
          e.preventDefault();
          navigateWithTransition('documents');
        } else if (key === '5') {
          e.preventDefault();
          navigateWithTransition('board');
        } else if (key === '6') {
          e.preventDefault();
          navigateWithTransition('settings');
        }
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [isPaletteOpen, activeTab]);

  return (
    <div className="h-screen w-screen flex flex-col bg-white text-slate-900 overflow-hidden select-none">
      {/* Native Drag Titlebar */}
      <Titlebar
        activeTab={activeTab}
        version={updateData.version || '0.4.0'}
        onOpenPalette={() => setIsPaletteOpen(true)}
        onOpenWhatsNew={handleOpenWhatsNew}
      />

      {/* Main Workstation Container */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={navigateWithTransition}
          updateData={updateData}
          collapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          onOpenWhatsNew={handleOpenWhatsNew}
        />

        <main className="flex-1 h-full overflow-hidden bg-white relative">
          <ErrorBoundary fallbackTitle="Module Error">
            {activeTab === 'home' && <HomeView onNavigate={handleNavigate} />}
            {activeTab === 'patients' && (
              <PatientsView
                activePatient={activePatient}
                onSelectPatient={(p) => setActivePatient(p)}
                onNavigate={handleNavigate}
              />
            )}
            {activeTab === 'consultations' && (
              <ConsultationsView
                activePatient={activePatient}
                onSelectPatient={(p) => setActivePatient(p)}
                onNavigate={handleNavigate}
              />
            )}
            {activeTab === 'board' && (
              <BoardView
                selectedProjectId={selectedProjectId}
                onProjectChange={setSelectedProjectId}
                activePatient={activePatient}
              />
            )}
            {activeTab === 'documents' && (
              <DocsView
                activePatient={activePatient}
                onSelectPatient={(p) => setActivePatient(p)}
                onNavigate={handleNavigate}
              />
            )}
            {activeTab === 'chat' && (
              <ChatView
                inheritedTab={previousTab}
                initialProjectId={selectedProjectId}
                onClearInheritedTab={() => setPreviousTab(null)}
                activePatient={activePatient}
                onSelectPatient={(p) => setActivePatient(p)}
                onNavigate={handleNavigate}
              />
            )}
            {activeTab === 'settings' && (
              <SettingsView
                onOpenOnboarding={() => setIsOnboardingOpen(true)}
                onOpenWhatsNew={() => setIsWhatsNewOpen(true)}
              />
            )}
          </ErrorBoundary>
        </main>
      </div>

      {/* Global Command Palette (Ctrl+K / Cmd+K) */}
      <ErrorBoundary fallbackTitle="Command Palette Error">
        <CommandPalette
          isOpen={isPaletteOpen}
          onClose={() => setIsPaletteOpen(false)}
          onNavigate={handleNavigate}
          onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
          onOpenOnboarding={() => setIsOnboardingOpen(true)}
          onSelectPatient={(p) => setActivePatient(p)}
        />
      </ErrorBoundary>

      {/* First-Time Launch Onboarding Wizard */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onComplete={(newProjectId) => {
          if (newProjectId) {
            setSelectedProjectId(newProjectId);
            navigateWithTransition('board');
          }
        }}
      />

      {/* Centered What's New Dialog Box */}
      <WhatsNewModal
        isOpen={isWhatsNewOpen}
        onClose={handleCloseWhatsNew}
        activeVersion={updateData.version || LATEST_RELEASE.version}
      />

      {/* In-App Background Auto-Updater Toast */}
      <UpdaterToast data={updateData} />
    </div>
  );
};

export default App;

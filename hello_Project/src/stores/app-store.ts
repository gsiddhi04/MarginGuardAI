import { create } from 'zustand'

export type NavTab =
  | 'dashboard'
  | 'documents'
  | 'matching'
  | 'vendors'
  | 'fraud-alerts'
  | 'chat'
  | 'forecasting'

interface AppState {
  activeTab: NavTab
  setActiveTab: (tab: NavTab) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  documentCount: number
  setDocumentCount: (count: number) => void
  fraudAlertCount: number
  setFraudAlertCount: (count: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  documentCount: 0,
  setDocumentCount: (count) => set({ documentCount: count }),
  fraudAlertCount: 0,
  setFraudAlertCount: (count) => set({ fraudAlertCount: count }),
}))
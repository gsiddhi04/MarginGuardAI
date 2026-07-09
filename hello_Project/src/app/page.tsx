'use client'

import { useAppStore } from '@/stores/app-store'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { DashboardView } from '@/components/procurement/dashboard-view'
import { DocumentsView } from '@/components/procurement/documents-view'
import { MatchingView } from '@/components/procurement/matching-view'
import { VendorsView } from '@/components/procurement/vendors-view'
import { FraudAlertsView } from '@/components/procurement/fraud-alerts-view'
import { ChatView } from '@/components/procurement/chat-view'
import { ForecastingView } from '@/components/procurement/forecasting-view'

const views = {
  dashboard: DashboardView,
  documents: DocumentsView,
  matching: MatchingView,
  vendors: VendorsView,
  'fraud-alerts': FraudAlertsView,
  chat: ChatView,
  forecasting: ForecastingView,
}

export default function Home() {
  const { activeTab } = useAppStore()
  const ActiveView = views[activeTab]

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">
          <ActiveView />
        </div>
      </main>
    </div>
  )
}
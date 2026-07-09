'use client'

import React from 'react'
import { useAppStore, type NavTab } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FileText,
  GitCompareArrows,
  Users,
  AlertTriangle,
  MessageSquare,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  HardHat,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const navItems: { id: NavTab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'matching', label: '3-Way Match', icon: GitCompareArrows },
  { id: 'vendors', label: 'Vendors', icon: Users },
  { id: 'fraud-alerts', label: 'Fraud Alerts', icon: AlertTriangle },
  { id: 'chat', label: 'AI Copilot', icon: MessageSquare },
  { id: 'forecasting', label: 'Forecasting', icon: TrendingUp },
]

export function AppSidebar() {
  const { activeTab, setActiveTab, sidebarOpen, setSidebarOpen, documentCount, fraudAlertCount } = useAppStore()

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'flex flex-col border-r bg-card transition-all duration-300 h-screen sticky top-0',
          sidebarOpen ? 'w-64' : 'w-16'
        )}
      >
        {/* Logo / Brand */}
        <div className="flex items-center gap-3 px-4 h-16 border-b shrink-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
            <HardHat className="w-5 h-5" />
          </div>
          {sidebarOpen && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sm truncate">ProcureAI</span>
              <span className="text-[10px] text-muted-foreground truncate">Construction Intelligence</span>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            const showBadge = item.id === 'documents' && documentCount > 0
            const showFraudBadge = item.id === 'fraud-alerts' && fraudAlertCount > 0

            const navButton = (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  'flex items-center w-full rounded-lg text-sm font-medium transition-colors',
                  sidebarOpen ? 'px-3 py-2.5 gap-3' : 'px-0 py-2.5 justify-center',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {sidebarOpen && (
                  <span className="truncate">{item.label}</span>
                )}
                {sidebarOpen && showBadge && (
                  <Badge variant="secondary" className="ml-auto text-xs h-5 px-1.5">
                    {documentCount}
                  </Badge>
                )}
                {sidebarOpen && showFraudBadge && (
                  <Badge variant="destructive" className="ml-auto text-xs h-5 px-1.5">
                    {fraudAlertCount}
                  </Badge>
                )}
              </button>
            )

            if (!sidebarOpen) {
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>{navButton}</TooltipTrigger>
                  <TooltipContent side="right">
                    {item.label}
                    {showBadge && ` (${documentCount})`}
                    {showFraudBadge && ` (${fraudAlertCount} alerts)`}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return navButton
          })}
        </nav>

        {/* Collapse Toggle */}
        <div className="border-t p-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={cn('w-full', sidebarOpen ? 'justify-start px-3 gap-3' : 'justify-center px-0')}
          >
            {sidebarOpen ? (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span className="text-xs">Collapse</span>
              </>
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  )
}
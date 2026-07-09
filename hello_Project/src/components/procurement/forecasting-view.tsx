'use client'

import { TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function ForecastingView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Price & Demand Forecasting</h1>
        <p className="text-muted-foreground mt-1">
          AI-predicted material prices, demand forecasting, and inventory optimization
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Material Price Trends</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            <div className="text-center">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Price forecast charts</p>
              <p className="text-xs mt-1">Coming in later steps</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Demand Forecast</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            <div className="text-center">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Demand prediction charts</p>
              <p className="text-xs mt-1">Coming in later steps</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
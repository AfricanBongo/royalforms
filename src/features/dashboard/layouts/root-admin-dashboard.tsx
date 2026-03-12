import { StatCard } from '../components/stat-card'
import { SubmissionTrendChart } from '../components/submission-trend-chart'
import { GroupBreakdownChart } from '../components/group-breakdown-chart'
import { RecentInstanceList } from '../components/recent-instance-list'

import type { DashboardData } from '../use-dashboard-data'

interface RootAdminDashboardProps {
  data: DashboardData
}

export function RootAdminDashboard({ data }: RootAdminDashboardProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Row 1: Stat cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {data.stats.isLoading || !data.stats.data
          ? Array.from({ length: 4 }, (_, i) => (
              <StatCard key={i} data={undefined} isLoading={true} />
            ))
          : data.stats.data.map((stat) => (
              <StatCard key={stat.label} data={stat} isLoading={false} />
            ))}
      </div>

      {/* Row 2: Trend chart + Group breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <SubmissionTrendChart
            data={data.trend.data}
            isLoading={data.trend.isLoading}
            color="chart-1"
            title="Submission Trend"
          />
        </div>
        <div className="lg:col-span-4">
          <GroupBreakdownChart
            data={data.groupBreakdown?.data}
            isLoading={data.groupBreakdown?.isLoading ?? false}
          />
        </div>
      </div>

      {/* Row 3: Recent forms + Recent reports */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <RecentInstanceList
            title="Recent Form Instances"
            items={data.recentForms.data}
            isLoading={data.recentForms.isLoading}
            type="form"
            viewAllLink="/forms"
          />
        </div>
        <div className="lg:col-span-6">
          <RecentInstanceList
            title="Recent Report Instances"
            items={data.recentReports.data}
            isLoading={data.recentReports.isLoading}
            type="report"
            viewAllLink="/reports"
          />
        </div>
      </div>
    </div>
  )
}

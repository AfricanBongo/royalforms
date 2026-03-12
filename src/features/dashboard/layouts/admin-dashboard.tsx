import { StatCard } from '../components/stat-card'
import { SubmissionTrendChart } from '../components/submission-trend-chart'
import { GroupMembersList } from '../components/group-members-list'
import { RecentInstanceList } from '../components/recent-instance-list'

import type { DashboardData } from '../use-dashboard-data'

interface AdminDashboardProps {
  data: DashboardData
  groupId: string
}

export function AdminDashboard({ data, groupId }: AdminDashboardProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Row 1: Stat cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {data.stats.isLoading || !data.stats.data
          ? Array.from({ length: 3 }, (_, i) => (
              <StatCard key={i} data={undefined} isLoading={true} />
            ))
          : data.stats.data.map((stat) => (
              <StatCard key={stat.label} data={stat} isLoading={false} />
            ))}
      </div>

      {/* Row 2: Trend chart + Group members */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <SubmissionTrendChart
            data={data.trend.data}
            isLoading={data.trend.isLoading}
            color="chart-2"
            title="Group Submissions"
          />
        </div>
        <div className="lg:col-span-4">
          <GroupMembersList
            members={data.members?.data}
            isLoading={data.members?.isLoading ?? false}
            groupId={groupId}
            totalMembers={data.totalMembers}
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

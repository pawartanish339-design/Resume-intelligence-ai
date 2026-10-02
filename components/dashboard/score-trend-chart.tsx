'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { EmptyState } from '@/components/shared/empty-state';

export interface TrendPoint {
  date: string;
  overall: number;
  jobMatch: number;
  ats: number;
}

/**
 * Score trend. The chart is purely presentational: a visually hidden table carries the
 * same numbers for screen-reader users and for anyone who cannot use the chart.
 */
export function ScoreTrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length < 2) {
    return (
      <EmptyState
        title="Trend appears after two analyses"
        description="Score history is derived from stored reports. Run another analysis to see the direction of travel."
      />
    );
  }

  const formatted = data.map((point) => ({
    ...point,
    label: new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  }));

  return (
    <div>
      <div className="h-64 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={formatted} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="overall" name="Compatibility" stroke="hsl(221 83% 53%)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="jobMatch" name="Job match" stroke="hsl(142 71% 35%)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="ats" name="ATS" stroke="hsl(38 92% 45%)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <table className="visually-hidden">
        <caption>Score history, oldest to newest</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Compatibility</th>
            <th scope="col">Job match</th>
            <th scope="col">ATS compatibility</th>
          </tr>
        </thead>
        <tbody>
          {formatted.map((point) => (
            <tr key={point.date}>
              <th scope="row">{new Date(point.date).toLocaleString()}</th>
              <td>{point.overall.toFixed(1)}</td>
              <td>{point.jobMatch.toFixed(1)}</td>
              <td>{point.ats.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

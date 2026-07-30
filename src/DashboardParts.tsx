import type { ReactNode } from "react";
import type { Distribution, Job, StatItem, ApplicationTarget } from "./types";
import { buildHistogram, formatMoney, formatNumber } from "./analytics";

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-inline">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function MetricCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  formatOption,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  formatOption?: (value: string) => string;
}) {
  return (
    <label className="select-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {formatOption ? formatOption(option) : option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Panel({ title, icon, children, className = "" }: { title: string; icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>{icon}<h2>{title}</h2></div>
      </div>
      {children}
    </section>
  );
}

export function SalaryDistributionChart({ jobs, distribution }: { jobs: Job[]; distribution: Distribution }) {
  const bins = buildHistogram(jobs.map((job) => job.salaryUsd), 12);
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));

  if (!distribution.count) return <div className="empty-state">No rows match the current filters.</div>;

  return (
    <div className="distribution-chart">
      <svg viewBox="0 0 760 250" role="img" aria-label="Salary distribution chart">
        <line x1="56" y1="202" x2="720" y2="202" className="axis" />
        {bins.map((bin, index) => {
          const width = 46;
          const gap = 8;
          const x = 58 + index * (width + gap);
          const height = Math.max(4, (bin.count / maxCount) * 144);
          const y = 202 - height;
          return <rect key={bin.start} x={x} y={y} width={width} height={height} rx="4" className="hist-bar" />;
        })}
        <RangeMarker value={distribution.p25} min={distribution.min} max={distribution.max} label="P25" y={58} />
        <RangeMarker value={distribution.median} min={distribution.min} max={distribution.max} label="Median" y={34} prominent />
        <RangeMarker value={distribution.p75} min={distribution.min} max={distribution.max} label="P75" y={58} />
        <text x="58" y="230" className="chart-label">{formatMoney(distribution.min)}</text>
        <text x="702" y="230" className="chart-label chart-label-end">{formatMoney(distribution.max)}</text>
      </svg>
    </div>
  );
}

function RangeMarker({ value, min, max, label, y, prominent = false }: { value: number; min: number; max: number; label: string; y: number; prominent?: boolean }) {
  const x = 58 + ((value - min) / Math.max(1, max - min)) * 646;
  return (
    <g>
      <line x1={x} y1="38" x2={x} y2="204" className={prominent ? "marker prominent" : "marker"} />
      <text x={x} y={y} className={prominent ? "marker-label prominent" : "marker-label"}>
        {label} {formatMoney(value)}
      </text>
    </g>
  );
}

export function ComparisonBars({ items, labelMap = {}, valueKey }: { items: StatItem[]; labelMap?: Record<string, string>; valueKey: "median" | "average" | "opportunityScore" }) {
  const max = Math.max(1, ...items.map((item) => Number(item[valueKey]) || 0));
  return (
    <div className="comparison-bars">
      {items.map((item) => {
        const value = Number(item[valueKey]) || 0;
        return (
          <div className="comparison-row" key={item.label}>
            <span>{labelMap[item.label] ?? item.label}</span>
            <div className="comparison-track"><i style={{ width: `${Math.max(4, (value / max) * 100)}%` }} /></div>
            <strong>{valueKey === "opportunityScore" ? value : formatMoney(value)}</strong>
            <small>{formatNumber(item.count)} jobs</small>
          </div>
        );
      })}
    </div>
  );
}
export function RankedList({ items, metric }: { items: StatItem[]; metric: "opportunityScore" | "median" | "average" }) {
  const max = Math.max(1, ...items.map((item) => Number(item[metric]) || 0));
  return (
    <div className="ranked-list">
      {items.map((item, index) => {
        const value = Number(item[metric]) || 0;
        return (
          <div className="rank-row" key={item.label}>
            <span className="rank-index">{index + 1}</span>
            <div className="rank-body">
              <div className="rank-topline">
                <strong>{item.label}</strong>
                <span>{metric === "opportunityScore" ? `${value} score` : formatMoney(value)}</span>
              </div>
              <div className="rank-track"><i style={{ width: `${Math.max(5, (value / max) * 100)}%` }} /></div>
              <small>{formatNumber(item.count)} jobs - median {formatMoney(item.median)} - P75 {formatMoney(item.p75)}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SkillDemandTable({ skills }: { skills: StatItem[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Skill</th>
            <th>Mentions</th>
            <th>Median</th>
            <th>Best-fit context</th>
          </tr>
        </thead>
        <tbody>
          {skills.map((skill, index) => (
              <tr key={skill.label}>
                <td>{index + 1}</td>
                <td>{skill.label}</td>
                <td>{formatNumber(skill.count)}</td>
                <td>{formatMoney(skill.median)}</td>
                <td>{[...(skill.roles ?? []), ...(skill.industries ?? [])].slice(0, 3).join(", ")}</td>
              </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CombinationTable({ combos }: { combos: StatItem[] }) {
  if (!combos.length) return <div className="empty-state">No skill pair has enough matching jobs under the current filters.</div>;
  return (
    <div className="combo-list">
      {combos.map((combo) => (
        <div className="combo-row" key={combo.label}>
          <div>
            <strong>{combo.label}</strong>
            <span>{combo.roles?.slice(0, 2).join(", ")} - {combo.industries?.slice(0, 2).join(", ")}</span>
          </div>
          <div>
            <strong>{formatMoney(combo.p75)}</strong>
            <span>P75 - {formatNumber(combo.count)} jobs - score {combo.opportunityScore}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PriorityTable({ targets }: { targets: ApplicationTarget[] }) {
  if (!targets.length) return <div className="empty-state">No application targets match the current filters.</div>;
  return (
    <div className="table-wrap priority-wrap">
      <table>
        <thead>
          <tr>
            <th>Priority</th>
            <th>Role</th>
            <th>Industry</th>
            <th>Location</th>
            <th>Median</th>
            <th>Top 25%</th>
            <th>Skills to emphasize</th>
            <th>Decision signal</th>
          </tr>
        </thead>
        <tbody>
          {targets.map((target, index) => (
            <tr key={target.id}>
              <td><span className="priority-badge">{index + 1}</span></td>
              <td>{target.role}</td>
              <td>{target.industry}</td>
              <td>{target.location} - {target.remote}</td>
              <td>{formatMoney(target.median)}</td>
              <td>{formatMoney(target.p75)}</td>
              <td>{target.skills.join(", ")}</td>
              <td>Score {target.score} - {formatNumber(target.count)} jobs</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

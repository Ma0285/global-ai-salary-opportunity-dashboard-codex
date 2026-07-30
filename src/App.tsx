import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  Filter,
  Layers3,
  MapPin,
  RefreshCcw,
  SearchCheck,
  Target,
  TrendingUp,
} from "lucide-react";
import type { AnalysisData } from "./types";
import {
  ALL,
  buildApplicationTargets,
  buildRecommendations,
  calculateDistribution,
  experienceLabels,
  experienceOrder,
  formatMoney,
  formatNumber,
  groupJobs,
  groupSkillPairs,
  groupSkills,
  matchesFilters,
  trackedSkills,
  unique,
} from "./analytics";
import { OpportunityMap3D } from "./OpportunityMap3D";
import {
  CombinationTable,
  ComparisonBars,
  Metric,
  MetricCard,
  Panel,
  PriorityTable,
  RankedList,
  SalaryDistributionChart,
  SelectField,
  SkillDemandTable,
} from "./DashboardParts";

export default function App() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [role, setRole] = useState(ALL);
  const [industry, setIndustry] = useState(ALL);
  const [location, setLocation] = useState(ALL);
  const [remoteRatio, setRemoteRatio] = useState(ALL);
  const [experience, setExperience] = useState(ALL);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  useEffect(() => {
    fetch("/data/ai-salary-analysis.json")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload: AnalysisData) => setData(payload))
      .catch((error: Error) => setLoadError(error.message));
  }, []);

  const featuredSkills = useMemo(() => {
    if (!data) return trackedSkills;
    return unique([...trackedSkills, ...data.stats.skills.slice(0, 12).map((skill) => skill.label), ...selectedSkills]);
  }, [data, selectedSkills]);

  const filteredJobs = useMemo(() => {
    if (!data) return [];
    return data.jobs.filter((job) => matchesFilters(job, { role, industry, location, remoteRatio, experience, selectedSkills }));
  }, [data, role, industry, location, remoteRatio, experience, selectedSkills]);

  const experienceBaseJobs = useMemo(() => {
    if (!data) return [];
    return data.jobs.filter((job) => matchesFilters(job, { role, industry, location, remoteRatio, experience: ALL, selectedSkills }));
  }, [data, role, industry, location, remoteRatio, selectedSkills]);

  const distribution = useMemo(() => calculateDistribution(filteredJobs), [filteredJobs]);
  const baseline = data?.summary.average ?? 0;
  const roleStats = useMemo(() => groupJobs(filteredJobs, (job) => job.title, baseline), [filteredJobs, baseline]);
  const industryStats = useMemo(() => groupJobs(filteredJobs, (job) => job.industry, baseline), [filteredJobs, baseline]);
  const locationStats = useMemo(() => groupJobs(filteredJobs, (job) => job.companyLocation, baseline), [filteredJobs, baseline]);
  const skillStats = useMemo(() => groupSkills(filteredJobs, baseline), [filteredJobs, baseline]);
  const skillDemandStats = useMemo(
    () => [...skillStats].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 10),
    [skillStats],
  );
  const skillCombos = useMemo(() => groupSkillPairs(filteredJobs, baseline), [filteredJobs, baseline]);
  const experienceStats = useMemo(
    () => groupJobs(experienceBaseJobs, (job) => job.experienceLevel, baseline, experienceOrder),
    [experienceBaseJobs, baseline],
  );
  const applicationTargets = useMemo(() => buildApplicationTargets(filteredJobs, baseline), [filteredJobs, baseline]);
  const recommendations = useMemo(
    () => buildRecommendations({ distribution, roleStats, industryStats, locationStats, skillStats, skillCombos, applicationTargets, experience }),
    [distribution, roleStats, industryStats, locationStats, skillStats, skillCombos, applicationTargets, experience],
  );

  if (loadError) {
    return (
      <main className="app-shell status-shell">
        <div className="status-panel">
          <h1>Data could not be loaded</h1>
          <p>Run <code>npm run prepare-data</code> and restart the local app.</p>
          <p className="muted">{loadError}</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="app-shell status-shell">
        <div className="status-panel">
          <h1>Loading AI salary dashboard</h1>
          <p>Preparing salary, role, industry, location, skill, and experience views.</p>
        </div>
      </main>
    );
  }

  const resetFilters = () => {
    setRole(ALL);
    setIndustry(ALL);
    setLocation(ALL);
    setRemoteRatio(ALL);
    setExperience(ALL);
    setSelectedSkills([]);
  };

  const toggleSkill = (skill: string) => {
    if (!data.options.skills.includes(skill)) return;
    setSelectedSkills((current) => current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill]);
  };

  const marketRemoteShare = Math.round((data.jobs.filter((job) => job.remoteRatio === 100).length / Math.max(1, data.jobs.length)) * 100);

  return (
    <main className="app-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Global market intelligence dashboard</p>
          <h1>Global AI salary opportunity command center</h1>
          <p className="header-question">Prioritize AI applications across all employer locations by role, industry, remote model, experience level, salary upside, and skill combination strength.</p>
          <div className="market-definition">
            <span>{data.summary.marketScope}</span>
            <strong>{data.source.marketDefinition}</strong>
          </div>
        </div>
        <div className="header-metrics" aria-label="Dataset summary">
          <Metric label="Global jobs" value={formatNumber(data.summary.rowCount)} />
          <Metric label="Source rows" value={formatNumber(data.summary.sourceRowCount)} />
          <Metric label="Median" value={formatMoney(data.summary.median)} />
          <Metric label="Remote" value={`${marketRemoteShare}%`} />
        </div>
      </header>

      <section className="control-panel" aria-label="Dashboard filters">
        <div className="control-title"><Filter size={18} /><span>Application lens</span></div>
        <SelectField label="Role selector" value={role} onChange={setRole} options={[ALL, ...data.options.roles]} />
        <SelectField label="Industry filter" value={industry} onChange={setIndustry} options={[ALL, ...data.options.industries]} />
        <SelectField label="Employer location" value={location} onChange={setLocation} options={[ALL, ...data.options.countries]} />
        <SelectField label="Remote filter" value={remoteRatio} onChange={setRemoteRatio} options={[ALL, ...data.options.remoteRatios.map(String)]} formatOption={(value) => value === ALL ? ALL : `${value}% remote`} />
        <SelectField label="Experience level" value={experience} onChange={setExperience} options={[ALL, ...data.options.experienceLevels]} formatOption={(value) => experienceLabels[value] ?? value} />
        <button className="icon-button" type="button" onClick={resetFilters} aria-label="Reset filters"><RefreshCcw size={18} /></button>
      </section>
      <section className="skill-strip" aria-label="Skill demand filter">
        <div className="control-title"><SearchCheck size={18} /><span>Skill demand analysis</span></div>
        <div className="skill-pills">
          {featuredSkills.map((skill) => {
            const available = data.options.skills.includes(skill);
            const active = selectedSkills.includes(skill);
            return (
              <button
                key={skill}
                type="button"
                className={`skill-pill ${active ? "active" : ""} ${available ? "" : "missing"}`}
                onClick={() => toggleSkill(skill)}
                disabled={!available}
                title={available ? `${skill} appears in ai_job.csv` : `${skill} is not a separate skill in ai_job.csv`}
              >
                {skill}
                {!available && <span>not in CSV</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="decision-summary">
        <MetricCard icon={<Target size={20} />} label="Filtered jobs" value={formatNumber(distribution.count)} detail="Current global application pool" />
        <MetricCard icon={<TrendingUp size={20} />} label="Average salary" value={formatMoney(distribution.average)} detail="Global market USD" />
        <MetricCard icon={<BarChart3 size={20} />} label="Median salary" value={formatMoney(distribution.median)} detail="Typical offer level" />
        <MetricCard icon={<BriefcaseBusiness size={20} />} label="Top 25% threshold" value={formatMoney(distribution.p75)} detail="Upside target" />
      </section>

      <section className="main-grid">
        <Panel title="Salary distribution" icon={<BarChart3 size={19} />}>
          <SalaryDistributionChart jobs={filteredJobs} distribution={distribution} />
          <div className="quartile-grid">
            <Metric label="Bottom 25% avg" value={formatMoney(distribution.bottomAverage)} />
            <Metric label="Median" value={formatMoney(distribution.median)} />
            <Metric label="Average" value={formatMoney(distribution.average)} />
            <Metric label="Top 25% avg" value={formatMoney(distribution.topAverage)} />
          </div>
        </Panel>

        <Panel title="3D opportunity map" icon={<Layers3 size={19} />} className="map-panel">
          <OpportunityMap3D targets={applicationTargets.slice(0, 18)} />
        </Panel>
      </section>

      <section className="insight-grid">
        <Panel title="Recommendation section" icon={<Target size={19} />}>
          <div className="recommendation-list">
            {recommendations.map((item) => (
              <div className="recommendation-row" key={item.title}>
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
          <p className="data-note"><strong>{data.source.marketDefinition}</strong> {data.source.locationGranularity}</p>
        </Panel>

        <Panel title="Experience level comparison" icon={<BriefcaseBusiness size={19} />}>
          <ComparisonBars items={experienceStats} labelMap={experienceLabels} valueKey="median" />
        </Panel>
      </section>

      <section className="rank-grid">
        <Panel title="Best roles" icon={<BriefcaseBusiness size={19} />}>
          <RankedList items={roleStats.slice(0, 8)} metric="opportunityScore" />
        </Panel>
        <Panel title="Best industries" icon={<BarChart3 size={19} />}>
          <RankedList items={industryStats.slice(0, 8)} metric="opportunityScore" />
        </Panel>
        <Panel title="Best employer locations" icon={<MapPin size={19} />}>
          <RankedList items={locationStats.slice(0, 8)} metric="opportunityScore" />
        </Panel>
      </section>

      <section className="skill-grid">
        <Panel title="Individual skill demand" icon={<SearchCheck size={19} />}>
          <SkillDemandTable skills={skillDemandStats} />
        </Panel>
        <Panel title="Salary-positive skill combinations" icon={<Layers3 size={19} />}>
          <CombinationTable combos={skillCombos.slice(0, 10)} />
        </Panel>
      </section>

      <Panel title="Application priority queue" icon={<Target size={19} />}>
        <PriorityTable targets={applicationTargets.slice(0, 12)} />
      </Panel>
    </main>
  );
}






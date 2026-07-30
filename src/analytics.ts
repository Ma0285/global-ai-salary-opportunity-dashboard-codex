import type { ApplicationTarget, Distribution, Filters, Job, StatItem } from "./types";

export const ALL = "All";
export const trackedSkills = ["Python", "SQL", "Tableau", "AWS"];
export const experienceLabels: Record<string, string> = {
  EN: "Entry-level",
  MI: "Mid-level",
  SE: "Senior",
  EX: "Executive",
};

export function matchesFilters(job: Job, filters: Filters) {
  if (filters.role !== ALL && job.title !== filters.role) return false;
  if (filters.industry !== ALL && job.industry !== filters.industry) return false;
  if (filters.location !== ALL && job.companyLocation !== filters.location) return false;
  if (filters.remoteRatio !== ALL && String(job.remoteRatio) !== filters.remoteRatio) return false;
  if (filters.experience !== ALL && job.experienceLevel !== filters.experience) return false;
  if (filters.selectedSkills.length && !filters.selectedSkills.every((skill) => job.skills.includes(skill))) return false;
  return true;
}

export function calculateDistribution(jobs: Job[]): Distribution {
  const salaries = jobs.map((job) => job.salaryUsd).sort((a, b) => a - b);
  if (!salaries.length) {
    return { count: 0, min: 0, max: 0, average: 0, median: 0, p25: 0, p75: 0, p90: 0, topAverage: 0, bottomAverage: 0 };
  }
  const p25 = percentile(salaries, 0.25);
  const p75 = percentile(salaries, 0.75);
  return {
    count: salaries.length,
    min: salaries[0],
    max: salaries[salaries.length - 1],
    average: Math.round(average(salaries)),
    median: Math.round(percentile(salaries, 0.5)),
    p25: Math.round(p25),
    p75: Math.round(p75),
    p90: Math.round(percentile(salaries, 0.9)),
    bottomAverage: Math.round(average(salaries.filter((salary) => salary <= p25))),
    topAverage: Math.round(average(salaries.filter((salary) => salary >= p75))),
  };
}

export function groupJobs(
  jobs: Job[],
  keyFn: (job: Job) => string,
  baseline: number,
  sorter?: (a: StatItem, b: StatItem) => number,
): StatItem[] {
  const map = new Map<string, Job[]>();
  for (const job of jobs) {
    const key = keyFn(job) || "Unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key)?.push(job);
  }
  const items = [...map.entries()].map(([label, group]) => statFromJobs(label, group, baseline));
  return items.sort(sorter ?? ((a, b) => b.opportunityScore - a.opportunityScore || b.count - a.count));
}

export function groupSkills(jobs: Job[], baseline: number): StatItem[] {
  const map = new Map<string, Job[]>();
  for (const job of jobs) {
    for (const skill of job.skills) {
      if (!map.has(skill)) map.set(skill, []);
      map.get(skill)?.push(job);
    }
  }
  return [...map.entries()]
    .map(([label, group]) => {
      const stat = statFromJobs(label, group, baseline);
      const without = jobs.filter((job) => !job.skills.includes(label)).map((job) => job.salaryUsd);
      return {
        ...stat,
        liftVsWithout: Math.round(stat.average - average(without)),
        roles: topValues(group, (job) => job.title),
        industries: topValues(group, (job) => job.industry),
        countries: topValues(group, (job) => job.companyLocation),
      };
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore || b.count - a.count);
}

export function groupSkillPairs(jobs: Job[], baseline: number): StatItem[] {
  const map = new Map<string, Job[]>();
  for (const job of jobs) {
    for (const pair of combinations([...job.skills].sort(), 2)) {
      const key = pair.join(" + ");
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(job);
    }
  }
  const minCount = jobs.length > 1200 ? 20 : jobs.length > 250 ? 8 : 2;
  return [...map.entries()]
    .filter(([, group]) => group.length >= minCount)
    .map(([label, group]) => ({
      ...statFromJobs(label, group, baseline),
      skills: label.split(" + "),
      roles: topValues(group, (job) => job.title),
      industries: topValues(group, (job) => job.industry),
      countries: topValues(group, (job) => job.companyLocation),
    }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore || b.p75 - a.p75 || b.count - a.count);
}

export function buildApplicationTargets(jobs: Job[], baseline: number): ApplicationTarget[] {
  const map = new Map<string, Job[]>();
  for (const job of jobs) {
    const remote = remoteLabel(job.remoteRatio);
    const key = [job.title, job.industry, job.companyLocation, remote].join("|");
    if (!map.has(key)) map.set(key, []);
    map.get(key)?.push(job);
  }
  const minCount = jobs.length > 3000 ? 5 : jobs.length > 800 ? 3 : 1;
  return [...map.entries()]
    .filter(([, group]) => group.length >= minCount)
    .map(([key, group]) => {
      const [role, industry, location, remote] = key.split("|");
      const stat = statFromJobs(key, group, baseline);
      return {
        id: key,
        role,
        industry,
        location,
        remote,
        count: stat.count,
        average: stat.average,
        median: stat.median,
        p25: stat.p25 ?? stat.median,
        p75: stat.p75,
        p90: stat.p90 ?? stat.p75,
        entryShare: stat.entryShare ?? 0,
        remoteShare: stat.remoteShare ?? 0,
        score: Math.round(stat.opportunityScore * 0.55 + normalizeSalary(stat.p75, baseline) * 0.45),
        skills: topSkillValues(group, 4),
      };
    })
    .sort((a, b) => b.score - a.score || b.p75 - a.p75 || b.count - a.count);
}
export function buildRecommendations({
  distribution,
  roleStats,
  industryStats,
  locationStats,
  skillStats,
  skillCombos,
  applicationTargets,
  experience,
}: {
  distribution: Distribution;
  roleStats: StatItem[];
  industryStats: StatItem[];
  locationStats: StatItem[];
  skillStats: StatItem[];
  skillCombos: StatItem[];
  applicationTargets: ApplicationTarget[];
  experience: string;
}) {
  if (!distribution.count) {
    return [{ title: "No matching market", text: "Relax one filter to rebuild the application priority queue." }];
  }

  const topTarget = applicationTargets[0];
  const topRole = roleStats[0];
  const topIndustry = industryStats[0];
  const topLocation = locationStats[0];
  const topCombo = skillCombos[0];
  const topSkill = skillStats[0];
  const level = experience === "EN" ? "entry-level candidates" : experienceLabels[experience] ? `${experienceLabels[experience].toLowerCase()} candidates` : "job seekers";

  return [
    {
      title: "Apply first",
      text: topTarget
        ? `For ${level}, ${topTarget.role} roles in ${topTarget.industry} and ${topTarget.location} show the strongest blend of top-quartile salary (${formatMoney(topTarget.p75)}), demand, and accessibility.`
        : `For ${level}, ${topRole?.label ?? "the selected role"} roles show the strongest available salary signal.`,
    },
    {
      title: "Positioning",
      text: topCombo
        ? `Prioritize applications where your resume can credibly combine ${topCombo.label}; this pair ranks high on salary upside and demand in the filtered market.`
        : topSkill
          ? `Lead with ${topSkill.label}; it has the strongest current skill signal in the filtered market.`
          : "Use the role and industry filters to identify a clearer skill signal.",
    },
    {
      title: "Market focus",
      text: `${topIndustry?.label ?? "The selected industry"} and ${topLocation?.label ?? "the strongest employer location"} should be weighted ahead of broad spraying when compensation is the primary objective.`,
    },
  ];
}

export function statFromJobs(label: string, jobs: Job[], baseline: number): StatItem {
  const salaries = jobs.map((job) => job.salaryUsd).sort((a, b) => a - b);
  const avg = average(salaries);
  const entryShare = percentage(jobs.filter((job) => job.experienceLevel === "EN").length, jobs.length);
  const remoteShare = percentage(jobs.filter((job) => job.remoteRatio === 100).length, jobs.length);
  const effect = avg - baseline;
  return {
    label,
    count: jobs.length,
    average: Math.round(avg),
    median: Math.round(percentile(salaries, 0.5)),
    p25: Math.round(percentile(salaries, 0.25)),
    p75: Math.round(percentile(salaries, 0.75)),
    p90: Math.round(percentile(salaries, 0.9)),
    effect: Math.round(effect),
    lift: Math.round(effect),
    entryShare,
    remoteShare,
    avgYears: round(average(jobs.map((job) => job.yearsExperience)), 1),
    opportunityScore: calculateOpportunityScore(effect, jobs.length, entryShare, remoteShare, baseline),
  };
}

export function buildHistogram(values: number[], binsCount: number) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = Math.max(1, (max - min) / binsCount);
  const bins = Array.from({ length: binsCount }, (_, index) => ({ start: min + index * width, end: min + (index + 1) * width, count: 0 }));
  for (const value of values) {
    const index = Math.min(binsCount - 1, Math.floor((value - min) / width));
    bins[index].count += 1;
  }
  return bins;
}

export function percentile(sortedValues: number[], ratio: number) {
  if (!sortedValues.length) return 0;
  const sorted = [...sortedValues].sort((a, b) => a - b);
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function average(values: number[]) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

export function percentage(count: number, total: number) {
  return total ? round((count / total) * 100, 1) : 0;
}

export function calculateOpportunityScore(effect: number, count: number, entryShare: number, remoteShare: number, baseline: number) {
  const salaryComponent = clamp(50 + (effect / Math.max(1, baseline)) * 180, 0, 100);
  const demandComponent = clamp((Math.log10(count + 1) / Math.log10(5000)) * 100, 0, 100);
  const accessibilityComponent = clamp(entryShare * 1.7 + remoteShare * 0.3, 0, 100);
  return Math.round(salaryComponent * 0.5 + demandComponent * 0.3 + accessibilityComponent * 0.2);
}

export function normalizeSalary(value: number, baseline: number) {
  return clamp(50 + ((value - baseline) / Math.max(1, baseline)) * 120, 0, 100);
}

export function topValues(jobs: Job[], keyFn: (job: Job) => string, limit = 3) {
  const map = new Map<string, number>();
  for (const job of jobs) {
    const key = keyFn(job);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([key]) => key);
}

export function topSkillValues(jobs: Job[], limit = 4) {
  const map = new Map<string, number>();
  for (const job of jobs) {
    for (const skill of job.skills) {
      map.set(skill, (map.get(skill) ?? 0) + 1);
    }
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([skill]) => skill);
}

export function combinations(values: string[], size: number) {
  const output: string[][] = [];
  const current: string[] = [];
  function walk(start: number) {
    if (current.length === size) {
      output.push([...current]);
      return;
    }
    for (let index = start; index <= values.length - (size - current.length); index += 1) {
      current.push(values[index]);
      walk(index + 1);
      current.pop();
    }
  }
  walk(0);
  return output;
}

export function remoteLabel(value: number) {
  if (value === 100) return "Remote";
  if (value === 50) return "Hybrid";
  return "On-site";
}

export function unique<T>(items: T[]) {
  return [...new Set(items)];
}

export function uniqueBy<T>(items: T[], keyFn: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function experienceOrder(a: StatItem, b: StatItem) {
  const order = ["EN", "MI", "SE", "EX"];
  return order.indexOf(a.label) - order.indexOf(b.label);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatMoney(value: number | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value ?? 0);
}

export function signedMoney(value: number | undefined) {
  const amount = value ?? 0;
  const sign = amount > 0 ? "+" : "";
  return `${sign}${formatMoney(amount)}`;
}

export function formatNumber(value: number | undefined) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}


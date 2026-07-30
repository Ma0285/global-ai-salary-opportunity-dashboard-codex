import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const inputPath = join(root, "data", "ai_job.csv");
const outputPath = join(root, "public", "data", "ai-salary-analysis.json");

const text = readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
const table = parseCsv(text);
const headers = table[0] ?? [];
const rawRows = table.slice(1).filter((row) => row.length > 1);
const rows = rawRows.map((cells) =>
  Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])),
);

const allJobs = rows
  .map((row) => {
    const salaryUsd = toNumber(row.salary_usd);
    if (!Number.isFinite(salaryUsd) || salaryUsd <= 0) {
      return null;
    }

    const skills = unique(
      String(row.required_skills ?? "")
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean),
    );

    return {
      id: row.job_id,
      title: clean(row.job_title),
      salaryUsd: Math.round(salaryUsd),
      sourceCurrency: clean(row.salary_currency) || "USD",
      experienceLevel: clean(row.experience_level),
      employmentType: clean(row.employment_type),
      companyLocation: clean(row.company_location),
      companySize: clean(row.company_size),
      employeeResidence: clean(row.employee_residence),
      remoteRatio: toNumber(row.remote_ratio),
      skills,
      education: clean(row.education_required),
      yearsExperience: toNumber(row.years_experience),
      industry: clean(row.industry),
      postingDate: clean(row.posting_date),
      benefitsScore: toNumber(row.benefits_score),
      companyName: clean(row.company_name),
    };
  })
.filter(Boolean);

const jobs = allJobs;

const salaries = jobs.map((job) => job.salaryUsd);
const overallAverage = average(salaries);
const summary = {
  rowCount: jobs.length,
  sourceRowCount: allJobs.length,
  marketScope: "Global employer market",
  salaryField: "salary_usd",
  min: Math.round(Math.min(...salaries)),
  max: Math.round(Math.max(...salaries)),
  average: Math.round(overallAverage),
  median: Math.round(percentile(salaries, 0.5)),
  p10: Math.round(percentile(salaries, 0.1)),
  p25: Math.round(percentile(salaries, 0.25)),
  p75: Math.round(percentile(salaries, 0.75)),
  p90: Math.round(percentile(salaries, 0.9)),
  meanYearsExperience: round(average(jobs.map((job) => job.yearsExperience)), 1),
  meanBenefitsScore: round(average(jobs.map((job) => job.benefitsScore)), 1),
};

const currencyBreakdown = countBy(jobs, (job) => job.sourceCurrency);
const roles = groupedStats(jobs, (job) => job.title, overallAverage, 80);
const countries = groupedStats(jobs, (job) => job.companyLocation, overallAverage, 70);
const residences = groupedStats(jobs, (job) => job.employeeResidence, overallAverage, 70);
const education = groupedStats(jobs, (job) => job.education, overallAverage, 30, educationSort);
const experienceLevels = groupedStats(jobs, (job) => job.experienceLevel, overallAverage, 30, experienceSort);
const industries = groupedStats(jobs, (job) => job.industry, overallAverage, 60);
const companySizes = groupedStats(jobs, (job) => job.companySize, overallAverage, 30, companySizeSort);
const remoteRatios = groupedStats(jobs, (job) => `${job.remoteRatio}% remote`, overallAverage, 30);
const skills = skillStats(jobs, overallAverage, 20);
const skillCombinations = combinationStats(jobs, overallAverage);

const model = buildModel(jobs, {
  average: overallAverage,
  roles,
  countries,
  education,
  experienceLevels,
  industries,
  companySizes,
  remoteRatios,
  skills,
});

for (const job of jobs) {
  const skillEffects = job.skills
    .map((skill) => model.effects.skills[skill] ?? 0)
    .filter((value) => Number.isFinite(value));
  job.skillSignal = Math.round(skillEffects.length ? average(skillEffects) : 0);
  job.countrySignal = Math.round(model.effects.countries[job.companyLocation] ?? 0);
  job.educationSignal = Math.round(model.effects.education[job.education] ?? 0);
  job.roleSignal = Math.round(model.effects.roles[job.title] ?? 0);
}

const topCountries = countries
  .filter((item) => item.count >= 1)
  .sort((a, b) => b.effect - a.effect)
  .slice(0, 14)
  .map((item) => item.label);
const heatmap = buildCountryEducationHeatmap(jobs, topCountries, education.map((item) => item.label), overallAverage);

const payload = {
  generatedAt: new Date().toISOString(),
  source: {
    file: "data/ai_job.csv",
    note:
      "This dashboard includes every valid row in ai_job.csv across all employer locations. All salary displays use salary_usd; salary_currency is retained only as source metadata.",
    marketDefinition:
      "Global market = all rows across every company_location in ai_job.csv.",
    locationGranularity:
      "The source file contains country-level company location, employee country, and remote ratio; it does not contain state or city fields.",
  },
  summary,
  currencyBreakdown,
  options: {
    roles: roles.map((item) => item.label).sort(alphaSort),
    countries: countries.map((item) => item.label).sort(alphaSort),
    employeeResidences: residences.map((item) => item.label).sort(alphaSort),
    education: education.map((item) => item.label),
    skills: skills.map((item) => item.label).sort(alphaSort),
    industries: industries.map((item) => item.label).sort(alphaSort),
    experienceLevels: experienceLevels.map((item) => item.label),
    companySizes: companySizes.map((item) => item.label),
    remoteRatios: [0, 50, 100],
  },
  stats: {
    roles,
    countries,
    employeeResidences: residences,
    education,
    experienceLevels,
    industries,
    companySizes,
    remoteRatios,
    skills,
    skillCombinations,
  },
  recommendations: {
    roles: roles
      .filter((item) => item.count >= 20)
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .slice(0, 10),
    skills: skills
      .filter((item) => item.count >= 20)
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .slice(0, 10),
    countries: countries
      .filter((item) => item.count >= 1)
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .slice(0, 10),
    industries: industries
      .filter((item) => item.count >= 20)
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .slice(0, 10),
    skillCombinations: skillCombinations.slice(0, 12),
    education: [...education].sort((a, b) => b.effect - a.effect),
  },
  heatmap,
  model,
  jobs,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(payload));
console.log(`Wrote ${outputPath} with ${jobs.length.toLocaleString()} global market jobs from ${allJobs.length.toLocaleString()} source rows.`);

function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function clean(value) {
  return String(value ?? "").trim();
}

function toNumber(value) {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function unique(values) {
  return [...new Set(values)];
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function percentile(values, ratio) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function countBy(records, keyFn) {
  return Object.fromEntries(
    [...records.reduce((map, record) => {
      const key = keyFn(record) || "Unknown";
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map())].sort(([a], [b]) => alphaSort(a, b)),
  );
}

function groupedStats(records, keyFn, baseline, shrinkK = 75, preferredSort) {
  const groups = new Map();
  for (const record of records) {
    const key = keyFn(record) || "Unknown";
    if (!groups.has(key)) {
      groups.set(key, { total: 0, salaries: [], count: 0, entryCount: 0, remoteCount: 0, years: [] });
    }
    const group = groups.get(key);
    group.count += 1;
    group.total += record.salaryUsd;
    group.salaries.push(record.salaryUsd);
    group.years.push(record.yearsExperience);
    if (record.experienceLevel === "EN") group.entryCount += 1;
    if (record.remoteRatio === 100) group.remoteCount += 1;
  }

  const stats = [...groups.entries()].map(([label, group]) => {
    const avg = group.total / group.count;
    const effect = shrink(avg, group.count, baseline, shrinkK) - baseline;
    const entryShare = (group.entryCount / group.count) * 100;
    const remoteShare = (group.remoteCount / group.count) * 100;
    return {
      label,
      count: group.count,
      average: Math.round(avg),
      median: Math.round(percentile(group.salaries, 0.5)),
      p25: Math.round(percentile(group.salaries, 0.25)),
      p75: Math.round(percentile(group.salaries, 0.75)),
      p90: Math.round(percentile(group.salaries, 0.9)),
      effect: Math.round(effect),
      lift: Math.round(avg - baseline),
      pctLift: round(((avg - baseline) / baseline) * 100, 1),
      share: round((group.count / records.length) * 100, 1),
      entryShare: round(entryShare, 1),
      remoteShare: round(remoteShare, 1),
      avgYears: round(average(group.years), 1),
      opportunityScore: opportunityScore({ effect, count: group.count, entryShare, remoteShare }, baseline),
    };
  });

  if (preferredSort) {
    return stats.sort(preferredSort);
  }

  return stats.sort((a, b) => b.opportunityScore - a.opportunityScore || b.effect - a.effect || b.count - a.count || alphaSort(a.label, b.label));
}

function skillStats(records, baseline, minCount) {
  const groups = new Map();
  const totalSalary = records.reduce((sum, record) => sum + record.salaryUsd, 0);

  for (const record of records) {
    for (const skill of record.skills) {
      if (!groups.has(skill)) {
        groups.set(skill, {
          total: 0,
          salaries: [],
          count: 0,
          countries: new Map(),
          roles: new Map(),
          industries: new Map(),
          entryCount: 0,
          remoteCount: 0,
        });
      }
      const group = groups.get(skill);
      group.count += 1;
      group.total += record.salaryUsd;
      group.salaries.push(record.salaryUsd);
      group.countries.set(record.companyLocation, (group.countries.get(record.companyLocation) ?? 0) + 1);
      group.roles.set(record.title, (group.roles.get(record.title) ?? 0) + 1);
      group.industries.set(record.industry, (group.industries.get(record.industry) ?? 0) + 1);
      if (record.experienceLevel === "EN") group.entryCount += 1;
      if (record.remoteRatio === 100) group.remoteCount += 1;
    }
  }

  return [...groups.entries()]
    .filter(([, group]) => group.count >= minCount)
    .map(([label, group]) => {
      const avg = group.total / group.count;
      const withoutCount = records.length - group.count;
      const withoutAverage = withoutCount > 0 ? (totalSalary - group.total) / withoutCount : baseline;
      const effect = shrink(avg, group.count, baseline, 180) - baseline;
      const entryShare = (group.entryCount / group.count) * 100;
      const remoteShare = (group.remoteCount / group.count) * 100;

      return {
        label,
        count: group.count,
        average: Math.round(avg),
        median: Math.round(percentile(group.salaries, 0.5)),
        p25: Math.round(percentile(group.salaries, 0.25)),
        p75: Math.round(percentile(group.salaries, 0.75)),
        p90: Math.round(percentile(group.salaries, 0.9)),
        effect: Math.round(effect),
        lift: Math.round(avg - baseline),
        liftVsWithout: Math.round(avg - withoutAverage),
        pctLift: round(((avg - baseline) / baseline) * 100, 1),
        share: round((group.count / records.length) * 100, 1),
        entryShare: round(entryShare, 1),
        remoteShare: round(remoteShare, 1),
        opportunityScore: opportunityScore({ effect, count: group.count, entryShare, remoteShare }, baseline),
        countries: topKeys(group.countries, 3),
        roles: topKeys(group.roles, 3),
        industries: topKeys(group.industries, 3),
      };
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore || b.effect - a.effect || b.count - a.count || alphaSort(a.label, b.label));
}

function combinationStats(records, baseline) {
  const groups = new Map();
  for (const record of records) {
    const sortedSkills = [...record.skills].sort(alphaSort);
    for (const combo of combinations(sortedSkills, 2)) {
      const key = combo.join(" + ");
      if (!groups.has(key)) {
        groups.set(key, {
          skills: combo,
          count: 0,
          total: 0,
          salaries: [],
          roles: new Map(),
          industries: new Map(),
          countries: new Map(),
          entryCount: 0,
          remoteCount: 0,
        });
      }
      const group = groups.get(key);
      group.count += 1;
      group.total += record.salaryUsd;
      group.salaries.push(record.salaryUsd);
      group.roles.set(record.title, (group.roles.get(record.title) ?? 0) + 1);
      group.industries.set(record.industry, (group.industries.get(record.industry) ?? 0) + 1);
      group.countries.set(record.companyLocation, (group.countries.get(record.companyLocation) ?? 0) + 1);
      if (record.experienceLevel === "EN") group.entryCount += 1;
      if (record.remoteRatio === 100) group.remoteCount += 1;
    }
  }

  const minimumCombinationCount = Math.max(8, Math.floor(records.length * 0.015));

  return [...groups.entries()]
    .filter(([, group]) => group.count >= minimumCombinationCount)
    .map(([label, group]) => {
      const avg = group.total / group.count;
      const effect = shrink(avg, group.count, baseline, 160) - baseline;
      const entryShare = (group.entryCount / group.count) * 100;
      const remoteShare = (group.remoteCount / group.count) * 100;
      return {
        label,
        skills: group.skills,
        count: group.count,
        average: Math.round(avg),
        median: Math.round(percentile(group.salaries, 0.5)),
        p25: Math.round(percentile(group.salaries, 0.25)),
        p75: Math.round(percentile(group.salaries, 0.75)),
        p90: Math.round(percentile(group.salaries, 0.9)),
        effect: Math.round(effect),
        lift: Math.round(avg - baseline),
        pctLift: round(((avg - baseline) / baseline) * 100, 1),
        entryShare: round(entryShare, 1),
        remoteShare: round(remoteShare, 1),
        opportunityScore: opportunityScore({ effect, count: group.count, entryShare, remoteShare }, baseline),
        roles: topKeys(group.roles, 3),
        industries: topKeys(group.industries, 3),
        countries: topKeys(group.countries, 3),
      };
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore || b.effect - a.effect || b.count - a.count);
}

function buildModel(records, stats) {
  const years = records.map((job) => job.yearsExperience);
  const salaries = records.map((job) => job.salaryUsd);
  const meanYears = average(years);
  const meanSalary = stats.average;
  let covariance = 0;
  let variance = 0;

  for (let index = 0; index < records.length; index += 1) {
    covariance += (years[index] - meanYears) * (salaries[index] - meanSalary);
    variance += (years[index] - meanYears) ** 2;
  }

  const yearsSlope = variance ? covariance / variance : 0;
  return {
    baseline: Math.round(meanSalary),
    meanYears: round(meanYears, 1),
    yearsSlope: Math.round(yearsSlope),
    effects: {
      roles: effectsFromStats(stats.roles),
      countries: effectsFromStats(stats.countries),
      education: effectsFromStats(stats.education),
      experienceLevels: effectsFromStats(stats.experienceLevels),
      industries: effectsFromStats(stats.industries),
      companySizes: effectsFromStats(stats.companySizes),
      remoteRatios: effectsFromStats(stats.remoteRatios),
      skills: effectsFromStats(stats.skills),
    },
  };
}

function effectsFromStats(stats) {
  return Object.fromEntries(stats.map((item) => [item.label, item.effect]));
}

function buildCountryEducationHeatmap(records, countryLabels, educationLabels, baseline) {
  const cells = [];
  for (const country of countryLabels) {
    for (const education of educationLabels) {
      const salaries = records
        .filter((record) => record.companyLocation === country && record.education === education)
        .map((record) => record.salaryUsd);
      if (!salaries.length) continue;
      const avg = average(salaries);
      cells.push({
        country,
        education,
        count: salaries.length,
        average: Math.round(avg),
        effect: Math.round(shrink(avg, salaries.length, baseline, 35) - baseline),
      });
    }
  }
  return cells;
}

function shrink(value, count, baseline, k) {
  return (value * count + baseline * k) / (count + k);
}

function opportunityScore({ effect, count, entryShare, remoteShare }, baseline) {
  const salaryComponent = clamp(50 + (effect / baseline) * 180, 0, 100);
  const demandComponent = clamp((Math.log10(count + 1) / Math.log10(5000)) * 100, 0, 100);
  const accessibilityComponent = clamp(entryShare * 1.7 + remoteShare * 0.3, 0, 100);
  return Math.round(salaryComponent * 0.5 + demandComponent * 0.3 + accessibilityComponent * 0.2);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function topKeys(map, size) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || alphaSort(a[0], b[0]))
    .slice(0, size)
    .map(([key]) => key);
}

function combinations(values, size) {
  const output = [];
  const current = [];
  function walk(start) {
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

function alphaSort(a, b) {
  return String(a).localeCompare(String(b));
}

function educationSort(a, b) {
  const order = ["Associate", "Bachelor", "Master", "PhD"];
  return order.indexOf(a.label) - order.indexOf(b.label);
}

function experienceSort(a, b) {
  const order = ["EN", "MI", "SE", "EX"];
  return order.indexOf(a.label) - order.indexOf(b.label);
}

function companySizeSort(a, b) {
  const order = ["S", "M", "L"];
  return order.indexOf(a.label) - order.indexOf(b.label);
}




export type ExperienceLevel = "EN" | "MI" | "SE" | "EX";

export type Job = {
  id: string;
  title: string;
  salaryUsd: number;
  sourceCurrency: string;
  experienceLevel: ExperienceLevel;
  employmentType: string;
  companyLocation: string;
  employeeResidence: string;
  remoteRatio: number;
  skills: string[];
  education: string;
  yearsExperience: number;
  industry: string;
  benefitsScore: number;
  companyName: string;
};

export type StatItem = {
  label: string;
  count: number;
  average: number;
  median: number;
  p25?: number;
  p75: number;
  p90?: number;
  effect: number;
  lift?: number;
  liftVsWithout?: number;
  pctLift?: number;
  share?: number;
  entryShare?: number;
  remoteShare?: number;
  avgYears?: number;
  opportunityScore: number;
  skills?: string[];
  roles?: string[];
  industries?: string[];
  countries?: string[];
};

export type AnalysisData = {
  generatedAt: string;
  source: {
    file: string;
    note: string;
    marketDefinition: string;
    locationGranularity: string;
  };
  summary: {
    rowCount: number;
    sourceRowCount: number;
    marketScope: string;
    salaryField: string;
    min: number;
    max: number;
    average: number;
    median: number;
    p10: number;
    p25: number;
    p75: number;
    p90: number;
  };
  currencyBreakdown: Record<string, number>;
  options: {
    roles: string[];
    countries: string[];
    skills: string[];
    industries: string[];
    experienceLevels: ExperienceLevel[];
    remoteRatios: number[];
  };
  stats: {
    roles: StatItem[];
    countries: StatItem[];
    industries: StatItem[];
    skills: StatItem[];
    skillCombinations: StatItem[];
    experienceLevels: StatItem[];
  };
  recommendations: {
    roles: StatItem[];
    industries: StatItem[];
    countries: StatItem[];
    skills: StatItem[];
    skillCombinations: StatItem[];
  };
  jobs: Job[];
};

export type Distribution = {
  count: number;
  min: number;
  max: number;
  average: number;
  median: number;
  p25: number;
  p75: number;
  p90: number;
  topAverage: number;
  bottomAverage: number;
};

export type ApplicationTarget = {
  id: string;
  role: string;
  industry: string;
  location: string;
  remote: string;
  count: number;
  average: number;
  median: number;
  p25: number;
  p75: number;
  p90: number;
  entryShare: number;
  remoteShare: number;
  score: number;
  skills: string[];
};

export type Filters = {
  role: string;
  industry: string;
  location: string;
  remoteRatio: string;
  experience: string;
  selectedSkills: string[];
};



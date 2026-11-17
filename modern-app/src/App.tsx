import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Download,
  FlaskConical,
  RefreshCw,
  Shuffle,
  Upload,
  Users
} from 'lucide-react'
import { GuidedTutorial, type TutorialStep } from './GuidedTutorial'
import exampleAnimals from '../example_data/animals.csv?raw'
import './App.css'

interface AnimalInput {
  animal_id: string
  genotype: string
  sex: string
  age: number
  [field: string]: string | number
}

interface Group {
  group_number: number
  animals: AnimalInput[]
  count: number
  group_name?: string
  capacity?: number
}

interface Pair {
  male: AnimalInput
  female: AnimalInput
  age_difference: number
}

type AgeUnit = 'days' | 'weeks' | 'months' | 'years'
type AllocationMethod = 'simple_random' | 'balanced'
type BalanceField = 'sex' | 'genotype' | 'age'

interface AnimalPairRule {
  animal_id_a: string
  animal_id_b: string
}

interface CategoryBalance {
  [value: string]: { count: number; proportion: number }
}

interface AgeBalance {
  n: number
  mean: number | null
  sd: number | null
  minimum: number | null
  maximum: number | null
}

interface GroupBalance {
  group_number: number
  group_name: string
  count: number
  capacity: number
  sex: CategoryBalance
  genotype: CategoryBalance
  age: AgeBalance
}

interface AllocationResponse {
  success: boolean
  allocation_found: boolean
  search_exhausted: boolean
  algorithm_version: string
  method: AllocationMethod
  seed: number
  age_unit: AgeUnit
  selected_sexes: string[]
  selected_genotypes: string[]
  group_sizes: number[]
  group_names: string[]
  balance_priorities: BalanceField[]
  locks: { animal_id: string; group_number: number }[]
  together: AnimalPairRule[]
  apart: AnimalPairRule[]
  search_attempts: number
  valid_candidates_checked: number
  search_nodes_checked: number
  balance_scores?: Record<string, number>
  groups: Group[]
  excluded_animals: AnimalInput[]
  unassigned_animals: AnimalInput[]
  balance: {
    eligible_pool: {
      count: number
      sex: CategoryBalance
      genotype: CategoryBalance
      age: AgeBalance
    }
    groups: GroupBalance[]
    priority_order: BalanceField[]
  }
  limits: string[]
}

interface ReviewedAllocation {
  request: Record<string, unknown>
  result: AllocationResponse
}

interface StoredExperiment {
  schema_version: 1
  run_name: string
  mode: 'distribute' | 'pair'
  animal_text: string
  use_example_data: boolean
  num_groups: number
  age_leeway: number
  selected_genotypes: string[]
  selected_sexes: string[]
  group_names: string[]
  group_sizes: number[] | null
  allocation_method: AllocationMethod
  age_unit: AgeUnit
  seed: number
  balance_priorities: BalanceField[]
  locks: { animal_id: string; group_number: number }[]
  together: AnimalPairRule[]
  apart: AnimalPairRule[]
  reviewed_allocation: ReviewedAllocation | null
  pairs: Pair[]
  unpaired: AnimalInput[]
  summary: string
}

const EXAMPLE_DATA = exampleAnimals.trim()
const resolveApiBase = () => {
  if (typeof window === 'undefined') return undefined
  const params = new URLSearchParams(window.location.search)
  const queryBase = params.get('apiBase') ?? undefined
  const injected = (window as Window & { __EASYLAB_API__?: string }).__EASYLAB_API__
  return injected ?? queryBase
}

const API_BASE = resolveApiBase() ?? import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8001'

const STORAGE_KEY = 'easylab-next:animal-pairing:workspace:v1'
const BALANCE_FIELDS: BalanceField[] = ['sex', 'genotype', 'age']

const splitDelimitedLine = (line: string, delimiter: ',' | '\t'): string[] => {
  const values: string[] = []
  let value = ''
  let inQuotes = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (character === delimiter && !inQuotes) {
      values.push(value.trim())
      value = ''
    } else {
      value += character
    }
  }
  values.push(value.trim())
  return values
}

const splitInputLine = (line: string): string[] => {
  if (line.includes('\t')) return splitDelimitedLine(line, '\t')
  if (line.includes(',')) return splitDelimitedLine(line, ',')
  return line.trim().split(/\s+/)
}

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
const normalizeAgeUnit = (value: string): AgeUnit | null => {
  const normalized = normalizeHeader(value)
  if (['d', 'day', 'days'].includes(normalized)) return 'days'
  if (['w', 'wk', 'wks', 'week', 'weeks'].includes(normalized)) return 'weeks'
  if (['mo', 'mos', 'month', 'months'].includes(normalized)) return 'months'
  if (['y', 'yr', 'yrs', 'year', 'years'].includes(normalized)) return 'years'
  return null
}

const ageUnitFromHeader = (value: string): AgeUnit | null => {
  const normalized = normalizeHeader(value)
  const suffix = normalized.replace(/^age(in)?/, '')
  return normalizeAgeUnit(suffix)
}

const parseTextAnimals = (text: string): { animals: AnimalInput[]; errors: string[] } => {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(item => item.line.trim())
  const errors: string[] = []
  if (lines.length === 0) return { animals: [], errors: ['Paste animal records or load the example data.'] }

  const firstValues = splitInputLine(lines[0].line)
  const normalizedHeaders = firstValues.map(normalizeHeader)
  const findHeader = (names: string[]) => normalizedHeaders.findIndex(value => names.includes(value))
  const animalColumn = findHeader(['animalid', 'animalidno', 'animalidentifier', 'id', 'idno'])
  const genotypeColumn = findHeader(['genotype', 'genotypeclass'])
  const sexColumn = findHeader(['sex', 'gender'])
  const ageUnitColumn = findHeader(['ageunit', 'ageunits', 'unitofage'])
  const ageColumn = normalizedHeaders.findIndex((value, index) => index !== ageUnitColumn && (value === 'age' || value.startsWith('age')))
  const sourceAgeUnit = ageColumn >= 0 ? ageUnitFromHeader(firstValues[ageColumn]) : null
  const hasHeader = animalColumn >= 0 && genotypeColumn >= 0 && sexColumn >= 0 && ageColumn >= 0
  const headers = hasHeader ? firstValues : ['Animal_ID', 'Genotype', 'Sex', 'Age']
  const columns = hasHeader
    ? { animal: animalColumn, genotype: genotypeColumn, sex: sexColumn, age: ageColumn }
    : { animal: 0, genotype: 1, sex: 2, age: 3 }
  const dataLines = hasHeader ? lines.slice(1) : lines
  const animals: AnimalInput[] = []
  const seenIds = new Set<string>()

  for (const item of dataLines) {
    const values = splitInputLine(item.line)
    const requiredColumnCount = Math.max(columns.animal, columns.genotype, columns.sex, columns.age) + 1
    if (values.length < requiredColumnCount || (!hasHeader && values.length !== 4)) {
      errors.push(`Line ${item.lineNumber}: expected animal ID, genotype, sex, and age${hasHeader ? '.' : ' only.'}`)
      continue
    }
    const animalId = values[columns.animal]?.trim() ?? ''
    const genotype = values[columns.genotype]?.trim() ?? ''
    const sex = values[columns.sex]?.trim() ?? ''
    const ageText = values[columns.age]?.trim() ?? ''
    if (!animalId || !genotype || !sex || !ageText) {
      errors.push(`Line ${item.lineNumber}: animal ID, genotype, sex, and age are all required.`)
      continue
    }
    const age = Number(ageText)
    if (!Number.isFinite(age) || age < 0) {
      errors.push(`Line ${item.lineNumber}: age must be a finite, non-negative number.`)
      continue
    }
    const normalizedId = animalId.toLowerCase()
    if (seenIds.has(normalizedId)) {
      errors.push(`Line ${item.lineNumber}: animal ID ${animalId} appears more than once.`)
      continue
    }
    seenIds.add(normalizedId)
    const animal: AnimalInput = { animal_id: animalId, genotype, sex, age }
    if (hasHeader) {
      headers.forEach((header, column) => {
        if (column === columns.animal || column === columns.genotype || column === columns.sex || column === columns.age) return
        const fieldName = header.trim() || `Column ${column + 1}`
        animal[fieldName] = values[column] ?? ''
      })
      const ageUnitText = ageUnitColumn >= 0 && values[ageUnitColumn]?.trim() ? values[ageUnitColumn] : sourceAgeUnit
      const rowAgeUnit = ageUnitText ? normalizeAgeUnit(ageUnitText) : null
      if (rowAgeUnit) animal.source_age_unit = rowAgeUnit
      else if (ageUnitText) animal.source_age_unit = ageUnitText
    }
    animals.push(animal)
  }

  if (animals.length === 0 && errors.length === 0) {
    errors.push('No animal records were found.')
  }
  return { animals, errors }
}

const uniqueGenotypes = (animals: AnimalInput[]) => Array.from(new Set(animals.map(a => a.genotype))).sort()
const uniqueSexes = (animals: AnimalInput[]) => Array.from(new Set(animals.map(a => a.sex))).sort()
const formatCategoryBalance = (values: CategoryBalance) => Object.entries(values)
  .map(([value, stats]) => `${value}: ${stats.count} (${Math.round(stats.proportion * 100)}%)`)
  .join(' · ') || 'No animals'
const formatAgeBalance = (value: AgeBalance, unit: AgeUnit) => value.mean === null
  ? 'No ages'
  : `mean ${value.mean.toFixed(1)} ${unit} · SD ${value.sd?.toFixed(1) ?? '0.0'} · range ${value.minimum}–${value.maximum}`
const quoteCsvValue = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const distributeEvenly = (total: number, groupCount: number) => Array.from(
  { length: groupCount },
  (_, index) => Math.floor(total / groupCount) + (index < total % groupCount ? 1 : 0)
)

const readSavedExperiment = (): Partial<StoredExperiment> => {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const stored = JSON.parse(raw) as Partial<StoredExperiment>
    const isRecord = (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null && !Array.isArray(value)
    const isStringArray = (value: unknown): value is string[] =>
      Array.isArray(value) && value.every(item => typeof item === 'string')
    const isAnimal = (value: unknown): value is AnimalInput => {
      if (!isRecord(value)) return false
      return typeof value.animal_id === 'string' && typeof value.genotype === 'string'
        && typeof value.sex === 'string' && typeof value.age === 'number'
        && Number.isFinite(value.age) && value.age >= 0
        && Object.values(value).every(field => typeof field === 'string' || typeof field === 'number')
    }
    const isRule = (value: unknown): value is AnimalPairRule => isRecord(value)
      && typeof value.animal_id_a === 'string' && typeof value.animal_id_b === 'string'
    const isLocks = (value: unknown): value is StoredExperiment['locks'] => Array.isArray(value)
      && value.every(lock => isRecord(lock) && typeof lock.animal_id === 'string'
        && Number.isInteger(lock.group_number))
    const isReviewed = (value: unknown): value is ReviewedAllocation | null => {
      if (value === null) return true
      if (!isRecord(value) || !isRecord(value.request) || !isRecord(value.result)) return false
      const result = value.result
      return typeof result.allocation_found === 'boolean' && Array.isArray(result.groups)
        && Array.isArray(result.unassigned_animals) && result.unassigned_animals.every(isAnimal)
        && Array.isArray(result.excluded_animals) && result.excluded_animals.every(isAnimal)
        && isRecord(result.balance) && result.groups.every(group => isRecord(group)
          && Array.isArray(group.animals) && group.animals.every(isAnimal))
    }
    const isPair = (value: unknown): value is Pair => isRecord(value)
      && isAnimal(value.male) && isAnimal(value.female)
      && typeof value.age_difference === 'number' && Number.isFinite(value.age_difference)
    const isGroupSizes = (value: unknown) => value === null || (Array.isArray(value)
      && value.every(size => Number.isInteger(size) && size >= 0))
    if (stored.schema_version !== 1 || typeof stored.run_name !== 'string'
        || (stored.mode !== 'distribute' && stored.mode !== 'pair')
        || typeof stored.animal_text !== 'string' || typeof stored.use_example_data !== 'boolean'
        || !Number.isInteger(stored.num_groups) || stored.num_groups! < 1 || stored.num_groups! > 20
        || !Number.isInteger(stored.age_leeway) || stored.age_leeway! < 0
        || !isStringArray(stored.selected_genotypes) || !isStringArray(stored.selected_sexes)
        || !isStringArray(stored.group_names) || !isGroupSizes(stored.group_sizes)
        || (stored.allocation_method !== 'simple_random' && stored.allocation_method !== 'balanced')
        || !(['days', 'weeks', 'months', 'years'] as unknown[]).includes(stored.age_unit)
        || !Number.isSafeInteger(stored.seed) || !Array.isArray(stored.balance_priorities)
        || stored.balance_priorities.some(field => !BALANCE_FIELDS.includes(field))
        || !isLocks(stored.locks) || !Array.isArray(stored.together) || !stored.together.every(isRule)
        || !Array.isArray(stored.apart) || !stored.apart.every(isRule)
        || !isReviewed(stored.reviewed_allocation) || !Array.isArray(stored.pairs) || !stored.pairs.every(isPair)
        || !Array.isArray(stored.unpaired) || !stored.unpaired.every(isAnimal)
        || typeof stored.summary !== 'string') return {}
    return stored
  } catch {
    return {}
  }
}

function App() {
  const [savedExperiment] = useState(readSavedExperiment)
  const [animalText, setAnimalText] = useState(savedExperiment.animal_text ?? '')
  const [mode, setMode] = useState<'distribute' | 'pair'>(savedExperiment.mode ?? 'distribute')
  const [useExampleData, setUseExampleData] = useState(savedExperiment.use_example_data ?? false)
  const [numGroups, setNumGroups] = useState(savedExperiment.num_groups ?? 3)
  const [ageLeeway, setAgeLeeway] = useState(savedExperiment.age_leeway ?? 7)
  const [selectedGenotypes, setSelectedGenotypes] = useState<string[]>(savedExperiment.selected_genotypes ?? [])
  const [selectedSexes, setSelectedSexes] = useState<string[]>(savedExperiment.selected_sexes ?? [])
  const [groupNames, setGroupNames] = useState<string[]>(savedExperiment.group_names ?? ['Group 1', 'Group 2', 'Group 3'])
  const [groupSizes, setGroupSizes] = useState<number[] | null>(savedExperiment.group_sizes ?? null)
  const [allocationMethod, setAllocationMethod] = useState<AllocationMethod>(savedExperiment.allocation_method ?? 'balanced')
  const [ageUnit, setAgeUnit] = useState<AgeUnit>(savedExperiment.age_unit ?? 'weeks')
  const [seed, setSeed] = useState(savedExperiment.seed ?? 42)
  const [balancePriorities, setBalancePriorities] = useState<BalanceField[]>(savedExperiment.balance_priorities ?? BALANCE_FIELDS)
  const [lockedAssignments, setLockedAssignments] = useState(savedExperiment.locks ?? [])
  const [togetherRules, setTogetherRules] = useState<AnimalPairRule[]>(savedExperiment.together ?? [])
  const [apartRules, setApartRules] = useState<AnimalPairRule[]>(savedExperiment.apart ?? [])
  const [ruleFirstAnimal, setRuleFirstAnimal] = useState('')
  const [ruleSecondAnimal, setRuleSecondAnimal] = useState('')
  const [ruleType, setRuleType] = useState<'together' | 'apart'>('together')
  const [runName, setRunName] = useState(savedExperiment.run_name ?? 'Animal allocation')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [pairs, setPairs] = useState<Pair[]>(savedExperiment.pairs ?? [])
  const [unpaired, setUnpaired] = useState<AnimalInput[]>(savedExperiment.unpaired ?? [])
  const [summary, setSummary] = useState<string>(savedExperiment.summary ?? '')
  const [reviewedAllocation, setReviewedAllocation] = useState<ReviewedAllocation | null>(savedExperiment.reviewed_allocation ?? null)
  const [storageStatus, setStorageStatus] = useState('Saved on this device')

  const parsedInput = useMemo(
    () => parseTextAnimals(useExampleData ? EXAMPLE_DATA : animalText),
    [useExampleData, animalText]
  )
  const animals = parsedInput.animals
  const genotypeOptions = useMemo(() => uniqueGenotypes(animals), [animals])
  const sexOptions = useMemo(() => uniqueSexes(animals), [animals])

  const eligibleAnimals = useMemo(
    () => animals.filter(animal => selectedGenotypes.includes(animal.genotype) && selectedSexes.includes(animal.sex)),
    [animals, selectedGenotypes, selectedSexes]
  )
  const filteredAnimals = useMemo(
    () => animals.filter(animal => selectedGenotypes.includes(animal.genotype)),
    [animals, selectedGenotypes]
  )
  const ageUnitMismatches = animals.filter(animal => {
    const sourceUnit = animal.source_age_unit
    return typeof sourceUnit === 'string' && sourceUnit !== ageUnit
  })
  const effectiveGroupSizes = groupSizes ?? distributeEvenly(eligibleAnimals.length, numGroups)
  const allocationRequest = useMemo(() => ({
    animals,
    selected_sexes: selectedSexes,
    selected_genotypes: selectedGenotypes,
    group_sizes: effectiveGroupSizes,
    group_names: Array.from({ length: numGroups }, (_, index) => groupNames[index] || `Group ${index + 1}`),
    method: allocationMethod,
    seed,
    age_unit: ageUnit,
    balance_priorities: balancePriorities,
    locks: lockedAssignments,
    together: togetherRules,
    apart: apartRules,
  }), [animals, selectedSexes, selectedGenotypes, effectiveGroupSizes, groupNames, numGroups,
    allocationMethod, seed, ageUnit, balancePriorities, lockedAssignments, togetherRules, apartRules])

  useEffect(() => {
    setGroupNames((previous) => Array.from({ length: numGroups }, (_, index) => previous[index] || `Group ${index + 1}`))
    setGroupSizes((previous) => {
      if (previous === null) return null
      const defaults = distributeEvenly(eligibleAnimals.length, numGroups)
      return Array.from({ length: numGroups }, (_, index) => previous[index] ?? defaults[index])
    })
  }, [numGroups, eligibleAnimals.length])

  const hasCurrentAllocation = Boolean(
    reviewedAllocation && JSON.stringify(reviewedAllocation.request) === JSON.stringify(allocationRequest)
  )
  const currentAllocation = mode === 'distribute' && hasCurrentAllocation ? reviewedAllocation?.result ?? null : null
  const visibleGroups = mode === 'distribute' ? currentAllocation?.groups ?? [] : groups
  const hasResults = mode === 'distribute'
    ? Boolean(currentAllocation?.allocation_found)
    : pairs.length > 0
  const statusLabel = loading ? 'Processing' : hasResults ? 'Ready' : 'Waiting'
  const statusClass = loading ? 'warning' : hasResults ? 'success' : 'warning'
  const modeLabel = mode === 'distribute' ? 'Group mode' : 'Pair mode'

  useEffect(() => {
    const stored: StoredExperiment = {
      schema_version: 1,
      run_name: runName,
      mode,
      animal_text: animalText,
      use_example_data: useExampleData,
      num_groups: numGroups,
      age_leeway: ageLeeway,
      selected_genotypes: selectedGenotypes,
      selected_sexes: selectedSexes,
      group_names: groupNames,
      group_sizes: groupSizes,
      allocation_method: allocationMethod,
      age_unit: ageUnit,
      seed,
      balance_priorities: balancePriorities,
      locks: lockedAssignments,
      together: togetherRules,
      apart: apartRules,
      reviewed_allocation: reviewedAllocation,
      pairs,
      unpaired,
      summary,
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      setStorageStatus('Saved on this device')
    } catch {
      setStorageStatus('Could not save on this device')
    }
  }, [runName, mode, animalText, useExampleData, numGroups, ageLeeway, selectedGenotypes, selectedSexes,
    groupNames, groupSizes, allocationMethod, ageUnit, seed, balancePriorities, lockedAssignments,
    togetherRules, apartRules, reviewedAllocation, pairs, unpaired, summary])

  const clearCohortReview = () => {
    setLockedAssignments([])
    setTogetherRules([])
    setApartRules([])
    setReviewedAllocation(null)
    setGroups([])
    setPairs([])
    setUnpaired([])
    setSummary('')
  }

  const loadExampleData = () => {
    const exampleAnimals = parseTextAnimals(EXAMPLE_DATA).animals
    clearCohortReview()
    setUseExampleData(true)
    setAnimalText(EXAMPLE_DATA)
    setSelectedGenotypes(uniqueGenotypes(exampleAnimals))
    setSelectedSexes(uniqueSexes(exampleAnimals))
    setGroupSizes(null)
  }

  const handleAnimalTextChange = (text: string) => {
    const parsed = parseTextAnimals(text)
    clearCohortReview()
    setUseExampleData(false)
    setAnimalText(text)
    setSelectedGenotypes(uniqueGenotypes(parsed.animals))
    setSelectedSexes(uniqueSexes(parsed.animals))
    setGroupSizes(null)
  }

  const tutorialSteps: TutorialStep[] = useMemo(
    () => [
      {
        selector: '[data-testid="pairing-use-example-toggle"]',
        title: 'Use example data toggle',
        description: 'Enable this to populate the bundled demonstration dataset.',
        details: [
          'Use this for first-run validation before loading real cohort data.',
        ],
      },
      {
        selector: '[data-testid="animal-data-input"]',
        title: 'Paste or upload animal rows',
        description: 'Input rows should include Animal_ID, Genotype, Sex, and Age.',
        details: [
          'Upload supports CSV/XLSX files.',
          'Textarea supports direct paste from spreadsheets.',
        ],
      },
      {
        selector: '[data-testid="mode-distribute"]',
        title: 'Groups mode',
        description: 'Use when you want balanced experimental cohorts.',
      },
      {
        selector: '[data-testid="mode-pair"]',
        title: 'Pairs mode',
        description: 'Use when you need male/female pairing output instead of multi-group distribution.',
      },
      {
        selector: '[data-testid="genotype-filter-section"]',
        title: 'Genotype filtering',
        description: 'Select which genotypes are included in processing.',
        details: [
          'Only selected genotype tags are considered for groups/pairs.',
        ],
      },
      {
        selector: '[data-testid="age-leeway-input"]',
        title: 'Age leeway',
        description: 'Defines maximum allowed age difference for balancing and pairing.',
      },
      {
        selector: '[data-testid="num-groups-input"]',
        title: 'Number of groups (Groups mode)',
        description: 'Controls how many output cohorts are generated in distribute mode.',
      },
      {
        selector: '[data-testid="process-btn"]',
        title: 'Run processing',
        description: 'Execute current mode with selected filters and settings.',
      },
      {
        selector: '[data-testid="pairing-export-btn"]',
        title: 'Export Excel',
        description: 'Download grouped/pairing output after reviewing results.',
      },
      {
        selector: '[data-testid="pairing-results-panel"]',
        title: 'Review results (final step)',
        description: 'Validate cohorts/pairs and unpaired animals before final handoff.',
      },
    ],
    []
  )

  const handleUpload = async (file: File) => {
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData })
      if (!response.ok) throw new Error('Upload failed')
      const data = await response.json()
      const uploadedAnimals = data.animals as Record<string, unknown>[]
      if (uploadedAnimals.length === 0) throw new Error('No animal rows were found in this file.')
      const headers = Array.from(new Set(uploadedAnimals.flatMap(animal => Object.keys(animal))))
      const csvText = [headers, ...uploadedAnimals.map(animal => headers.map(header => animal[header]))]
        .map(row => row.map(quoteCsvValue).join(',')).join('\n')
      const parsed = parseTextAnimals(csvText)
      setUseExampleData(false)
      clearCohortReview()
      setAnimalText(csvText)
      setSelectedGenotypes(uniqueGenotypes(parsed.animals))
      setSelectedSexes(uniqueSexes(parsed.animals))
      setGroupSizes(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDistribute = async () => {
    if (parsedInput.errors.length > 0) {
      setError(parsedInput.errors.join('\n'))
      return
    }
    if (ageUnitMismatches.length > 0) {
      setError(`The selected age unit is ${ageUnit}, but ${ageUnitMismatches.length} input row(s) specify a different unit. Match the units before generating groups.`)
      return
    }
    if (!Number.isSafeInteger(seed)) {
      setError('Enter a whole-number seed within the exact integer range supported by this app.')
      return
    }
    if (eligibleAnimals.length === 0) {
      setError('Select at least one sex and one genotype with animals in the data.')
      return
    }
    if (effectiveGroupSizes.length !== numGroups || effectiveGroupSizes.some(size => !Number.isInteger(size) || size < 1)) {
      setError('Each group needs a whole-number capacity greater than zero.')
      return
    }
    if (effectiveGroupSizes.reduce((total, size) => total + size, 0) > eligibleAnimals.length) {
      setError('Group capacities exceed the number of eligible animals. Lower a group size or include more animals.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE}/allocate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(allocationRequest)
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Could not generate this allocation.')
      const result = data as AllocationResponse
      setReviewedAllocation({ request: allocationRequest as Record<string, unknown>, result })
      setSummary(result.allocation_found
        ? `${result.balance.eligible_pool.count} eligible · ${result.groups.reduce((total, group) => total + group.count, 0)} assigned · ${result.unassigned_animals.length} unassigned`
        : 'No valid allocation found within the search limit.')
      setGroups([])
      setPairs([])
      setUnpaired([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate this allocation.')
    } finally {
      setLoading(false)
    }
  }

  const handlePair = async () => {
    if (parsedInput.errors.length > 0) {
      setError(parsedInput.errors.join('\n'))
      return
    }
    if (filteredAnimals.length === 0) {
      setError('Select at least one genotype with animals in the data.')
      return
    }
    if (filteredAnimals.some(animal => !Number.isInteger(animal.age))) {
      setError('Pairing uses whole-number ages. Update the age values before pairing.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE}/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          animals: filteredAnimals,
          age_leeway: ageLeeway,
          selected_genotypes: selectedGenotypes,
          use_example: useExampleData
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Could not pair the animals.')
      setPairs(data.pairs || [])
      setUnpaired(data.unpaired || [])
      setSummary(data.summary || '')
      setGroups([])
      setReviewedAllocation(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    if (mode === 'distribute' && !currentAllocation?.allocation_found) {
      setError('Generate and review a valid allocation before exporting.')
      return
    }
    if (mode === 'pair' && filteredAnimals.length === 0) {
      setError('Please provide animal data first')
      return
    }
    try {
      const endpoint = mode === 'distribute' ? '/export-allocation' : '/export-pairs'
      const body = mode === 'distribute'
        ? { input_animals: animals, allocation: currentAllocation, run_name: runName }
        : {
          animals: filteredAnimals,
          age_leeway: ageLeeway,
          selected_genotypes: selectedGenotypes,
          use_example: useExampleData
        }
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Could not export the reviewed results.')
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = mode === 'distribute' ? 'animal_allocation.xlsx' : 'animal_pairs.xlsx'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    }
  }

  const resetWorkspace = () => {
    setMode('distribute')
    setAnimalText('')
    setUseExampleData(false)
    setNumGroups(3)
    setAgeLeeway(7)
    setSelectedGenotypes([])
    setSelectedSexes([])
    setGroupNames(['Group 1', 'Group 2', 'Group 3'])
    setGroupSizes(null)
    setAllocationMethod('balanced')
    setAgeUnit('weeks')
    setSeed(42)
    setBalancePriorities(BALANCE_FIELDS)
    setLockedAssignments([])
    setTogetherRules([])
    setApartRules([])
    setReviewedAllocation(null)
    setGroups([])
    setPairs([])
    setUnpaired([])
    setSummary('')
    setRunName('Animal allocation')
    setError(null)
  }

  const setGroupSize = (index: number, value: string) => {
    const currentSizes = groupSizes ?? distributeEvenly(eligibleAnimals.length, numGroups)
    const next = [...currentSizes]
    next[index] = value === '' ? 0 : Number(value)
    setGroupSizes(next)
  }

  const movePriority = (field: BalanceField, direction: -1 | 1) => {
    const index = balancePriorities.indexOf(field)
    const destination = index + direction
    if (index < 0 || destination < 0 || destination >= balancePriorities.length) return
    const next = [...balancePriorities]
    ;[next[index], next[destination]] = [next[destination], next[index]]
    setBalancePriorities(next)
  }

  const addPairRule = () => {
    if (!ruleFirstAnimal || !ruleSecondAnimal || ruleFirstAnimal === ruleSecondAnimal) {
      setError('Choose two different eligible animals for this rule.')
      return
    }
    const rule = { animal_id_a: ruleFirstAnimal, animal_id_b: ruleSecondAnimal }
    const existingRules = ruleType === 'together' ? togetherRules : apartRules
    const duplicate = existingRules.some(existing =>
      (existing.animal_id_a === rule.animal_id_a && existing.animal_id_b === rule.animal_id_b)
      || (existing.animal_id_a === rule.animal_id_b && existing.animal_id_b === rule.animal_id_a))
    if (duplicate) {
      setError(`That ${ruleType} rule is already listed.`)
      return
    }
    if (ruleType === 'together') setTogetherRules(previous => [...previous, rule])
    else setApartRules(previous => [...previous, rule])
    setRuleFirstAnimal('')
    setRuleSecondAnimal('')
    setError(null)
  }

  const updateLocks = (nextLocks: { animal_id: string; group_number: number }[]) => {
    setLockedAssignments(nextLocks)
    if (!currentAllocation) return
    setReviewedAllocation({
      request: { ...allocationRequest, locks: nextLocks },
      result: { ...currentAllocation, locks: nextLocks },
    })
  }

  return (
    <div className="app-bg">
      <header className="panel">
        <div className="lab-head">
          <div>
            <p className="eyebrow">Experiment pairing</p>
            <h2>Animal Pairing &amp; Grouping Tool</h2>
            <p className="muted">Set group sizes, review balance, and export the assignments you inspected.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`status-chip ${statusClass}`}>{statusLabel}</span>
            <span className="pill soft">{modeLabel}</span>
            <span className="pill">
              <FlaskConical className="icon" aria-hidden="true" />
              {animals.length} animals
            </span>
            <span className="pill soft">{storageStatus}</span>
          </div>
        </div>
      </header>

      {error && (
        <div className="panel" role="alert">
          <div className="lab-head">
            <div>
              <p className="eyebrow">Alert</p>
              <h2>Error</h2>
              <p className="muted">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="ghost">Dismiss</button>
          </div>
        </div>
      )}

      <div className="app-shell">
        <aside className="panel sidebar">
          <div className="lab-head">
            <div>
              <p className="eyebrow">Inputs</p>
              <h2>Data Intake</h2>
              <p className="muted">Upload a CSV/XLSX or paste animal ID, genotype, sex, and age rows.</p>
            </div>
            <button className="pill soft" onClick={loadExampleData} type="button">
              <RefreshCw className="icon" aria-hidden="true" />
              Sample
            </button>
          </div>

          <div className="sidebar-tabs" role="tablist" aria-label="Pairing mode">
            <button
              onClick={() => setMode('distribute')}
              data-testid="mode-distribute"
              className={`tab-button ${mode === 'distribute' ? 'active' : ''}`}
              type="button"
            >
              <Users className="icon" aria-hidden="true" />
              Groups
            </button>
            <button
              onClick={() => setMode('pair')}
              data-testid="mode-pair"
              className={`tab-button ${mode === 'pair' ? 'active' : ''}`}
              type="button"
            >
              <Shuffle className="icon" aria-hidden="true" />
              Pairs
            </button>
          </div>

          <div className="sidebar-section">
            <div className="section-title">Data Source</div>
            <p className="muted tiny">Paste rows or upload a file. Extra input columns are kept with the animal records.</p>
            <div className="chip-row">
              <label className="pill soft">
                <input
                  type="checkbox"
                  checked={useExampleData}
                  onChange={(e) => e.target.checked ? loadExampleData() : setUseExampleData(false)}
                  data-testid="pairing-use-example-toggle"
                />
                <span>Use Example Data</span>
              </label>
              <button className="pill" onClick={loadExampleData} type="button">
                <RefreshCw className="icon" aria-hidden="true" />
                Reload Sample
              </button>
              <label className="ghost">
                <Upload className="icon" aria-hidden="true" />
                Upload File
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleUpload(file)
                  }}
                />
              </label>
            </div>

            <div className="field">
              <textarea
                className="data-textarea"
                placeholder="Animal_ID,Genotype,Sex,Age"
                aria-label="Animal data CSV"
                data-testid="animal-data-input"
                value={useExampleData ? EXAMPLE_DATA : animalText}
                onChange={(e) => handleAnimalTextChange(e.target.value)}
              />
              <p className="muted tiny">
                Parsed animals: {animals.length} · Eligible for groups: {eligibleAnimals.length}
              </p>
              {parsedInput.errors.length > 0 && <p className="muted tiny" role="status">{parsedInput.errors.length} input issue(s) need attention before processing.</p>}
              {mode === 'distribute' && ageUnitMismatches.length > 0 && (
                <p className="muted tiny" role="status">
                  {ageUnitMismatches.length} age value(s) specify a unit different from the selected {ageUnit}.
                </p>
              )}
            </div>
          </div>

          {mode === 'distribute' && (
            <div className="sidebar-section">
              <div className="field-row">
                <div>
                  <div className="section-title">Sex or category</div>
                  <p className="muted tiny">Choose which animals enter the group allocation.</p>
                </div>
                {sexOptions.length > 0 && (
                  <button className="pill soft" onClick={() => setSelectedSexes(sexOptions)} type="button">Select all</button>
                )}
              </div>
              <div className="chip-row">
                {sexOptions.map(sex => {
                  const active = selectedSexes.includes(sex)
                  return (
                    <button
                      key={sex}
                      type="button"
                      className={`pill ${active ? 'active-pill' : ''}`}
                      onClick={() => setSelectedSexes(previous => active ? previous.filter(value => value !== sex) : [...previous, sex])}
                    >
                      {active && <CheckCircle2 className="icon" aria-hidden="true" />}
                      {sex}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="sidebar-section">
            <div className="field-row">
              <div>
                <div className="section-title">Genotypes</div>
                <p className="muted tiny">Choose the genotypes included in this run.</p>
              </div>
              {genotypeOptions.length > 0 && (
                <button className="pill soft" onClick={() => setSelectedGenotypes(genotypeOptions)} type="button">
                  Select all
                </button>
              )}
            </div>
            <div className="chip-row" data-testid="genotype-filter-section">
              {genotypeOptions.map((g) => {
                const active = selectedGenotypes.includes(g)
                return (
                  <button
                    key={g}
                    type="button"
                    className={`pill ${active ? 'active-pill' : ''}`}
                    onClick={() => {
                      setSelectedGenotypes((prev) => (active ? prev.filter((x) => x !== g) : [...prev, g]))
                    }}
                  >
                    {active && <CheckCircle2 className="icon" aria-hidden="true" />}
                    {g}
                  </button>
                )
              })}
              {genotypeOptions.length === 0 && <span className="muted tiny">No genotypes detected</span>}
            </div>
          </div>

          <div className="sidebar-section" data-testid="allocation-settings">
            <div className="section-title">{mode === 'distribute' ? 'Allocation settings' : 'Pair settings'}</div>
            {mode === 'pair' ? (
              <label className="field">
                <span className="eyebrow">Age leeway (days)</span>
                <input
                  type="number"
                  min="0"
                  value={ageLeeway}
                  onChange={(event) => setAgeLeeway(parseInt(event.target.value) || 0)}
                  data-testid="age-leeway-input"
                />
                <span className="muted tiny">Pairing keeps the existing opposite-sex, same-genotype matching rule.</span>
              </label>
            ) : (
              <>
                <div className="field-row">
                  <label className="field">
                    <span className="eyebrow">Allocation method</span>
                    <select value={allocationMethod} onChange={event => setAllocationMethod(event.target.value as AllocationMethod)}>
                      <option value="balanced">Balanced search</option>
                      <option value="simple_random">Simple random</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="eyebrow">Age unit</span>
                    <select value={ageUnit} onChange={event => setAgeUnit(event.target.value as AgeUnit)}>
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                      <option value="years">Years</option>
                    </select>
                  </label>
                </div>
                <p className="muted tiny">
                  Ages are interpreted in this unit and are not converted. The default is weeks to match the example sheet and legacy tool.
                </p>
                <div className="field-row">
                  <label className="field">
                    <span className="eyebrow">Random seed</span>
                    <input type="number" step="1" value={seed} onChange={event => setSeed(Number(event.target.value))} />
                  </label>
                  <button className="pill soft" type="button" onClick={() => setSeed(window.crypto.getRandomValues(new Uint32Array(1))[0])}>
                    New seed
                  </button>
                </div>
                <label className="field">
                  <span className="eyebrow">Run name</span>
                  <input value={runName} onChange={event => setRunName(event.target.value)} />
                </label>

                <div className="field-row">
                  <label className="field">
                    <span className="eyebrow">Number of groups</span>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={numGroups}
                      onChange={event => setNumGroups(Math.max(1, Math.min(20, parseInt(event.target.value) || 1)))}
                      data-testid="num-groups-input"
                    />
                  </label>
                  <span className="muted tiny">Eligible animals: {eligibleAnimals.length}</span>
                </div>
                <div className="field">
                  <span className="muted tiny">Group names and capacities</span>
                  {Array.from({ length: numGroups }, (_, index) => (
                    <div className="template-row" key={index}>
                      <input
                        value={groupNames[index] ?? `Group ${index + 1}`}
                        aria-label={`Group ${index + 1} name`}
                        onChange={event => setGroupNames(previous => {
                          const next = [...previous]
                          next[index] = event.target.value
                          return next
                        })}
                        placeholder={`Group ${index + 1}`}
                      />
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={effectiveGroupSizes[index] ?? 0}
                        aria-label={`${groupNames[index] || `Group ${index + 1}`} capacity`}
                        onChange={event => setGroupSize(index, event.target.value)}
                      />
                    </div>
                  ))}
                  <div className="field-row">
                    <span className="muted tiny">Requested capacity: {effectiveGroupSizes.reduce((total, size) => total + size, 0)}</span>
                    <button className="pill soft" type="button" onClick={() => setGroupSizes(distributeEvenly(eligibleAnimals.length, numGroups))}>
                      Fill evenly
                    </button>
                  </div>
                </div>

                {allocationMethod === 'balanced' && (
                  <div className="field">
                    <div className="section-title">Balance priority</div>
                    <p className="muted tiny">The search prioritizes these selected variables in order. It does not guarantee an optimal allocation.</p>
                    {BALANCE_FIELDS.map(field => {
                      const priority = balancePriorities.indexOf(field)
                      const label = field === 'age' ? `Age (${ageUnit})` : field === 'sex' ? 'Sex proportions' : 'Genotype proportions'
                      return (
                        <div className="field-row" key={field}>
                          <label className="pill soft">
                            <input
                              type="checkbox"
                              checked={priority >= 0}
                              onChange={event => setBalancePriorities(previous => event.target.checked
                                ? [...previous, field]
                                : previous.filter(value => value !== field))}
                            />
                            <span>{label}</span>
                          </label>
                          {priority >= 0 && (
                            <span className="field-row">
                              <span className="muted tiny">Priority {priority + 1}</span>
                              <button className="pill" type="button" aria-label={`Move ${label} up`} onClick={() => movePriority(field, -1)} disabled={priority === 0}>↑</button>
                              <button className="pill" type="button" aria-label={`Move ${label} down`} onClick={() => movePriority(field, 1)} disabled={priority === balancePriorities.length - 1}>↓</button>
                            </span>
                          )}
                        </div>
                      )
                    })}
                    {balancePriorities.length === 0 && <p className="muted tiny">Choose at least one balance variable.</p>}
                  </div>
                )}

                <div className="field">
                  <div className="section-title">Hard rules</div>
                  <p className="muted tiny">Locks and together/apart rules must be satisfied before balance is compared.</p>
                  <div className="template-row">
                    <select aria-label="First animal for rule" value={ruleFirstAnimal} onChange={event => setRuleFirstAnimal(event.target.value)}>
                      <option value="">First animal</option>
                      {eligibleAnimals.map(animal => <option key={animal.animal_id} value={animal.animal_id}>{animal.animal_id}</option>)}
                    </select>
                    <select aria-label="Rule type" value={ruleType} onChange={event => setRuleType(event.target.value as 'together' | 'apart')}>
                      <option value="together">Keep together</option>
                      <option value="apart">Keep apart</option>
                    </select>
                    <select aria-label="Second animal for rule" value={ruleSecondAnimal} onChange={event => setRuleSecondAnimal(event.target.value)}>
                      <option value="">Second animal</option>
                      {eligibleAnimals.map(animal => <option key={animal.animal_id} value={animal.animal_id}>{animal.animal_id}</option>)}
                    </select>
                    <button className="pill" type="button" onClick={addPairRule}>Add rule</button>
                  </div>
                  {[...togetherRules.map((rule, index) => ({ ...rule, type: 'together' as const, index })),
                    ...apartRules.map((rule, index) => ({ ...rule, type: 'apart' as const, index }))].map(rule => (
                    <div className="field-row" key={`${rule.type}-${rule.index}-${rule.animal_id_a}-${rule.animal_id_b}`}>
                      <span className="muted tiny">{rule.animal_id_a} {rule.type === 'together' ? 'with' : 'apart from'} {rule.animal_id_b}</span>
                      <button className="pill" type="button" aria-label={`Remove ${rule.type} rule for ${rule.animal_id_a} and ${rule.animal_id_b}`} onClick={() => {
                        if (rule.type === 'together') setTogetherRules(previous => previous.filter((_, index) => index !== rule.index))
                        else setApartRules(previous => previous.filter((_, index) => index !== rule.index))
                      }}>Remove</button>
                    </div>
                  ))}
                  {lockedAssignments.map(lock => (
                    <div className="field-row" key={lock.animal_id}>
                      <span className="muted tiny">{lock.animal_id} stays in {groupNames[lock.group_number - 1] ?? `Group ${lock.group_number}`}</span>
                      <button className="pill" type="button" onClick={() => updateLocks(lockedAssignments.filter(item => item.animal_id !== lock.animal_id))}>Unlock</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="sidebar-section">
            <div className="section-title">Actions</div>
            <div className="edit-actions">
              <GuidedTutorial
                steps={tutorialSteps}
                startLabel="Tutorial"
              />
              <button
                onClick={mode === 'distribute' ? handleDistribute : handlePair}
                disabled={loading}
                data-testid="process-btn"
                className="accent"
                type="button"
              >
                {loading ? 'Processing…' : mode === 'distribute' ? 'Generate allocation' : 'Pair Animals'}
              </button>
              {hasResults && (
                <button onClick={handleExport} className="ghost" type="button" data-testid="pairing-export-btn">
                  <Download className="icon" aria-hidden="true" />
                  Export to Excel
                </button>
              )}
            </div>
            {mode === 'distribute' && (
              <button className="ghost" type="button" onClick={resetWorkspace}>Reset saved work</button>
            )}
          </div>

          <div className="sidebar-section">
            <div className="section-title">Sheet Helper</div>
            <div className="link-panel">
              <div className="field">
                <span className="muted tiny">Paste this prompt into ChatGPT, Gemini, or Grok, then paste the CSV here.</span>
              </div>
              <div className="edit-actions">
                <a href="https://chat.openai.com/" target="_blank" rel="noreferrer" className="pill soft">ChatGPT</a>
                <a href="https://gemini.google.com/app" target="_blank" rel="noreferrer" className="pill soft">Gemini</a>
                <a href="https://grok.com/" target="_blank" rel="noreferrer" className="pill soft">Grok</a>
              </div>
              <pre className="data-textarea" aria-label="Formatting prompt">
                Convert to CSV with headers: Animal_ID, Genotype, Sex, Age. Preserve the original age value and state its unit in a separate Age Unit column. Normalize Sex to Male/Female, keep all rows, and do not invent missing values. Output CSV only.
              </pre>
            </div>
          </div>
        </aside>

        <section className="panel editor" data-testid="pairing-results-panel">
          <div className="editor-header">
            <div className="title-row">
              <h1>Results</h1>
              <span className={`status-chip ${hasResults ? 'success' : 'warning'}`}>
                {hasResults ? 'Ready' : 'Waiting'}
              </span>
            </div>
            <div className="chip-row">
              {mode === 'pair' && summary && <span className="pill soft">{summary}</span>}
              {visibleGroups.length > 0 && <span className="pill">Groups: {visibleGroups.length}</span>}
              {pairs.length > 0 && <span className="pill">Pairs: {pairs.length}</span>}
            </div>
          </div>

          <div className="editor-body">
            {mode === 'distribute' && reviewedAllocation && !hasCurrentAllocation && (
              <div className="today-card" role="status">
                <h2>Review is out of date</h2>
                <p className="muted">Inputs, group sizes, or rules changed. Generate again before exporting these assignments.</p>
              </div>
            )}

            {currentAllocation && !currentAllocation.allocation_found && (
              <div className="today-card" role="status">
                <h2>No valid allocation found</h2>
                <p className="muted">The seeded search made {currentAllocation.search_attempts} attempts and checked {currentAllocation.search_nodes_checked} constraint placements without finding a valid allocation. This does not prove that no valid allocation exists.</p>
                {currentAllocation.unassigned_animals.length > 0 && (
                  <p className="muted">All {currentAllocation.unassigned_animals.length} eligible animals remain listed as unassigned.</p>
                )}
              </div>
            )}

            {currentAllocation?.allocation_found && (
              <div className="today-card" data-testid="allocation-review-summary">
                <div className="today-head">
                  <div>
                    <h2>Allocation review</h2>
                    <p className="muted tiny">
                      {currentAllocation.method === 'simple_random' ? 'Simple random' : 'Balanced search'} · Seed {currentAllocation.seed} · {currentAllocation.algorithm_version}
                    </p>
                  </div>
                  <span className="pill soft">Search attempts: {currentAllocation.search_attempts}</span>
                  {currentAllocation.search_nodes_checked > 0 && (
                    <span className="pill soft">Constraint checks: {currentAllocation.search_nodes_checked}</span>
                  )}
                </div>
                <div className="chip-row">
                  <span className="pill">Eligible pool: {currentAllocation.balance.eligible_pool.count}</span>
                  <span className="pill">Assigned: {currentAllocation.groups.reduce((total, group) => total + group.count, 0)}</span>
                  <span className="pill">Unassigned: {currentAllocation.unassigned_animals.length}</span>
                  <span className="pill">Excluded by selection: {currentAllocation.excluded_animals.length}</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Group</th>
                        <th>Count</th>
                        <th>Sex proportions</th>
                        <th>Genotype proportions</th>
                        <th>Age distribution</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th>Eligible pool</th>
                        <td>{currentAllocation.balance.eligible_pool.count}</td>
                        <td>{formatCategoryBalance(currentAllocation.balance.eligible_pool.sex)}</td>
                        <td>{formatCategoryBalance(currentAllocation.balance.eligible_pool.genotype)}</td>
                        <td>{formatAgeBalance(currentAllocation.balance.eligible_pool.age, currentAllocation.age_unit)}</td>
                      </tr>
                      {currentAllocation.balance.groups.map(group => (
                        <tr key={group.group_number}>
                          <th>{group.group_name}</th>
                          <td>{group.count} / {group.capacity}</td>
                          <td>{formatCategoryBalance(group.sex)}</td>
                          <td>{formatCategoryBalance(group.genotype)}</td>
                          <td>{formatAgeBalance(group.age, currentAllocation.age_unit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {currentAllocation.limits.map((limit, index) => <p className="muted tiny" key={index}>{limit}</p>)}
              </div>
            )}

            {visibleGroups.length > 0 && (
              <div className="results-grid">
                {visibleGroups.map((group) => (
                  <div key={group.group_number} className="today-card">
                    <div className="today-head">
                      <div>
                        <h2>{group.group_name || `Group ${group.group_number}`}</h2>
                        <p className="muted tiny">{group.count} of {group.capacity ?? group.count} animals</p>
                      </div>
                      <span className="pill soft">{currentAllocation?.method === 'simple_random' ? 'Seeded random' : 'Allocation result'}</span>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Genotype</th>
                            <th>Sex</th>
                            <th>Age ({currentAllocation?.age_unit ?? 'days'})</th>
                            {currentAllocation && <th>Assignment</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {group.animals.map((animal, idx) => (
                            <tr key={idx}>
                              <td><code>{animal.animal_id}</code></td>
                              <td>{animal.genotype}</td>
                              <td>{animal.sex}</td>
                              <td>{animal.age}</td>
                              {currentAllocation && (
                                <td>
                                  {lockedAssignments.some(lock => lock.animal_id === animal.animal_id && lock.group_number === group.group_number)
                                    ? <button className="pill soft" type="button" onClick={() => updateLocks(lockedAssignments.filter(lock => lock.animal_id !== animal.animal_id))}>Locked · unlock</button>
                                    : <button className="pill" type="button" onClick={() => updateLocks([...lockedAssignments.filter(lock => lock.animal_id !== animal.animal_id), { animal_id: animal.animal_id, group_number: group.group_number }])}>Lock here</button>}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {currentAllocation?.allocation_found && currentAllocation.unassigned_animals.length > 0 && (
              <div className="today-card">
                <h2>Unassigned eligible animals</h2>
                <p className="muted tiny">The requested group capacities cover fewer animals than the eligible pool.</p>
                <div className="chip-row">
                  {currentAllocation.unassigned_animals.map(animal => <span className="pill soft" key={animal.animal_id}><code>{animal.animal_id}</code> · {animal.genotype} · {animal.sex} · {animal.age} {currentAllocation.age_unit}</span>)}
                </div>
              </div>
            )}

            {currentAllocation?.allocation_found && currentAllocation.excluded_animals.length > 0 && (
              <div className="today-card">
                <h2>Excluded by selection</h2>
                <p className="muted tiny">These animals are retained in the export but were outside the selected sex or genotype.</p>
                <div className="chip-row">
                  {currentAllocation.excluded_animals.map(animal => <span className="pill soft" key={animal.animal_id}><code>{animal.animal_id}</code> · {animal.genotype} · {animal.sex} · {animal.age} {currentAllocation.age_unit}</span>)}
                </div>
              </div>
            )}

            {pairs.length > 0 && (
              <div className="results-grid">
                <div className="status-chip success">Pairs: {pairs.length} · Unpaired: {unpaired.length}</div>

                {pairs.map((pair, idx) => (
                  <div key={idx} className="today-card">
                    <div className="today-head">
                      <div>
                        <h2>Pair {idx + 1}</h2>
                        <p className="muted tiny">Age difference: {pair.age_difference} days</p>
                      </div>
                      <span className="pill soft">Breeding ready</span>
                    </div>
                    <div className="template-row">
                      <div className="template-card active">
                        <p className="eyebrow">Male</p>
                        <p className="muted"><code>{pair.male.animal_id}</code></p>
                        <p className="muted tiny">{pair.male.genotype} · {pair.male.age} days</p>
                      </div>
                      <div className="template-card active">
                        <p className="eyebrow">Female</p>
                        <p className="muted"><code>{pair.female.animal_id}</code></p>
                        <p className="muted tiny">{pair.female.genotype} · {pair.female.age} days</p>
                      </div>
                    </div>
                  </div>
                ))}

                {unpaired.length > 0 && (
                  <div className="today-card">
                    <div className="today-head">
                      <div>
                        <h2>Unpaired</h2>
                        <p className="muted tiny">{unpaired.length} animals</p>
                      </div>
                      <span className="pill ghost-pill">Needs matching</span>
                    </div>
                    <div className="chip-row">
                      {unpaired.map((animal, idx) => (
                        <span key={idx} className="pill soft">
                          <code>{animal.animal_id}</code> · {animal.sex} · {animal.age}d
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!currentAllocation && visibleGroups.length === 0 && pairs.length === 0 && !(mode === 'distribute' && reviewedAllocation) && (
              <div className="empty">
                <p className="muted">Results will appear here after processing.</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <footer className="signature" data-testid="signature">
        <span className="sig-primary">Made by Meghamsh Teja Konda</span>
        <span className="sig-dot" aria-hidden="true" />
        <a className="sig-link" href="mailto:meghamshteja555@gmail.com">
          meghamshteja555@gmail.com
        </a>
      </footer>
    </div>
  )
}

export default App

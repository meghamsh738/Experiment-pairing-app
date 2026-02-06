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
import exampleAnimals from '../example_data/animals.csv?raw'
import './App.css'

interface AnimalInput {
  animal_id: string
  genotype: string
  sex: string
  age: number
}

interface Group {
  group_number: number
  animals: AnimalInput[]
  count: number
  group_name?: string
}

interface Pair {
  male: AnimalInput
  female: AnimalInput
  age_difference: number
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

const parseTextAnimals = (text: string): AnimalInput[] => {
  const lines = text.trim().split('\n').filter(l => l.trim())
  const animals: AnimalInput[] = []
  for (const line of lines) {
    if (line.toLowerCase().includes('animal') && line.toLowerCase().includes('genotype')) continue
    const parts = line.split(/[, \t]+/).map(p => p.trim()).filter(Boolean)
    if (parts.length >= 4) {
      animals.push({
        animal_id: parts[0],
        genotype: parts[1],
        sex: parts[2],
        age: parseInt(parts[3]) || 0
      })
    }
  }
  return animals
}

const uniqueGenotypes = (animals: AnimalInput[]) => Array.from(new Set(animals.map(a => a.genotype))).sort()

function App() {
  const [animalText, setAnimalText] = useState('')
  const [mode, setMode] = useState<'distribute' | 'pair'>('distribute')
  const [useExampleData, setUseExampleData] = useState(false)
  const [numGroups, setNumGroups] = useState(3)
  const [ageLeeway, setAgeLeeway] = useState(7)
  const [selectedGenotypes, setSelectedGenotypes] = useState<string[]>([])
  const [groupNames, setGroupNames] = useState<string[]>(['Group 1', 'Group 2', 'Group 3'])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [pairs, setPairs] = useState<Pair[]>([])
  const [unpaired, setUnpaired] = useState<AnimalInput[]>([])
  const [summary, setSummary] = useState<string>('')

  const animals = useMemo(
    () => (useExampleData ? parseTextAnimals(EXAMPLE_DATA) : parseTextAnimals(animalText)),
    [useExampleData, animalText]
  )
  const genotypeOptions = useMemo(() => uniqueGenotypes(animals), [animals])

  useEffect(() => {
    if (useExampleData) {
      setAnimalText(EXAMPLE_DATA)
      setSelectedGenotypes(uniqueGenotypes(parseTextAnimals(EXAMPLE_DATA)))
    }
  }, [useExampleData])

  useEffect(() => {
    setGroupNames((prev) => Array.from({ length: numGroups }, (_, i) => prev[i] || `Group ${i + 1}`))
  }, [numGroups])

  useEffect(() => {
    if (!useExampleData) {
      setSelectedGenotypes(uniqueGenotypes(parseTextAnimals(animalText)))
    }
  }, [animalText, useExampleData])

  const filteredAnimals = useMemo(() => {
    if (!selectedGenotypes.length) return animals
    return animals.filter(a => selectedGenotypes.includes(a.genotype))
  }, [animals, selectedGenotypes])

  const handleUpload = async (file: File) => {
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData })
      if (!response.ok) throw new Error('Upload failed')
      const data = await response.json()
      const csvText = ['Animal_ID,Genotype,Sex,Age', ...data.animals.map((a: AnimalInput) => `${a.animal_id},${a.genotype},${a.sex},${a.age}`)].join('\n')
      setUseExampleData(false)
      setAnimalText(csvText)
      setSelectedGenotypes(data.genotypes || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDistribute = async () => {
    if (filteredAnimals.length === 0) {
      setError('Please provide animal data first')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE}/distribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          animals: filteredAnimals,
          num_groups: numGroups,
          age_leeway: ageLeeway,
          selected_genotypes: selectedGenotypes,
          group_names: groupNames,
          use_example: useExampleData
        })
      })
      if (!response.ok) throw new Error('Failed to distribute animals')
      const data = await response.json()
      setGroups(data.groups || [])
      setSummary(data.summary || '')
      setPairs([])
      setUnpaired([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handlePair = async () => {
    if (filteredAnimals.length === 0) {
      setError('Please provide animal data first')
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
      if (!response.ok) throw new Error('Failed to pair animals')
      const data = await response.json()
      setPairs(data.pairs || [])
      setUnpaired(data.unpaired || [])
      setSummary(data.summary || '')
      setGroups([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    if (filteredAnimals.length === 0) {
      setError('Please provide animal data first')
      return
    }
    try {
      const endpoint = mode === 'distribute' ? '/export-distribute' : '/export-pairs'
      const body = mode === 'distribute'
        ? {
          animals: filteredAnimals,
          num_groups: numGroups,
          age_leeway: ageLeeway,
          selected_genotypes: selectedGenotypes,
          group_names: groupNames,
          use_example: useExampleData
        }
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
      if (!response.ok) throw new Error('Failed to export')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = mode === 'distribute' ? 'animal_distribution.xlsx' : 'animal_pairs.xlsx'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    }
  }

  const hasResults = groups.length > 0 || pairs.length > 0
  const statusLabel = loading ? 'Processing' : 'Ready'
  const statusClass = loading ? 'warning' : 'success'
  const modeLabel = mode === 'distribute' ? 'Group mode' : 'Pair mode'

  return (
    <div className="app-bg">
      <header className="panel">
        <div className="lab-head">
          <div>
            <p className="eyebrow">Experiment pairing</p>
            <h2>Animal Pairing &amp; Grouping Tool</h2>
            <p className="muted">Balance cohorts or breeding pairs with consistent ages and genotypes.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`status-chip ${statusClass}`}>{statusLabel}</span>
            <span className="pill soft">{modeLabel}</span>
            <span className="pill">
              <FlaskConical className="icon" aria-hidden="true" />
              Lab-ready export
            </span>
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
              <p className="muted">Upload a CSV/XLSX or paste rows with Animal_ID, Genotype, Sex, Age.</p>
            </div>
            <button className="pill soft" onClick={() => setUseExampleData(true)} type="button">
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
            <p className="muted tiny">Paste rows or upload a file. This app normalizes into CSV.</p>
            <div className="chip-row">
              <label className="pill soft">
                <input
                  type="checkbox"
                  checked={useExampleData}
                  onChange={(e) => setUseExampleData(e.target.checked)}
                />
                <span>Use Example Data</span>
              </label>
              <button className="pill" onClick={() => setUseExampleData(true)} type="button">
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
                value={useExampleData ? EXAMPLE_DATA : animalText}
                onChange={(e) => {
                  setUseExampleData(false)
                  setAnimalText(e.target.value)
                }}
              />
              <p className="muted tiny">
                Parsed animals: {filteredAnimals.length} · Genotypes: {genotypeOptions.join(', ') || 'None'}
              </p>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="field-row">
              <div>
                <div className="section-title">Genotypes</div>
                <p className="muted tiny">Only selected genotypes are included in pairing/grouping.</p>
              </div>
              {genotypeOptions.length > 0 && (
                <button className="pill soft" onClick={() => setSelectedGenotypes(genotypeOptions)} type="button">
                  Select all
                </button>
              )}
            </div>
            <div className="chip-row">
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

          <div className="sidebar-section">
            <div className="section-title">Settings</div>
            <div className="template-row">
              <label className="field">
                <span className="eyebrow">Age Leeway (days)</span>
                <input
                  type="number"
                  min="0"
                  value={ageLeeway}
                  onChange={(e) => setAgeLeeway(parseInt(e.target.value) || 0)}
                />
              </label>
              {mode === 'distribute' && (
                <label className="field">
                  <span className="eyebrow">Number of Groups</span>
                  <input
                    type="number"
                    min="1"
                    value={numGroups}
                    onChange={(e) => setNumGroups(parseInt(e.target.value) || 1)}
                  />
                </label>
              )}
            </div>

            {mode === 'distribute' && (
              <div className="field">
                <span className="muted tiny">Group names (optional)</span>
                <div className="template-row">
                  {groupNames.map((name, idx) => (
                    <input
                      key={idx}
                      value={name}
                      aria-label={`Group ${idx + 1} name`}
                      onChange={(e) => {
                        const copy = [...groupNames]
                        copy[idx] = e.target.value
                        setGroupNames(copy)
                      }}
                      placeholder={`Group ${idx + 1} name`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <div className="section-title">Actions</div>
            <div className="edit-actions">
              <button
                onClick={mode === 'distribute' ? handleDistribute : handlePair}
                disabled={loading}
                data-testid="process-btn"
                className="accent"
                type="button"
              >
                {loading ? 'Processing…' : mode === 'distribute' ? 'Distribute Animals' : 'Pair Animals'}
              </button>
              {hasResults && (
                <button onClick={handleExport} className="ghost" type="button">
                  <Download className="icon" aria-hidden="true" />
                  Export to Excel
                </button>
              )}
            </div>
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
                Convert to CSV with headers: Animal_ID, Genotype, Sex, Age. Normalize Sex to Male/Female, Age in weeks (number). If DOB exists, compute Age in weeks using today&apos;s date. Keep all rows, no invented data. Output CSV only.
              </pre>
            </div>
          </div>
        </aside>

        <section className="panel editor">
          <div className="editor-header">
            <div className="title-row">
              <h1>Results</h1>
              <span className={`status-chip ${hasResults ? 'success' : 'warning'}`}>
                {hasResults ? 'Ready' : 'Waiting'}
              </span>
            </div>
            <div className="chip-row">
              {summary && <span className="pill soft">{summary}</span>}
              {groups.length > 0 && <span className="pill">Groups: {groups.length}</span>}
              {pairs.length > 0 && <span className="pill">Pairs: {pairs.length}</span>}
            </div>
          </div>

          <div className="editor-body">
            {groups.length > 0 && (
              <div className="results-grid">
                {groups.map((group) => (
                  <div key={group.group_number} className="today-card">
                    <div className="today-head">
                      <div>
                        <h2>{group.group_name || `Group ${group.group_number}`}</h2>
                        <p className="muted tiny">{group.count} animals</p>
                      </div>
                      <span className="pill soft">Balanced cohort</span>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Genotype</th>
                            <th>Sex</th>
                            <th>Age (days)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.animals.map((animal, idx) => (
                            <tr key={idx}>
                              <td><code>{animal.animal_id}</code></td>
                              <td>{animal.genotype}</td>
                              <td>{animal.sex}</td>
                              <td>{animal.age}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
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

            {groups.length === 0 && pairs.length === 0 && (
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

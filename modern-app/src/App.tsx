import { useEffect, useMemo, useState } from 'react'
import exampleAnimals from '../example_data/animals.csv?raw'

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
    setGroupNames(Array.from({ length: numGroups }, (_, i) => groupNames[i] || `Group ${i + 1}`))
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
      const response = await fetch('http://localhost:8001/upload', { method: 'POST', body: formData })
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
      const response = await fetch('http://localhost:8001/distribute', {
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
      const response = await fetch('http://localhost:8001/pair', {
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
      const response = await fetch(`http://localhost:8001${endpoint}`, {
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

  return (
    <div className="ui-container">
      <div className="ui-stack">
        <header className="ui-header">
          <h1 className="ui-title">Experiment Pairing App</h1>
          <p className="ui-subtitle">Upload or paste animals, select genotypes, distribute into groups or pair, and export.</p>
        </header>

        {error && (
          <div className="ui-alert error">
            <div>
              <strong>Error:</strong> {error}
            </div>
            <button onClick={() => setError(null)} className="ui-btn ghost compact">Dismiss</button>
          </div>
        )}

        <section className="ui-panel">
          <div className="ui-stack sm">
            <div className="ui-row">
              <div className="ui-field">
                <div className="ui-label">Mode</div>
                <div className="ui-hint">Choose whether you want groups or breeding pairs.</div>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <button
                  onClick={() => setMode('distribute')}
                  data-testid="mode-distribute"
                  className={`ui-btn ${mode === 'distribute' ? 'primary' : 'secondary'} flex-1 sm:flex-none`}
                >
                  Distribute into Groups
                </button>
                <button
                  onClick={() => setMode('pair')}
                  data-testid="mode-pair"
                  className={`ui-btn ${mode === 'pair' ? 'primary' : 'secondary'} flex-1 sm:flex-none`}
                >
                  Pair Animals
                </button>
              </div>
            </div>

            <div className="ui-field">
              <div className="ui-row">
                <div>
                  <div className="ui-label">Data Source</div>
                  <div className="ui-hint">Upload CSV/XLSX or paste rows (Animal_ID, Genotype, Sex, Age).</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={useExampleData}
                      onChange={(e) => setUseExampleData(e.target.checked)}
                    />
                    <span>Use Example Data</span>
                  </label>
                  <button onClick={() => setUseExampleData(true)} className="ui-btn ghost compact">Reload Sample</button>
                  <label className="ui-btn ghost compact">
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
              </div>

              <textarea
                className="ui-textarea mono"
                placeholder="Animal_ID,Genotype,Sex,Age"
                value={useExampleData ? EXAMPLE_DATA : animalText}
                onChange={(e) => {
                  setUseExampleData(false)
                  setAnimalText(e.target.value)
                }}
              />
              <div className="ui-hint">
                Parsed animals: {filteredAnimals.length} · Genotypes: {genotypeOptions.join(', ') || 'None'}
              </div>
            </div>

            <div className="ui-panel compact">
              <div className="ui-row">
                <div>
                  <div className="ui-label">Need to reformat your sheet?</div>
                  <div className="ui-hint">Paste this prompt into ChatGPT, Gemini, or Grok; paste the returned CSV here.</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a href="https://chat.openai.com/" target="_blank" rel="noreferrer" className="ui-btn ghost compact">ChatGPT</a>
                  <a href="https://gemini.google.com/app" target="_blank" rel="noreferrer" className="ui-btn ghost compact">Gemini</a>
                  <a href="https://grok.com/" target="_blank" rel="noreferrer" className="ui-btn ghost compact">Grok</a>
                </div>
              </div>
              <pre className="ui-codeblock">Convert to CSV with headers: Animal_ID, Genotype, Sex, Age. Normalize Sex to Male/Female, Age in weeks (number). If DOB exists, compute Age in weeks using today&apos;s date. Keep all rows, no invented data. Output CSV only.</pre>
            </div>

            <div className="ui-field">
              <div className="ui-row">
                <div>
                  <div className="ui-label">Genotype Selection</div>
                  <div className="ui-hint">Only selected genotypes are included in pairing/grouping.</div>
                </div>
                {genotypeOptions.length > 0 && (
                  <button className="ui-btn ghost compact" onClick={() => setSelectedGenotypes(genotypeOptions)}>
                    Select all
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {genotypeOptions.map(g => (
                  <label key={g} className="ui-pill">
                    <input
                      type="checkbox"
                      checked={selectedGenotypes.includes(g)}
                      onChange={(e) => {
                        setSelectedGenotypes(prev => e.target.checked ? [...prev, g] : prev.filter(x => x !== g))
                      }}
                    />
                    {g}
                  </label>
                ))}
                {genotypeOptions.length === 0 && <span className="ui-hint">No genotypes detected</span>}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {mode === 'distribute' && (
                <div className="ui-field">
                  <div className="ui-label">Number of Groups</div>
                  <input
                    type="number"
                    min="1"
                    className="ui-input"
                    value={numGroups}
                    onChange={(e) => setNumGroups(parseInt(e.target.value) || 1)}
                  />
                  <div className="ui-field">
                    <div className="ui-hint">Group names (optional)</div>
                    <div className="grid gap-2">
                      {groupNames.map((name, idx) => (
                        <input
                          key={idx}
                          className="ui-input compact"
                          value={name}
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
                </div>
              )}

              <div className="ui-field">
                <div className="ui-label">Age Leeway (days)</div>
                <input
                  type="number"
                  min="0"
                  className="ui-input"
                  value={ageLeeway}
                  onChange={(e) => setAgeLeeway(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <button
                onClick={mode === 'distribute' ? handleDistribute : handlePair}
                disabled={loading}
                data-testid="process-btn"
                className="ui-btn primary w-full"
              >
                {loading ? 'Processing…' : mode === 'distribute' ? 'Distribute Animals' : 'Pair Animals'}
              </button>
              {hasResults && (
                <button onClick={handleExport} className="ui-btn secondary w-full">
                  Export to Excel
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="ui-panel">
          <div className="ui-row">
            <h2 className="ui-h2">Results</h2>
            {summary && <span className="ui-hint">{summary}</span>}
          </div>

          {groups.length > 0 && (
            <div className="ui-stack sm">
              {groups.map((group) => (
                <div key={group.group_number} className="ui-panel compact">
                  <div className="ui-row">
                    <div className="ui-label">
                      {group.group_name || `Group ${group.group_number}`}
                    </div>
                    <span className="ui-hint">{group.count} animals</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="ui-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Genotype</th>
                          <th>Sex</th>
                          <th>Age</th>
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
            <div className="ui-stack sm">
              <div className="ui-alert">
                <div>
                  <strong>Pairs:</strong> {pairs.length} · <strong>Unpaired:</strong> {unpaired.length}
                </div>
              </div>

              {pairs.map((pair, idx) => (
                <div key={idx} className="ui-panel compact">
                  <div className="ui-row">
                    <div className="ui-label">Pair {idx + 1}</div>
                    <span className="ui-hint">Age diff: {pair.age_difference} days</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 text-sm">
                    <div className="ui-panel compact">
                      <div className="ui-label">Male</div>
                      <div className="ui-hint"><code>{pair.male.animal_id}</code></div>
                      <div className="ui-hint">{pair.male.genotype} · {pair.male.age} days</div>
                    </div>
                    <div className="ui-panel compact">
                      <div className="ui-label">Female</div>
                      <div className="ui-hint"><code>{pair.female.animal_id}</code></div>
                      <div className="ui-hint">{pair.female.genotype} · {pair.female.age} days</div>
                    </div>
                  </div>
                </div>
              ))}

              {unpaired.length > 0 && (
                <div className="ui-panel compact">
                  <div className="ui-row">
                    <div className="ui-label">Unpaired animals</div>
                    <span className="ui-hint">{unpaired.length}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 text-sm">
                    {unpaired.map((animal, idx) => (
                      <div key={idx} className="ui-hint">
                        <code>{animal.animal_id}</code> · {animal.sex} · {animal.age}d
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {groups.length === 0 && pairs.length === 0 && (
            <div className="ui-panel compact text-center">
              <p className="ui-hint">Results will appear here after processing.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default App

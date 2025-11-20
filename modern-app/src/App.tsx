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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <header className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-4">
            Experiment Pairing App
          </h1>
          <p className="text-gray-600 text-lg">Upload or paste animals, select genotypes, distribute or pair, and export.</p>
        </header>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <strong>Error:</strong> {error}
            <button onClick={() => setError(null)} className="ml-4 text-red-900 underline">Dismiss</button>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-8 items-start">
          <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
            <div className="flex gap-4">
              <button
                onClick={() => setMode('distribute')}
                data-testid="mode-distribute"
                className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-all ${mode === 'distribute' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Distribute into Groups
              </button>
              <button
                onClick={() => setMode('pair')}
                data-testid="mode-pair"
                className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-all ${mode === 'pair' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Pair Animals
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Data Source</p>
                  <p className="text-xs text-gray-500">Upload CSV/XLSX or paste data</p>
                </div>
                <div className="flex flex-wrap gap-3 items-center">
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <input
                      type="checkbox"
                      className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      checked={useExampleData}
                      onChange={(e) => setUseExampleData(e.target.checked)}
                    />
                    Use Example Data
                  </label>
                  <button
                    onClick={() => setUseExampleData(true)}
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1 rounded transition-colors"
                  >
                    Reload Sample
                  </button>
                  <label className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1 rounded cursor-pointer">
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
                className="w-full h-40 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm resize-none"
                placeholder="Animal_ID,Genotype,Sex,Age"
                value={useExampleData ? EXAMPLE_DATA : animalText}
                onChange={(e) => {
                  setUseExampleData(false)
                  setAnimalText(e.target.value)
                }}
              />
              <div className="text-xs text-gray-500">
                Parsed animals: {filteredAnimals.length} | Genotypes: {genotypeOptions.join(', ') || 'None'}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Genotype Selection</p>
                <div className="flex flex-wrap gap-2">
                  {genotypeOptions.map(g => (
                    <label key={g} className="flex items-center gap-2 text-sm bg-gray-100 px-3 py-1 rounded">
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
                  {genotypeOptions.length === 0 && <span className="text-xs text-gray-500">No genotypes detected</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {mode === 'distribute' && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Number of Groups</label>
                    <input
                      type="number"
                      min="1"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={numGroups}
                      onChange={(e) => setNumGroups(parseInt(e.target.value) || 1)}
                    />
                    <div className="mt-2 space-y-1 text-xs text-gray-600">
                      {groupNames.map((name, idx) => (
                        <input
                          key={idx}
                          className="w-full px-2 py-1 border border-gray-200 rounded"
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
                )}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Age Leeway (days)</label>
                  <input
                    type="number"
                    min="0"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={ageLeeway}
                    onChange={(e) => setAgeLeeway(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={mode === 'distribute' ? handleDistribute : handlePair}
                disabled={loading}
                data-testid="process-btn"
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : mode === 'distribute' ? 'Distribute Animals' : 'Pair Animals'}
              </button>
              {(groups.length > 0 || pairs.length > 0) && (
                <button
                  onClick={handleExport}
                  className="w-full bg-green-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-green-700 transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  Export to Excel
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800">Results & Summary</h2>
              {summary && <span className="text-xs text-gray-500 max-w-md text-right">{summary}</span>}
            </div>

            {groups.length > 0 && (
              <div className="space-y-4">
                {groups.map((group) => (
                  <div key={group.group_number} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-bold text-lg text-blue-600 mb-2">
                      {group.group_name || `Group ${group.group_number}`} ({group.count} animals)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="px-3 py-2 text-left">ID</th>
                            <th className="px-3 py-2 text-left">Genotype</th>
                            <th className="px-3 py-2 text-left">Sex</th>
                            <th className="px-3 py-2 text-left">Age</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.animals.map((animal, idx) => (
                            <tr key={idx} className="border-t border-gray-100">
                              <td className="px-3 py-2 font-mono">{animal.animal_id}</td>
                              <td className="px-3 py-2">{animal.genotype}</td>
                              <td className="px-3 py-2">{animal.sex}</td>
                              <td className="px-3 py-2">{animal.age}</td>
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
              <div className="space-y-4">
                <div className="p-4 bg-indigo-50 rounded-lg">
                  <h3 className="font-semibold text-indigo-900">
                    Found {pairs.length} pairs, {unpaired.length} unpaired
                  </h3>
                </div>
                {pairs.map((pair, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-bold text-lg text-indigo-600 mb-2">
                      Pair {idx + 1} (Age diff: {pair.age_difference} days)
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-blue-50 p-3 rounded">
                        <p className="font-semibold text-blue-900">♂ Male</p>
                        <p>ID: {pair.male.animal_id}</p>
                        <p>Genotype: {pair.male.genotype}</p>
                        <p>Age: {pair.male.age} days</p>
                      </div>
                      <div className="bg-pink-50 p-3 rounded">
                        <p className="font-semibold text-pink-900">♀ Female</p>
                        <p>ID: {pair.female.animal_id}</p>
                        <p>Genotype: {pair.female.genotype}</p>
                        <p>Age: {pair.female.age} days</p>
                      </div>
                    </div>
                  </div>
                ))}

                {unpaired.length > 0 && (
                  <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
                    <h3 className="font-bold text-lg text-amber-900 mb-2">
                      Unpaired Animals ({unpaired.length})
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {unpaired.map((animal, idx) => (
                        <div key={idx} className="text-amber-800">
                          {animal.animal_id} ({animal.sex}, {animal.age}d)
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {groups.length === 0 && pairs.length === 0 && (
              <div className="text-center text-gray-400 py-12">
                <p>Results will appear here after processing</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App

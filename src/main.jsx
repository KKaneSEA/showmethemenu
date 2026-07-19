import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

function App() {
  const [restaurant, setRestaurant] = useState('')
  const [location, setLocation] = useState('')
  const [isLocationOpen, setIsLocationOpen] = useState(false)
  const [locationResults, setLocationResults] = useState([])
  const [isLoadingLocations, setIsLoadingLocations] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searchError, setSearchError] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    const query = location.trim()
    if (query.length < 2) {
      setLocationResults([])
      setLocationError('')
      setIsLoadingLocations(false)
      return undefined
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setIsLoadingLocations(true)
      setLocationError('')

      try {
        const response = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=en&format=json`,
          { signal: controller.signal },
        )
        if (!response.ok) throw new Error('Location search failed')

        const data = await response.json()
        setLocationResults((data.results ?? []).map((place) => ({
          id: `${place.id}-${place.latitude}-${place.longitude}`,
          label: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
        })))
      } catch (error) {
        if (error.name !== 'AbortError') {
          setLocationResults([])
          setLocationError('Location search is unavailable. Try again shortly.')
        }
      } finally {
        if (!controller.signal.aborted) setIsLoadingLocations(false)
      }
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [location])

  const submitSearch = async (event) => {
    event.preventDefault()
    setSearchError('')
    setSearchResult(null)
    setIsSearching(true)

    try {
      const query = new URLSearchParams({ restaurant, location })
      const response = await fetch(`/api/menu-search?${query}`)
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'The menu service is unavailable. Restart npm run dev and try again.')
      }
      if (!data) throw new Error('The menu service returned an invalid response.')
      setSearchResult(data)
    } catch (error) {
      setSearchError(error.message || 'Menu search failed.')
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <main className="poster">
      <section className="hero" aria-labelledby="page-title">
        <h1 id="page-title">
          <span>show Me</span>
          <span>the menu!</span>
        </h1>

        <p>I want to see the menu for…</p>

        <form onSubmit={submitSearch}>
          <div className="field-control">
            <label className="sr-only" htmlFor="restaurant">Restaurant</label>
            <input
              id="restaurant"
              name="restaurant"
              placeholder="Restaurant"
              value={restaurant}
              onChange={(event) => setRestaurant(event.target.value)}
              autoComplete="organization"
            />
            {restaurant && (
              <button className="clear-field" type="button" onClick={() => setRestaurant('')} aria-label="Clear restaurant">
                ×
              </button>
            )}
          </div>
          <div className="location-picker">
            <label className="sr-only" htmlFor="location">City, state, or country</label>
            <input
              id="location"
              name="location"
              placeholder="City/state"
              value={location}
              onChange={(event) => {
                setLocation(event.target.value)
                setIsLocationOpen(true)
              }}
              onFocus={() => setIsLocationOpen(true)}
              onBlur={() => window.setTimeout(() => setIsLocationOpen(false), 150)}
              autoComplete="off"
              role="combobox"
              aria-expanded={isLocationOpen}
              aria-controls="location-options"
              aria-autocomplete="list"
            />
            {location && (
              <button className="clear-field" type="button" onClick={() => setLocation('')} aria-label="Clear location">
                ×
              </button>
            )}
            {isLocationOpen && (
              <ul id="location-options" className="location-options" role="listbox">
                {location.trim().length < 2 && <li className="no-location">Type at least 2 characters</li>}
                {isLoadingLocations && <li className="no-location">Searching locations…</li>}
                {locationError && <li className="no-location">{locationError}</li>}
                {!isLoadingLocations && !locationError && location.trim().length >= 2 && locationResults.length === 0 && (
                  <li className="no-location">No matching locations</li>
                )}
                {locationResults.map((place) => (
                  <li key={place.id} role="option" aria-selected={place.label === location}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setLocation(place.label)
                        setIsLocationOpen(false)
                      }}
                    >
                      {place.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="submit" disabled={isSearching || !restaurant.trim() || !location.trim()}>
            {isSearching ? 'Searching…' : 'Go!'}
          </button>
        </form>
      </section>

      {(searchResult || searchError) && (
        <section className="menu-result" aria-live="polite">
          {searchError && <p className="search-error">{searchError}</p>}
          {searchResult && (
            <>
              <h2>{searchResult.restaurant}</h2>
              <a href={searchResult.menuUrl || searchResult.officialWebsite} target="_blank" rel="noreferrer">
                {searchResult.menuUrl ? 'Open menu ↗' : 'Open restaurant website ↗'}
              </a>
              {searchResult.menuText ? (
                <p className="menu-text">{searchResult.menuText}</p>
              ) : <p>{searchResult.message}</p>}
            </>
          )}
        </section>
      )}
    </main>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

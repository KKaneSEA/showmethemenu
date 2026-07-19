import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function EyesTrail() {
  const canvasRef = useRef(null);
  const eyesRef = useRef([]);
  const animationFrameRef = useRef(null);
  const lastSpawnRef = useRef(0);

  useEffect(() => {
    if (
      !window.matchMedia("(pointer: fine)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return undefined;

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return undefined;

    const resize = () => {
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * pixelRatio;
      canvas.height = window.innerHeight * pixelRatio;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const addEyes = (event) => {
      const now = performance.now();
      if (now - lastSpawnRef.current < 70) return;
      lastSpawnRef.current = now;

      for (let index = 0; index < 1; index += 1) {
        eyesRef.current.push({
          x: event.clientX + (Math.random() - 0.5) * 38,
          y: event.clientY + (Math.random() - 0.5) * 30,
          vx: (Math.random() - 0.5) * 0.7,
          vy: Math.random() * 0.35 + 0.15,
          size: Math.random() * 12 + 17,
          opacity: 0.8,
          decay: 0.018,
        });
      }
    };

    const animate = () => {
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const eyes = eyesRef.current;

      for (let index = eyes.length - 1; index >= 0; index -= 1) {
        const eye = eyes[index];
        eye.x += eye.vx;
        eye.y += eye.vy;
        eye.opacity -= eye.decay;
        eye.size *= 0.992;

        if (eye.opacity <= 0) {
          eyes.splice(index, 1);
          continue;
        }

        context.save();
        context.globalAlpha = eye.opacity;
        context.font = `${eye.size}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("👀", eye.x, eye.y);
        context.restore();
      }

      animationFrameRef.current = window.requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("mousemove", addEyes);
    animationFrameRef.current = window.requestAnimationFrame(animate);

    return () => {
      document.removeEventListener("mousemove", addEyes);
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(animationFrameRef.current);
      eyesRef.current = [];
    };
  }, []);

  return <canvas ref={canvasRef} className="eyes-trail" aria-hidden="true" />;
}

function App() {
  const [restaurant, setRestaurant] = useState("");
  const [location, setLocation] = useState("");
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [locationResults, setLocationResults] = useState([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const query = location.trim();
    if (query.length < 2) {
      setLocationResults([]);
      setLocationError("");
      setIsLoadingLocations(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoadingLocations(true);
      setLocationError("");

      try {
        const response = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=en&format=json`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Location search failed");

        const data = await response.json();
        setLocationResults(
          (data.results ?? []).map((place) => ({
            id: `${place.id}-${place.latitude}-${place.longitude}`,
            label: [place.name, place.admin1, place.country]
              .filter(Boolean)
              .join(", "),
          })),
        );
      } catch (error) {
        if (error.name !== "AbortError") {
          setLocationResults([]);
          setLocationError(
            "Location search is unavailable. Try again shortly.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setIsLoadingLocations(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [location]);

  const submitSearch = async (event) => {
    event.preventDefault();
    setSearchError("");
    setSearchResult(null);
    setIsSearching(true);

    try {
      const query = new URLSearchParams({ restaurant, location });
      const response = await fetch(`/api/menu-search?${query}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          data?.error ||
            "The menu service is unavailable. Restart npm run dev and try again.",
        );
      }
      if (!data)
        throw new Error("The menu service returned an invalid response.");
      setSearchResult(data);
    } catch (error) {
      setSearchError(error.message || "Menu search failed.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <>
      <EyesTrail />
      <main className="poster">
        <section className="hero" aria-labelledby="page-title">
          <h1 id="page-title">
            <span>show Me</span>
            <span>the menu!</span>
          </h1>

          <div className="search-area">
            <p>I want to see the menu for…</p>

            <form onSubmit={submitSearch}>
              <div className="field-control">
                <label className="sr-only" htmlFor="restaurant">
                  Restaurant
                </label>
                <input
                  id="restaurant"
                  name="restaurant"
                  placeholder="Restaurant"
                  value={restaurant}
                  onChange={(event) => setRestaurant(event.target.value)}
                  autoComplete="off"
                />
                {restaurant && (
                  <button
                    className="clear-field"
                    type="button"
                    onClick={() => setRestaurant("")}
                    aria-label="Clear restaurant"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="location-picker">
                <label className="sr-only" htmlFor="location">
                  City, state, or country
                </label>
                <input
                  id="location"
                  name="location"
                  placeholder="City/state"
                  value={location}
                  onChange={(event) => {
                    setLocation(event.target.value);
                    setIsLocationOpen(true);
                  }}
                  onFocus={() => setIsLocationOpen(true)}
                  onBlur={() =>
                    window.setTimeout(() => setIsLocationOpen(false), 150)
                  }
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={isLocationOpen}
                  aria-controls="location-options"
                  aria-autocomplete="list"
                />
                {location && (
                  <button
                    className="clear-field"
                    type="button"
                    onClick={() => setLocation("")}
                    aria-label="Clear location"
                  >
                    ×
                  </button>
                )}
                {isLocationOpen && (
                  <ul
                    id="location-options"
                    className="location-options"
                    role="listbox"
                  >
                    {location.trim().length < 2 && (
                      <li className="no-location">
                        Type at least 2 characters
                      </li>
                    )}
                    {isLoadingLocations && (
                      <li className="no-location">Searching locations…</li>
                    )}
                    {locationError && (
                      <li className="no-location">{locationError}</li>
                    )}
                    {!isLoadingLocations &&
                      !locationError &&
                      location.trim().length >= 2 &&
                      locationResults.length === 0 && (
                        <li className="no-location">No matching locations</li>
                      )}
                    {locationResults.map((place) => (
                      <li
                        key={place.id}
                        role="option"
                        aria-selected={place.label === location}
                      >
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setLocation(place.label);
                            setIsLocationOpen(false);
                          }}
                        >
                          {place.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="submit"
                disabled={isSearching || !restaurant.trim() || !location.trim()}
              >
                {isSearching ? "Searching…" : "Go!"}
              </button>
            </form>
          </div>
        </section>

        {(searchResult || searchError) && (
          <section className="menu-result" aria-live="polite">
            {searchError && <p className="search-error">{searchError}</p>}
            {searchResult && (
              <div className="result-columns">
                <article className="menu-column">
                  <h2>{searchResult.restaurant}</h2>
                  {searchResult.menuSections ? (
                    <>
                      {searchResult.toastMenuUrl &&
                        searchResult.toastMenuUrl !== searchResult.menuUrl && (
                          <a
                            href={searchResult.toastMenuUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open Toast menu ↗
                          </a>
                        )}
                      <a
                        href={searchResult.menuUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open menu ↗
                      </a>
                      <div className="menu-sections">
                        {searchResult.menuSections.map((section) => (
                          <section className="menu-section" key={section.title}>
                            <h3>{section.title}</h3>
                            <ul>
                              {section.items.map((item, index) => (
                                <li key={`${item.name}-${index}`}>
                                  <div className="menu-item-heading">
                                    <strong>{item.name}</strong>
                                    {item.price && <span>{item.price}</span>}
                                  </div>
                                  {item.description && (
                                    <p>{item.description}</p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </section>
                        ))}
                      </div>
                      {searchResult.otherMenus?.length > 0 && (
                        <nav
                          className="other-menus"
                          aria-label="Other menu types"
                        >
                          <p>View a different menu:</p>
                          {searchResult.otherMenus.map((menu) => (
                            <a
                              key={menu.url}
                              href={menu.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {menu.label} ↗
                            </a>
                          ))}
                        </nav>
                      )}
                    </>
                  ) : (
                    <>
                      <p>{searchResult.message}</p>
                      {searchResult.squareMenuUrl && (
                        <a
                          href={searchResult.squareMenuUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open Square menu ↗
                        </a>
                      )}
                      {searchResult.toastMenuUrl && (
                        <a
                          href={searchResult.toastMenuUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open Toast menu ↗
                        </a>
                      )}
                      <a
                        className="restaurant-link"
                        href={searchResult.officialWebsite}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open restaurant website ↗
                      </a>
                    </>
                  )}
                </article>
                <article
                  className="map-photo-column"
                  aria-label="Google Maps photo one"
                />
                <article
                  className="map-photo-column"
                  aria-label="Google Maps photo two"
                />
              </div>
            )}
          </section>
        )}
      </main>
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Weather Dashboard – API integration without API key
// Uses Open-Meteo's free APIs (no registration required).
// 1) Geocoding: https://geocoding-api.open-meteo.com/v1/search
// 2) Weather:   https://api.open-meteo.com/v1/forecast

const STORAGE_KEY_RECENT = 'weatherDashboardRecentCitiesPK';

const elements = {
  form: document.getElementById('search-form'),
  cityInput: document.getElementById('city-input'),
  locationName: document.getElementById('location-name'),
  locationExtra: document.getElementById('location-extra'),
  weatherMain: document.getElementById('weather-main'),
  weatherIcon: document.getElementById('weather-icon'),
  tempValue: document.getElementById('temp-value'),
  tempFeels: document.getElementById('temp-feels'),
  humidityValue: document.getElementById('humidity-value'),
  windValue: document.getElementById('wind-value'),
  pressureValue: document.getElementById('pressure-value'),
  lastUpdated: document.getElementById('last-updated'),
  statusBanner: document.getElementById('status-banner'),
  statusText: document.getElementById('status-text'),
  recentList: document.getElementById('recent-searches-list'),
};

function setStatus(message, type = 'info') {
  if (!elements.statusBanner || !elements.statusText) return;

  elements.statusText.textContent = message;
  elements.statusBanner.classList.remove(
    'status-banner--info',
    'status-banner--error',
    'status-banner--success',
  );
  elements.statusBanner.classList.add(`status-banner--${type}`);
}

function setLoading(isLoading) {
  if (!elements.form) return;
  const button = elements.form.querySelector('.search-button');
  if (!button) return;

  if (isLoading) {
    button.disabled = true;
    button.textContent = 'Loading...';
  } else {
    button.disabled = false;
    button.textContent = 'Search';
  }
}

// ---------- Recent searches ----------

function loadRecentSearches() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECENT);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(list) {
  try {
    localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(list));
  } catch {
    // Ignore storage errors
  }
}

function renderRecentSearches() {
  if (!elements.recentList) return;
  const recent = loadRecentSearches();

  elements.recentList.innerHTML = '';

  if (!recent.length) {
    const li = document.createElement('li');
    li.textContent = 'No recent searches yet.';
    li.style.fontSize = '0.8rem';
    li.style.color = '#9ca3af';
    elements.recentList.appendChild(li);
    return;
  }

  recent.forEach((city) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recent-search-pill';
    button.textContent = city;
    button.dataset.city = city;
    li.appendChild(button);
    elements.recentList.appendChild(li);
  });
}

function addToRecentSearches(cityDisplayName) {
  const trimmed = cityDisplayName.trim();
  if (!trimmed) return;

  const recent = loadRecentSearches();
  const withoutDuplicate = recent.filter(
    (item) => item.toLowerCase() !== trimmed.toLowerCase(),
  );

  // Add to the top and limit to 6 items
  const updated = [trimmed, ...withoutDuplicate].slice(0, 6);
  saveRecentSearches(updated);
  renderRecentSearches();
}

// ---------- Fetch & render weather ----------

async function fetchWeatherByCity(rawCity) {
  const city = rawCity.trim();
  if (!city) {
    setStatus('Please enter a city name to search.', 'error');
    return;
  }

  try {
    setLoading(true);
    setStatus(`Looking up "${city}" in Pakistan...`, 'info');

    // First: geocode the city name, prioritizing Pakistan (country=PK).
    const geoUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
    geoUrl.searchParams.set('name', city);
    geoUrl.searchParams.set('count', '1');
    geoUrl.searchParams.set('language', 'en');
    geoUrl.searchParams.set('format', 'json');
    geoUrl.searchParams.set('country', 'PK');

    const geoRes = await fetch(geoUrl.toString());
    if (!geoRes.ok) {
      throw new Error('Unable to find that city right now. Please try again.');
    }

    const geoData = await geoRes.json();
    if (!geoData.results || !geoData.results.length) {
      throw new Error('City not found in Pakistan. Try another city name.');
    }

    const place = geoData.results[0];
    const { latitude, longitude, name, country, admin1 } = place;

    // Second: fetch current weather for that location.
    const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
    weatherUrl.searchParams.set('latitude', latitude);
    weatherUrl.searchParams.set('longitude', longitude);
    weatherUrl.searchParams.set('current_weather', 'true');
    weatherUrl.searchParams.set(
      'hourly',
      'relativehumidity_2m,pressure_msl',
    );
    weatherUrl.searchParams.set('timezone', 'auto');

    const weatherRes = await fetch(weatherUrl.toString());
    if (!weatherRes.ok) {
      throw new Error('Unable to fetch weather data. Please try again.');
    }

    const weatherData = await weatherRes.json();
    renderWeatherFromOpenMeteo(place, weatherData);

    const displayName = admin1 ? `${name}, ${admin1}` : name;
    addToRecentSearches(displayName);

    setStatus(
      `Showing current weather for "${name}", ${admin1 || ''} ${country}.`,
      'success',
    );
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Unable to fetch weather right now.', 'error');
  } finally {
    setLoading(false);
  }
}

function renderWeatherFromOpenMeteo(place, weatherData) {
  if (!weatherData || !weatherData.current_weather) return;

  const { name, country, admin1 } = place;
  const current = weatherData.current_weather;

  // Temperature & wind from current weather (C, km/h)
  const temp = current.temperature;
  const windSpeed = current.windspeed;

  // Humidity & pressure from the most recent hourly entry, if available.
  let humidityText = '—%';
  let pressureText = '— hPa';

  if (
    weatherData.hourly &&
    weatherData.hourly.time &&
    weatherData.hourly.relativehumidity_2m &&
    weatherData.hourly.pressure_msl
  ) {
    const lastIndex = weatherData.hourly.time.length - 1;
    const humidity = weatherData.hourly.relativehumidity_2m[lastIndex];
    const pressure = weatherData.hourly.pressure_msl[lastIndex];
    humidityText = `${humidity}%`;
    pressureText = `${Math.round(pressure)} hPa`;
  }

  // Basic weather code to description mapping.
  const code = current.weathercode;
  const description = mapWeatherCodeToText(code);

  if (elements.locationName) {
    const region = admin1 ? `${admin1}, ` : '';
    elements.locationName.textContent = `${name}, ${region}${country}`;
  }

  if (elements.locationExtra) {
    elements.locationExtra.textContent = description;
  }

  if (elements.weatherMain) {
    elements.weatherMain.textContent = description.split(' ')[0] || description;
  }

  if (elements.tempValue) {
    elements.tempValue.textContent = Math.round(temp).toString();
  }

  if (elements.tempFeels) {
    elements.tempFeels.textContent = `Approx. current temperature in °C`;
  }

  if (elements.humidityValue) {
    elements.humidityValue.textContent = humidityText;
  }

  if (elements.windValue) {
    elements.windValue.textContent = `${Math.round(windSpeed)} km/h`;
  }

  if (elements.pressureValue) {
    elements.pressureValue.textContent = pressureText;
  }

  if (elements.lastUpdated) {
    const now = new Date();
    elements.lastUpdated.textContent = `Last updated: ${now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }

  if (elements.weatherIcon) {
    elements.weatherIcon.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = pickEmojiForWeatherCode(code);
    span.style.fontSize = '2.2rem';
    elements.weatherIcon.appendChild(span);
  }
}

function mapWeatherCodeToText(code) {
  // Open-Meteo weather codes: https://open-meteo.com/en/docs
  if (code === 0) return 'Clear sky';
  if (code === 1 || code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Foggy';
  if ([51, 53, 55].includes(code)) return 'Drizzle';
  if ([61, 63, 65].includes(code)) return 'Rain';
  if ([66, 67].includes(code)) return 'Freezing rain';
  if ([71, 73, 75, 77].includes(code)) return 'Snow';
  if ([80, 81, 82].includes(code)) return 'Rain showers';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';
  return 'Unknown conditions';
}

function pickEmojiForWeatherCode(code) {
  if (code === 0) return '☀️';
  if (code === 1 || code === 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if ([51, 53, 55].includes(code)) return '🌦️';
  if ([61, 63, 65, 80, 81, 82].includes(code)) return '🌧️';
  if ([71, 73, 75, 77].includes(code)) return '❄️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  return '🌡️';
}

function handleSearchSubmit(event) {
  event.preventDefault();
  const rawValue = elements.cityInput?.value ?? '';
  const city = rawValue.trim();

  if (!city) {
    setStatus('Please enter a city name to search.', 'error');
    elements.cityInput?.focus();
    return;
  }

  fetchWeatherByCity(city);
}

// ---------- Wire up events & initial state ----------

if (elements.form) {
  elements.form.addEventListener('submit', handleSearchSubmit);
}

if (elements.recentList) {
  elements.recentList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const pill = target.closest('.recent-search-pill');
    if (!pill) return;

    const city = pill.dataset.city || pill.textContent || '';
    const trimmed = city.trim();
    if (!trimmed) return;

    if (elements.cityInput) {
      elements.cityInput.value = trimmed;
    }
    fetchWeatherByCity(trimmed);
  });
}

renderRecentSearches();


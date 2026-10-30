// Storage boundary: replace this local adapter with REST calls without changing the UI.
const KEY = 'travel-cards-data-v1';
export const schemaVersion = 1;

export function loadData(fallbackPlaces) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.schemaVersion === schemaVersion && Array.isArray(saved.places)) return saved;
    // One-time migration from the prototype's first storage key.
    const oldPlaces = JSON.parse(localStorage.getItem('travel-cards-places'));
    if (Array.isArray(oldPlaces)) return { schemaVersion, places: oldPlaces, photos: [] };
  } catch { /* Start from the provided demo data if local data is unreadable. */ }
  return { schemaVersion, places: fallbackPlaces, photos: [] };
}

export function saveData(data) {
  localStorage.setItem(KEY, JSON.stringify({ ...data, schemaVersion }));
}

export function validateImport(value) {
  if (!value || value.schemaVersion !== schemaVersion || !Array.isArray(value.places)) {
    throw new Error(`Expected a Travel Cards backup with schemaVersion ${schemaVersion} and a places array.`);
  }
  if (!value.places.every((place) => place && typeof place.name === 'string' && ['visited', 'planned'].includes(place.kind))) {
    throw new Error('Backup contains a place without a name or a valid type.');
  }
  return { schemaVersion, places: value.places, photos: Array.isArray(value.photos) ? value.photos : [] };
}

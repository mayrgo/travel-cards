// Browser adapter for the versioned travel model. Swap this module for an API adapter later.
export const schemaVersion = 3;
const KEY = 'travel-cards-data-v3';
const OLD_KEYS = ['travel-cards-data-v2', 'travel-cards-data-v1', 'travel-cards-places'];
let databasePromise;

function emptyData() { return { schemaVersion, regions: [], targets: [], visits: [], plans: [], groups: [] }; }
function newId() { return crypto.randomUUID(); }
const demoNotes = new Map([['Seoul, South Korea', 'home base'], ['Tokyo, Japan', 'neon nights & tiny bars'], ['Paris, France', 'a long weekend in spring'], ['Kyoto, Japan', 'temples before sunrise'], ['Reykjavík, Iceland', 'chasing the aurora'], ['Marrakech, Morocco', 'the medina & mint tea'], ['Patagonia, Argentina', 'somewhere wild']]);
function removeBuiltInDemo(data) {
  const demoIds = new Set(data.targets.filter((target) => {
    const region = data.regions.find((item) => item.id === target.regionId);
    const note = demoNotes.get(region?.name);
    return note && (target.note === note || data.visits.some((visit) => visit.targetId === target.id && visit.note === note) || data.plans.some((plan) => plan.targetId === target.id && plan.note === note));
  }).map((target) => target.id));
  data.targets = data.targets.filter((target) => !demoIds.has(target.id));
  data.visits = data.visits.filter((visit) => !demoIds.has(visit.targetId));
  data.plans = data.plans.filter((plan) => !demoIds.has(plan.targetId));
  data.regions = data.regions.filter((region) => data.targets.some((target) => target.regionId === region.id));
  data.groups = data.groups.filter((group) => data.targets.some((target) => target.groupId === group.id));
  return data;
}

function fromLegacy(places = []) {
  const data = emptyData();
  for (const place of places) {
    if (!place || typeof place.name !== 'string') continue;
    const regionId = place.regionId || newId();
    const targetId = place.id || newId();
    data.regions.push({
      id: regionId,
      name: place.name,
      scope: place.scope || (place.geojson ? 'area' : 'point'),
      center: Number.isFinite(place.lat) && Number.isFinite(place.lon) ? { lat: place.lat, lon: place.lon } : null,
      geometry: place.geojson || null,
      source: place.source || { provider: 'legacy-import', retrievedAt: null },
      countryCode: place.countryCode || null,
      parentRegionId: null,
    });
    data.targets.push({ id: targetId, regionId, status: place.kind === 'planned' ? 'planned' : 'visited', completionRule: place.scope === 'country' ? 'one-entry' : 'visit-unit', groupId: null, note: place.note || '', createdAt: null });
    if (place.kind !== 'planned') data.visits.push({ id: newId(), targetId, visitedAt: null, note: place.note || '', photoRefs: [] });
    else data.plans.push({ id: newId(), targetId, plannedFor: null, note: place.note || '', createdAt: null });
  }
  return removeBuiltInDemo(data);
}

function openDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB unavailable'));
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('travel-cards', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('atlas');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}

function readFromDatabase() {
  return openDatabase().then((db) => new Promise((resolve, reject) => {
    const request = db.transaction('atlas', 'readonly').objectStore('atlas').get('current');
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  }));
}

export async function loadData(fallbackPlaces) {
  try {
    const saved = await readFromDatabase();
    if (validShape(saved)) return await saveAndReturn(removeBuiltInDemo(saved));
    if (saved?.schemaVersion === 2 && Array.isArray(saved.regions) && Array.isArray(saved.targets)) return await saveAndReturn(fromVersion2(saved));
  } catch { /* Import data from the older browser store if IndexedDB is unavailable. */ }
  try {
    const current = JSON.parse(localStorage.getItem(KEY));
    if (validShape(current)) return await saveAndReturn(removeBuiltInDemo(current));
    if (current?.schemaVersion === 2 && Array.isArray(current.regions) && Array.isArray(current.targets)) return await saveAndReturn(fromVersion2(current));
    for (const oldKey of OLD_KEYS) {
      const value = JSON.parse(localStorage.getItem(oldKey));
      if (Array.isArray(value)) return await saveAndReturn(fromLegacy(value));
      if (value?.schemaVersion === 1 && Array.isArray(value.places)) return await saveAndReturn(fromLegacy(value.places));
      if (value?.schemaVersion === 2 && Array.isArray(value.regions) && Array.isArray(value.targets)) return await saveAndReturn(fromVersion2(value));
    }
  } catch { /* Start with demo data if local data is unreadable. */ }
  return await saveAndReturn(fromLegacy(fallbackPlaces));
}

async function saveAndReturn(value) { await saveData(value); return value; }

function validShape(value) {
  return value?.schemaVersion === schemaVersion && Array.isArray(value.regions) && Array.isArray(value.targets) && Array.isArray(value.visits) && Array.isArray(value.plans) && Array.isArray(value.groups);
}

function fromVersion2(value) {
  const migrated = { ...value, schemaVersion, visits: Array.isArray(value.visits) ? value.visits : [], plans: Array.isArray(value.plans) ? value.plans : [], groups: Array.isArray(value.groups) ? value.groups : [] };
  for (const target of migrated.targets) {
    if (target.status === 'planned' && !migrated.plans.some((plan) => plan.targetId === target.id)) migrated.plans.push({ id: newId(), targetId: target.id, plannedFor: null, note: target.note || '', createdAt: null });
    if (target.status === 'visited' && !migrated.visits.some((visit) => visit.targetId === target.id)) migrated.visits.push({ id: newId(), targetId: target.id, visitedAt: null, note: target.note || '', photoRefs: [] });
  }
  return removeBuiltInDemo(migrated);
}

export async function saveData(data) {
  const value = { ...data, schemaVersion };
  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const request = db.transaction('atlas', 'readwrite').objectStore('atlas').put(value, 'current');
      request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
    });
  } catch { localStorage.setItem(KEY, JSON.stringify(value)); }
}

export function validateImport(value) {
  if (value?.schemaVersion === 1 && Array.isArray(value.places)) return fromLegacy(value.places);
  if (value?.schemaVersion === 2 && Array.isArray(value.regions) && Array.isArray(value.targets)) return fromVersion2(value);
  if (!validShape(value)) throw new Error(`Expected a Travel Cards backup with schemaVersion ${schemaVersion} and regions, targets, visits, and groups arrays.`);
  if (!value.regions.every((region) => region && typeof region.id === 'string' && typeof region.name === 'string' && ['country', 'city', 'area', 'point'].includes(region.scope))) throw new Error('Backup contains an invalid geographic region.');
  if (!value.targets.every((target) => target && typeof target.id === 'string' && value.regions.some((region) => region.id === target.regionId) && ['visited', 'planned'].includes(target.status))) throw new Error('Backup contains a target with an invalid region or status.');
  if (!value.visits.every((visit) => value.targets.some((target) => target.id === visit.targetId)) || !value.plans.every((plan) => value.targets.some((target) => target.id === plan.targetId))) throw new Error('Backup contains a visit or trip plan without a matching target.');
  return removeBuiltInDemo(value);
}

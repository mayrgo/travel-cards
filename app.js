import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { loadData, saveData, validateImport } from './data-store.js';

let data = await loadData([]);
function derivePlaces() {
  return data.targets.flatMap((target) => {
    const region = data.regions.find((item) => item.id === target.regionId);
    if (!region) return [];
    const visits = data.visits.filter((visit) => visit.targetId === target.id);
    const plans = data.plans.filter((plan) => plan.targetId === target.id);
    const common = { id: target.id, regionId: region.id, name: region.name, scope: region.scope, icon: region.name.slice(0, 1).toUpperCase(), lat: region.center?.lat, lon: region.center?.lon, geojson: region.geometry, target, region, visits };
    const entries = [];
    if (visits.length || target.status === 'visited') {
      const latestVisit = visits.at(-1);
      entries.push({ ...common, kind: 'visited', note: latestVisit?.note || target.note || '', date: latestVisit?.visitedAt || null });
    }
    for (const plan of plans) entries.push({ ...common, id: plan.id, kind: 'planned', note: plan.note || '', date: plan.plannedFor || null, plan });
    if (!entries.length) entries.push({ ...common, kind: target.status, note: target.note || '', date: null });
    return entries;
  });
}
let places = derivePlaces();
let activeFilter = 'visited';
const $ = (q) => document.querySelector(q);
const list = $('#place-list');
let markerRefresh = () => {};
let selectedLocation = null;
let geocodeResults = [];

function renderPlaces() {
  places = derivePlaces();
  const visible = places.filter((p) => p.kind === activeFilter);
  list.innerHTML = visible.length ? visible.map((p) => `<article class="place-row"><div class="place-thumb">${escapeHTML(p.icon || p.name[0])}</div><div class="place-meta"><b>${escapeHTML(p.name)}</b><small>${escapeHTML(p.note || (p.kind === 'visited' ? 'a story in the making' : 'one for the list'))}</small></div><span class="place-type ${p.kind === 'planned' ? 'planned-type' : ''}">${escapeHTML(p.scope.toUpperCase())}</span></article>`).join('') : '<p class="intro" style="padding:15px 0">No places here yet. Add your first pin.</p>';
  const visited = places.filter((p) => p.kind === 'visited').length;
  const planned = places.filter((p) => p.kind === 'planned').length;
  $('#been-total').textContent = String(visited).padStart(2, '0');
  $('#plan-total').textContent = String(planned).padStart(2, '0');
  $('#place-count').textContent = String(visited).padStart(2, '0');
  const countries = new Set(places.filter((p) => p.kind === 'visited').map((p) => p.region.countryCode || p.name.split(',').at(-1).trim())).size;
  $('#country-count').textContent = String(countries).padStart(2, '0');
  const completedTargets = data.targets.filter((target) => data.visits.some((visit) => visit.targetId === target.id)).length;
  const coverage = data.targets.length ? Math.round(completedTargets / data.targets.length * 100) : 0;
  $('#coverage-count').textContent = `${coverage}%`;
  $('#coverage-label').textContent = `${completedTargets} / ${data.targets.length} COMPLETE`;
  $('#coverage-bar').style.width = `${coverage}%`;
  $('#trip-list').innerHTML = places.filter((p) => p.kind === 'planned').slice(0, 4).map((p) => `<article class="trip-row"><div class="trip-thumb">${escapeHTML(p.icon || p.name[0])}</div><div class="trip-meta"><b>${escapeHTML(p.name.split(',')[0])}</b><small>${escapeHTML(p.note || 'A place for later')}</small></div><i class="trip-dot"></i></article>`).join('');
  const groupCards = data.groups.map((group) => {
    const members = data.targets.filter((target) => target.groupId === group.id);
    if (!members.length) return '';
    const done = members.filter((target) => data.visits.some((visit) => visit.targetId === target.id)).length;
    return `<div class="goal-group"><div><b>${escapeHTML(group.name)}</b><span>${done}/${members.length}</span></div><i><span style="width:${Math.round(done / members.length * 100)}%"></span></i></div>`;
  }).join('');
  $('#goal-groups').innerHTML = groupCards;
  saveData(data).catch((error) => { $('#place-status').textContent = `Could not save locally: ${error.message}`; });
  markerRefresh();
}
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  activeFilter = tab.dataset.filter;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
  renderPlaces();
}));
const dialog = $('#place-dialog');
function syncScopeField() { $('#city-group-row').hidden = $('#place-form').elements.scope.value !== 'city'; }
function syncStatusFields() { const planned = $('#place-form').elements.kind.value === 'planned'; $('#visit-date-row').hidden = planned; $('#plan-date-row').hidden = !planned; }
function openForm(kind = activeFilter) { $('#place-form').reset(); $('#place-status').textContent = ''; $('#geocode-results').replaceChildren(); selectedLocation = null; geocodeResults = []; $('#place-form').elements.kind.value = kind; syncScopeField(); syncStatusFields(); dialog.showModal(); }
['#add-place', '#add-place-bottom', '#map-add', '#add-trip', '#plan-card'].forEach((id) => $(id).addEventListener('click', () => openForm(id === '#add-trip' || id === '#plan-card' ? 'planned' : activeFilter)));
let lastGeocodeAt = 0;
const geocodeCacheKey = 'travel-cards-geocode-cache-v2';
async function searchPlaces(query) {
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(geocodeCacheKey)) || {}; } catch { /* ignore old or malformed cache */ }
  const key = query.trim().toLowerCase();
  if (cache[key]) return cache[key];
  const wait = Math.max(0, 1100 - (Date.now() - lastGeocodeAt));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastGeocodeAt = Date.now();
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ format: 'jsonv2', limit: '5', addressdetails: '1', polygon_geojson: '1', polygon_threshold: '0.01', q: query.trim(), 'accept-language': 'en' });
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Place search is temporarily unavailable. Try again or enter coordinates.');
  const results = await response.json();
  if (!results.length) throw new Error('Place not found. Try adding the country, or enter coordinates.');
  const matches = results.map((item) => ({ lat: Number(item.lat), lon: Number(item.lon), label: item.display_name, type: item.type, addresstype: item.addresstype, className: item.class, osmType: item.osm_type, osmId: item.osm_id, countryCode: item.address?.country_code?.toUpperCase() || null, geojson: item.geojson || null }));
  cache[key] = matches;
  try { localStorage.setItem(geocodeCacheKey, JSON.stringify(cache)); } catch { /* geocoding still succeeds without cache */ }
  return matches;
}
async function runPlaceSearch() {
  const query = $('#place-form').elements.name.value.trim();
  if (!query) { $('#place-form').elements.name.reportValidity(); return; }
  const status = $('#place-status'), resultsHost = $('#geocode-results'), findButton = $('#find-place');
  findButton.disabled = true; status.textContent = 'Searching city and place names…'; resultsHost.replaceChildren(); selectedLocation = null;
  try {
    geocodeResults = await searchPlaces(query);
    if (geocodeResults.length === 1) {
      selectedLocation = geocodeResults[0];
      $('#place-form').elements.scope.value = suggestedScope(selectedLocation);
      syncScopeField();
    }
    resultsHost.innerHTML = geocodeResults.map((result, index) => `<button type="button" class="geocode-result ${index === 0 && geocodeResults.length === 1 ? 'selected' : ''}" data-result="${index}"><span>${escapeHTML(result.label)}</span><small>${escapeHTML(result.addresstype || result.type || 'place')} · ${result.geojson ? 'boundary available' : 'point only'} · ${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}</small></button>`).join('');
    status.textContent = geocodeResults.length === 1 ? selectionMessage(selectedLocation) : 'Choose the right place from these matches.';
  } catch (error) { status.textContent = error.message; }
  finally { findButton.disabled = false; }
}
$('#find-place').addEventListener('click', runPlaceSearch);
$('#geocode-results').addEventListener('click', (event) => {
  const button = event.target.closest('[data-result]'); if (!button) return;
  selectedLocation = geocodeResults[Number(button.dataset.result)];
  $('#place-form').elements.scope.value = suggestedScope(selectedLocation);
  syncScopeField();
  $('#geocode-results').querySelectorAll('.geocode-result').forEach((item) => item.classList.toggle('selected', item === button));
  $('#place-status').textContent = selectionMessage(selectedLocation);
});
function suggestedScope(location) {
  const type = `${location.addresstype || ''} ${location.type || ''} ${location.className || ''}`.toLowerCase();
  if (type.includes('country')) return 'country';
  if (/\b(city|town|village|municipality|borough)\b/.test(type)) return 'city';
  if (/\b(park|forest|island|reserve|national_park|natural)\b/.test(type) && location.geojson) return 'area';
  return 'point';
}
function selectionMessage(location) {
  const scope = $('#place-form').elements.scope.value;
  if (scope === 'point') return 'This will be saved as a point on the globe.';
  return location?.geojson ? 'Boundary found. Save to color the whole geographic area.' : 'This result has no boundary. Try a city or municipality result to fill an area.';
}
function reconcileCountryCoverage() {
  for (const countryTarget of data.targets) {
    const country = data.regions.find((region) => region.id === countryTarget.regionId);
    if (country?.scope !== 'country' || countryTarget.completionRule !== 'one-entry' || data.visits.some((visit) => visit.targetId === countryTarget.id) || !country.countryCode) continue;
    const evidence = data.targets.map((target) => ({ target, region: data.regions.find((region) => region.id === target.regionId), visit: data.visits.filter((visit) => visit.targetId === target.id).at(-1) }))
      .find((item) => item.visit && item.region?.id !== country.id && item.region?.countryCode === country.countryCode);
    if (!evidence) continue;
    countryTarget.status = 'visited';
    data.visits.push({ id: crypto.randomUUID(), targetId: countryTarget.id, visitedAt: evidence.visit.visitedAt, note: `Counted from a visit to ${evidence.region.name}`, photoRefs: [], evidenceTargetId: evidence.target.id });
  }
}
$('#place-form').elements.name.addEventListener('input', () => { selectedLocation = null; geocodeResults = []; $('#geocode-results').replaceChildren(); $('#place-status').textContent = ''; });
$('#place-form').elements.scope.addEventListener('change', () => { syncScopeField(); if (selectedLocation) $('#place-status').textContent = selectionMessage(selectedLocation); });
$('#place-form').elements.kind.addEventListener('change', syncStatusFields);
$('#place-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const formData = new FormData(form);
  const name = String(formData.get('name')).trim();
  const scope = String(formData.get('scope'));
  const statusElement = $('#place-status');
  const saveButton = form.querySelector('.save-button');
  saveButton.disabled = true;
  let location;
  try {
    const latText = String(formData.get('lat')).trim(), lonText = String(formData.get('lon')).trim();
    if ((latText === '') !== (lonText === '')) throw new Error('Enter both latitude and longitude, or leave both empty for place search.');
    if (latText !== '' && lonText !== '') location = { lat: Number(latText), lon: Number(lonText), source: { provider: 'manual-coordinate' } };
    else {
      if (!selectedLocation) {
        saveButton.disabled = false;
        if (!geocodeResults.length) await runPlaceSearch();
        else statusElement.textContent = 'Choose one of the search results before saving.';
        return;
      }
      location = selectedLocation;
    }
  } catch (error) {
    statusElement.textContent = error.message;
    saveButton.disabled = false;
    return;
  }
  const sourceId = location.osmType && location.osmId ? `${location.osmType}/${location.osmId}` : null;
  let region = sourceId ? data.regions.find((candidate) => candidate.source?.externalId === sourceId && candidate.scope === scope) : null;
  const geometry = scope === 'point' ? null : location.geojson || region?.geometry || null;
  if (scope !== 'point' && !geometry) {
    statusElement.textContent = 'No boundary came with this result, so it cannot be filled as a region. Choose a boundary result or save it as an exact place.';
    saveButton.disabled = false;
    return;
  }
  if (!region) {
    region = {
      id: crypto.randomUUID(), name, canonicalName: location.label || name, scope,
      center: { lat: location.lat, lon: location.lon },
      geometry,
      countryCode: location.countryCode || null, parentRegionId: null,
      source: { provider: location.osmId ? 'OpenStreetMap' : 'manual-coordinate', externalId: sourceId, retrievedAt: location.osmId ? new Date().toISOString() : null, license: location.osmId ? 'ODbL-1.0' : null, attribution: location.osmId ? '© OpenStreetMap contributors' : null },
    };
    data.regions.push(region);
    if (scope === 'country' && region.countryCode) {
      for (const child of data.regions) if (child.id !== region.id && child.countryCode === region.countryCode) child.parentRegionId = region.id;
    } else if (region.countryCode) {
      region.parentRegionId = data.regions.find((candidate) => candidate.id !== region.id && candidate.scope === 'country' && candidate.countryCode === region.countryCode)?.id || null;
    }
  } else {
    region.center = { lat: location.lat, lon: location.lon };
    region.geometry ||= geometry;
  }
  let target = data.targets.find((candidate) => candidate.regionId === region.id);
  const statusValue = String(formData.get('kind'));
  const note = String(formData.get('note')).trim();
  const requestedGroupName = scope === 'city' ? String(formData.get('groupName')).trim() : '';
  let groupId = null;
  if (requestedGroupName) {
    let group = data.groups.find((candidate) => candidate.name.toLowerCase() === requestedGroupName.toLowerCase() && candidate.scope === 'city');
    if (!group) { group = { id: crypto.randomUUID(), name: requestedGroupName, scope: 'city', completionRule: 'all-targets', createdAt: new Date().toISOString() }; data.groups.push(group); }
    groupId = group.id;
  }
  if (!target) {
    target = { id: crypto.randomUUID(), regionId: region.id, status: statusValue, completionRule: scope === 'country' ? 'one-entry' : 'visit-unit', groupId, note: statusValue === 'planned' ? note : '', createdAt: new Date().toISOString() };
    data.targets.push(target);
  } else {
    if (groupId) target.groupId = groupId;
    if (statusValue === 'planned' && !data.visits.some((visit) => visit.targetId === target.id)) target.status = 'planned';
  }
  if (statusValue === 'visited') {
    target.status = 'visited';
    data.visits.push({ id: crypto.randomUUID(), targetId: target.id, visitedAt: String(formData.get('visitDate')) || null, note, photoRefs: [] });
  } else {
    target.note = note;
    data.plans.push({ id: crypto.randomUUID(), targetId: target.id, plannedFor: String(formData.get('planDate')) || null, note, createdAt: new Date().toISOString() });
  }
  reconcileCountryCoverage();
  const place = { id: target.id, regionId: region.id, name: region.name, note, kind: statusValue, scope, lat: location.lat, lon: location.lon, geojson: region.geometry };
  activeFilter = statusValue;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.filter === activeFilter));
  renderPlaces(); saveButton.disabled = false; dialog.close(); focusPlace(place);
});
$('#add-photo').addEventListener('click', () => $('#photo-input').click());
$('#photo-add').addEventListener('click', () => $('#photo-input').click());
$('#photo-input').addEventListener('change', (event) => {
  const file = event.target.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = document.createElement('img'); img.className = 'uploaded-photo'; img.src = reader.result;
    const grid = $('#photo-grid'); $('#photos-empty').hidden = true; grid.insertBefore(img, grid.firstChild);
  };
  reader.readAsDataURL(file);
});
$('#export-data').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'travel-cards-backup.json'; link.click(); URL.revokeObjectURL(link.href);
});
$('#import-data').addEventListener('click', () => $('#data-input').click());
$('#data-input').addEventListener('change', async (event) => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    data = validateImport(JSON.parse(await file.text())); places = derivePlaces();
    activeFilter = 'visited'; document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.filter === activeFilter));
    renderPlaces(); alert('Travel Cards data imported.');
  } catch (error) { alert(`Could not import this file: ${error.message}`); }
  event.target.value = '';
});

// Live sun position: NOAA's compact solar declination/equation-of-time approximation.
function solarPosition(date) {
  const day = (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000;
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const gamma = 2 * Math.PI / 365 * (day - 1 + (hour - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const equation = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const rawLon = (720 - (hour * 60 + equation)) / 4;
  const subLon = ((rawLon + 180) % 360 + 360) % 360 - 180;
  return { decl, subLon };
}

const host = $('#globe');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(host.clientWidth, host.clientHeight); renderer.outputColorSpace = THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, host.clientWidth / host.clientHeight, 0.1, 100);
camera.position.z = 5.8;
const globe = new THREE.Group(); scene.add(globe);
const sphereGeometry = new THREE.SphereGeometry(1.42, 96, 64);
const loader = new THREE.TextureLoader(); loader.setCrossOrigin('anonymous');
const dayMap = loader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg');
const lightsMap = loader.load('https://threejs.org/examples/textures/planets/earth_lights_2048.png');
dayMap.colorSpace = THREE.SRGBColorSpace; lightsMap.colorSpace = THREE.SRGBColorSpace;
const uniforms = { dayMap: { value: dayMap }, lightsMap: { value: lightsMap }, sunDir: { value: new THREE.Vector3(1, 0, 0) } };
const earthMaterial = new THREE.ShaderMaterial({ uniforms, vertexShader: `varying vec2 vUv; varying vec3 vNormal; varying vec3 vPosition; void main(){vUv=uv; vNormal=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vPosition=mv.xyz; gl_Position=projectionMatrix*mv;}`, fragmentShader: `uniform sampler2D dayMap; uniform sampler2D lightsMap; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vNormal; varying vec3 vPosition; void main(){ vec2 uv=vUv; vec3 tex=texture2D(dayMap,uv).rgb; float lum=dot(tex,vec3(0.299,0.587,0.114)); vec3 mono=vec3(pow(lum,0.8)*0.82+0.08); float sun=dot(normalize(vNormal),normalize(sunDir)); float day=smoothstep(-0.055,0.045,sun); vec3 lights=texture2D(lightsMap,uv).rgb; vec3 city=vec3(0.92,0.72,0.39)*pow(max(lights.r,lights.g),1.4)*1.65; vec3 surface=mix(vec3(0.012,0.018,0.019)+city,mono,day); float rim=pow(1.0-max(dot(normalize(vNormal),normalize(-vPosition)),0.0),3.0); surface+=vec3(0.13,0.18,0.16)*rim; gl_FragColor=vec4(surface,1.0);}` });
const earth = new THREE.Mesh(sphereGeometry, earthMaterial); globe.add(earth);
const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.445, 64, 48), new THREE.ShaderMaterial({ transparent: true, side: THREE.BackSide, vertexShader: 'varying vec3 n; void main(){n=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: 'varying vec3 n; void main(){float a=pow(0.72-max(dot(normalize(n),vec3(0.0,0.0,1.0)),0.0),2.2); gl_FragColor=vec4(0.27,0.35,0.32,a*0.22);}' })); globe.add(atmosphere);
const sunMarker = new THREE.Group();
sunMarker.add(new THREE.Mesh(new THREE.SphereGeometry(0.019, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffdc91 })));
sunMarker.add(new THREE.Mesh(new THREE.SphereGeometry(0.038, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffdc91, transparent: true, opacity: 0.25, depthWrite: false })));
globe.add(sunMarker);
globe.rotation.y = -0.48; globe.rotation.x = -0.12;
let dragging = false, lastX = 0, lastY = 0, targetX = globe.rotation.x, targetY = globe.rotation.y;
let fitDistance = 5.8;
let zoom = fitDistance;
const pinGeometry = new THREE.SphereGeometry(0.026, 12, 10);
function coordinatesToPosition(lat, lon, radius = 1.47) {
  const latitude = THREE.MathUtils.degToRad(lat), longitude = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(radius * Math.cos(latitude) * Math.cos(longitude), radius * Math.sin(latitude), -radius * Math.cos(latitude) * Math.sin(longitude));
}
function polygonToSphere(geojson, radius = 1.426) {
  if (!geojson || !['Polygon', 'MultiPolygon'].includes(geojson.type)) return [];
  const polygons = geojson.type === 'Polygon' ? [geojson.coordinates] : geojson.coordinates;
  const meshes = [];
  const unwrapRing = (ring, reference = null) => {
    let previous = reference;
    return ring.map(([longitude, latitude]) => {
      let lon = longitude;
      if (previous !== null) lon += Math.round((previous - lon) / 360) * 360;
      previous = lon;
      return [lon, latitude];
    });
  };
  for (const polygon of polygons) {
    if (!polygon?.[0]?.length) continue;
    const outer = unwrapRing(polygon[0]);
    const shape = new THREE.Shape();
    shape.moveTo(outer[0][0], outer[0][1]);
    for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i][0], outer[i][1]);
    shape.closePath();
    for (const holeRing of polygon.slice(1)) {
      const holePoints = unwrapRing(holeRing, outer[0][0]);
      const hole = new THREE.Path(); hole.moveTo(holePoints[0][0], holePoints[0][1]);
      for (let i = 1; i < holePoints.length; i++) hole.lineTo(holePoints[i][0], holePoints[i][1]);
      hole.closePath(); shape.holes.push(hole);
    }
    const flatGeometry = new THREE.ShapeGeometry(shape, 1);
    const positions = flatGeometry.attributes.position;
    const index = flatGeometry.index;
    const triangles = [];
    const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const subdivide = (a, b, c, depth = 0) => {
      const edge = Math.max(Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(b[0] - c[0], b[1] - c[1]), Math.hypot(c[0] - a[0], c[1] - a[1]));
      if (edge <= 6 || depth >= 5) { triangles.push(a, b, c); return; }
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      subdivide(a, ab, ca, depth + 1); subdivide(ab, b, bc, depth + 1); subdivide(ca, bc, c, depth + 1); subdivide(ab, bc, ca, depth + 1);
    };
    const triangleCount = index ? index.count : positions.count;
    const vertexAt = (i) => [positions.getX(index ? index.getX(i) : i), positions.getY(index ? index.getX(i) : i)];
    for (let i = 0; i < triangleCount; i += 3) subdivide(vertexAt(i), vertexAt(i + 1), vertexAt(i + 2));
    const sphericalPositions = new Float32Array(triangles.length * 3);
    triangles.forEach(([lon, lat], i) => sphericalPositions.set(coordinatesToPosition(lat, lon, radius).toArray(), i * 3));
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(sphericalPositions, 3)); geometry.computeVertexNormals();
    flatGeometry.dispose(); meshes.push(geometry);
  }
  return meshes;
}
function areaMaterial(hexColor) {
  return new THREE.ShaderMaterial({
    uniforms: { areaColor: { value: new THREE.Color(hexColor) }, sunDir: uniforms.sunDir, opacity: { value: 0.74 } },
    vertexShader: 'varying vec3 vNormal; void main(){vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 areaColor; uniform vec3 sunDir; uniform float opacity; varying vec3 vNormal; void main(){float day=smoothstep(-0.055,0.045,dot(normalize(vNormal),normalize(sunDir)));float light=mix(0.22,0.92,day);gl_FragColor=vec4(areaColor*light,opacity);}',
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
  });
}
function refreshMarkers() {
  for (const child of [...globe.children]) if (child.userData.travelMarker || child.userData.travelBoundary) globe.remove(child);
  const mapPlaces = new Map();
  for (const place of places) {
    const previous = mapPlaces.get(place.regionId);
    if (!previous || place.kind === 'visited') mapPlaces.set(place.regionId, place);
  }
  for (const place of mapPlaces.values()) {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lon)) continue;
    const color = place.kind === 'visited' ? 0xc2eb79 : 0xe4b86d;
    const boundary = new THREE.Group(); boundary.userData.travelBoundary = true;
    const surfaceRadius = place.scope === 'country' ? 1.423 : place.scope === 'area' ? 1.429 : 1.426;
    for (const geometry of place.scope === 'point' ? [] : polygonToSphere(place.geojson, surfaceRadius)) {
      boundary.add(new THREE.Mesh(geometry, areaMaterial(color)));
    }
    globe.add(boundary);
    const marker = new THREE.Group(); marker.userData.travelMarker = true;
    const dot = new THREE.Mesh(pinGeometry, new THREE.MeshBasicMaterial({ color }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }));
    marker.add(halo, dot); marker.position.copy(coordinatesToPosition(place.lat, place.lon)); marker.userData.place = place;
    globe.add(marker);
  }
}
markerRefresh = refreshMarkers;
function focusPlace(place) {
  if (!Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return;
  targetY = -Math.PI / 2 - THREE.MathUtils.degToRad(place.lon);
  targetX = THREE.MathUtils.degToRad(place.lat);
  zoom = Math.min(zoom, fitDistance * 0.92);
}
refreshMarkers();
renderer.domElement.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointermove', (e) => { if (!dragging) return; targetY += (e.clientX - lastX) * 0.005; targetX = Math.max(-1.1, Math.min(1.1, targetX + (e.clientY - lastY) * 0.005)); lastX = e.clientX; lastY = e.clientY; });
renderer.domElement.addEventListener('pointerup', () => dragging = false);
renderer.domElement.addEventListener('wheel', (e) => { e.preventDefault(); zoom = THREE.MathUtils.clamp(zoom + e.deltaY * 0.003, fitDistance * 0.58, fitDistance * 1.65); }, { passive: false });
$('#zoom-in').addEventListener('click', () => zoom = Math.max(fitDistance * 0.58, zoom - fitDistance * 0.1));
$('#zoom-out').addEventListener('click', () => zoom = Math.min(fitDistance * 1.65, zoom + fitDistance * 0.1));
function updateTime() {
  const now = new Date(); $('#utc-time').textContent = `UTC ${new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)}`;
  const { decl, subLon } = solarPosition(now);
  sunMarker.position.copy(coordinatesToPosition(THREE.MathUtils.radToDeg(decl), subLon, 1.458));
  const sunLocal = coordinatesToPosition(THREE.MathUtils.radToDeg(decl), subLon, 1).normalize();
  globe.updateMatrixWorld(); camera.updateMatrixWorld();
  const sunWorld = sunLocal.applyQuaternion(globe.getWorldQuaternion(new THREE.Quaternion()));
  const worldToViewRotation = new THREE.Matrix3().setFromMatrix4(camera.matrixWorldInverse);
  uniforms.sunDir.value.copy(sunWorld.applyMatrix3(worldToViewRotation).normalize());
  const subLat = THREE.MathUtils.radToDeg(decl);
  $('#sun-position').textContent = `${Math.abs(subLat).toFixed(1)}°${subLat >= 0 ? 'N' : 'S'} · ${Math.abs(subLon).toFixed(1)}°${subLon >= 0 ? 'E' : 'W'}`;
}
function animate() { requestAnimationFrame(animate); globe.rotation.y += (targetY - globe.rotation.y) * 0.035; globe.rotation.x += (targetX - globe.rotation.x) * 0.035; camera.position.z += (zoom - camera.position.z) * 0.08; renderer.render(scene, camera); }
function resize() {
  const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  fitDistance = 1.47 * 1.32 / Math.tan(Math.min(verticalFov, horizontalFov) / 2);
  if (camera.position.z === 5.8 && zoom === 5.8) { zoom = fitDistance; camera.position.z = fitDistance; }
  else zoom = THREE.MathUtils.clamp(zoom, fitDistance * 0.58, fitDistance * 1.65);
}
resize(); new ResizeObserver(resize).observe(host); updateTime(); setInterval(updateTime, 1000); animate(); reconcileCountryCoverage(); renderPlaces();

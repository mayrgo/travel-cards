import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { loadData, saveData, validateImport } from './data-store.js';

const initialPlaces = [
  { name: 'Seoul, South Korea', note: 'home base', kind: 'visited', icon: '首', lat: 37.5665, lon: 126.978 },
  { name: 'Tokyo, Japan', note: 'neon nights & tiny bars', kind: 'visited', icon: '東', lat: 35.6762, lon: 139.6503 },
  { name: 'Paris, France', note: 'a long weekend in spring', kind: 'visited', icon: 'P', lat: 48.8566, lon: 2.3522 },
  { name: 'Kyoto, Japan', note: 'temples before sunrise', kind: 'visited', icon: '京', lat: 35.0116, lon: 135.7681 },
  { name: 'Reykjavík, Iceland', note: 'chasing the aurora', kind: 'planned', icon: 'R', lat: 64.1466, lon: -21.9426 },
  { name: 'Marrakech, Morocco', note: 'the medina & mint tea', kind: 'planned', icon: 'M', lat: 31.6295, lon: -7.9811 },
  { name: 'Patagonia, Argentina', note: 'somewhere wild', kind: 'planned', icon: 'P', lat: -50.9423, lon: -73.4068 },
];
let data = loadData(initialPlaces);
let places = data.places.map((place) => {
  if (Number.isFinite(place.lat) && Number.isFinite(place.lon)) return place;
  const known = initialPlaces.find((sample) => sample.name === place.name);
  return known ? { ...known, ...place, lat: known.lat, lon: known.lon } : place;
});
let activeFilter = 'visited';
const $ = (q) => document.querySelector(q);
const list = $('#place-list');
let markerRefresh = () => {};
let selectedLocation = null;
let geocodeResults = [];

function renderPlaces() {
  const visible = places.filter((p) => p.kind === activeFilter);
  list.innerHTML = visible.length ? visible.map((p) => `<article class="place-row"><div class="place-thumb">${escapeHTML(p.icon || p.name[0])}</div><div class="place-meta"><b>${escapeHTML(p.name)}</b><small>${escapeHTML(p.note || (p.kind === 'visited' ? 'a story in the making' : 'one for the list'))}</small></div><span class="place-type ${p.kind === 'planned' ? 'planned-type' : ''}">${p.kind === 'visited' ? 'BEEN' : 'NEXT'}</span></article>`).join('') : '<p class="intro" style="padding:15px 0">No places here yet. Add your first pin.</p>';
  const visited = places.filter((p) => p.kind === 'visited').length;
  const planned = places.length - visited;
  $('#been-total').textContent = String(visited).padStart(2, '0');
  $('#plan-total').textContent = String(planned).padStart(2, '0');
  $('#place-count').textContent = String(visited).padStart(2, '0');
  const countries = new Set(places.filter((p) => p.kind === 'visited').map((p) => p.name.split(',').at(-1).trim())).size;
  $('#country-count').textContent = String(countries).padStart(2, '0');
  $('#trip-list').innerHTML = places.filter((p) => p.kind === 'planned').slice(0, 4).map((p) => `<article class="trip-row"><div class="trip-thumb">${escapeHTML(p.icon || p.name[0])}</div><div class="trip-meta"><b>${escapeHTML(p.name.split(',')[0])}</b><small>${escapeHTML(p.note || 'A place for later')}</small></div><i class="trip-dot"></i></article>`).join('');
  data.places = places;
  saveData(data);
  markerRefresh();
}
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  activeFilter = tab.dataset.filter;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
  renderPlaces();
}));
const dialog = $('#place-dialog');
function openForm(kind = activeFilter) { $('#place-form').reset(); $('#place-status').textContent = ''; $('#geocode-results').replaceChildren(); selectedLocation = null; geocodeResults = []; $('#place-form').elements.kind.value = kind; dialog.showModal(); }
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
  url.search = new URLSearchParams({ format: 'jsonv2', limit: '5', q: query.trim(), 'accept-language': 'en' });
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Place search is temporarily unavailable. Try again or enter coordinates.');
  const results = await response.json();
  if (!results.length) throw new Error('Place not found. Try adding the country, or enter coordinates.');
  const matches = results.map((item) => ({ lat: Number(item.lat), lon: Number(item.lon), label: item.display_name, type: item.type }));
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
    if (geocodeResults.length === 1) selectedLocation = geocodeResults[0];
    resultsHost.innerHTML = geocodeResults.map((result, index) => `<button type="button" class="geocode-result ${index === 0 && geocodeResults.length === 1 ? 'selected' : ''}" data-result="${index}"><span>${escapeHTML(result.label)}</span><small>${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}</small></button>`).join('');
    status.textContent = geocodeResults.length === 1 ? 'Location selected. Save to add its pin.' : 'Choose the right place from these matches.';
  } catch (error) { status.textContent = error.message; }
  finally { findButton.disabled = false; }
}
$('#find-place').addEventListener('click', runPlaceSearch);
$('#geocode-results').addEventListener('click', (event) => {
  const button = event.target.closest('[data-result]'); if (!button) return;
  selectedLocation = geocodeResults[Number(button.dataset.result)];
  $('#geocode-results').querySelectorAll('.geocode-result').forEach((item) => item.classList.toggle('selected', item === button));
  $('#place-status').textContent = 'Location selected. Save to add its pin.';
});
$('#place-form').elements.name.addEventListener('input', () => { selectedLocation = null; geocodeResults = []; $('#geocode-results').replaceChildren(); $('#place-status').textContent = ''; });
$('#place-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const name = String(data.get('name')).trim();
  const status = $('#place-status');
  const saveButton = form.querySelector('.save-button');
  saveButton.disabled = true;
  let location;
  try {
    const latText = String(data.get('lat')).trim(), lonText = String(data.get('lon')).trim();
    if ((latText === '') !== (lonText === '')) throw new Error('Enter both latitude and longitude, or leave both empty for place search.');
    if (latText !== '' && lonText !== '') location = { lat: Number(latText), lon: Number(lonText) };
    else {
      if (!selectedLocation) {
        saveButton.disabled = false;
        if (!geocodeResults.length) await runPlaceSearch();
        else status.textContent = 'Choose one of the search results before saving.';
        return;
      }
      location = selectedLocation;
    }
  } catch (error) {
    status.textContent = error.message;
    saveButton.disabled = false;
    return;
  }
  const place = { id: crypto.randomUUID(), name, note: String(data.get('note')).trim(), kind: data.get('kind'), icon: name.slice(0, 1).toUpperCase(), lat: location.lat, lon: location.lon };
  places.unshift(place);
  activeFilter = data.get('kind');
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
    const grid = $('#photo-grid'); grid.insertBefore(img, grid.firstChild);
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
    data = validateImport(JSON.parse(await file.text())); places = data.places;
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
  const subLon = ((720 - 4 * (hour * 60 + equation)) / 60 + 180) % 360 - 180;
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
const earthMaterial = new THREE.ShaderMaterial({ uniforms, vertexShader: `varying vec2 vUv; varying vec3 vNormal; varying vec3 vPosition; void main(){vUv=uv; vNormal=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vPosition=mv.xyz; gl_Position=projectionMatrix*mv;}`, fragmentShader: `uniform sampler2D dayMap; uniform sampler2D lightsMap; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vNormal; varying vec3 vPosition; void main(){ vec2 uv=vec2(vUv.x,1.0-vUv.y); vec3 tex=texture2D(dayMap,uv).rgb; float lum=dot(tex,vec3(0.299,0.587,0.114)); vec3 mono=vec3(pow(lum,0.8)*0.82+0.08); float sun=dot(normalize(vNormal),normalize(sunDir)); float day=smoothstep(-0.12,0.16,sun); float night=1.0-day; vec3 lights=texture2D(lightsMap,uv).rgb; vec3 city=vec3(0.92,0.72,0.39)*pow(max(lights.r,lights.g),1.4)*1.65; vec3 surface=mix(vec3(0.012,0.018,0.019)+city,mono,day); float rim=pow(1.0-max(dot(normalize(vNormal),normalize(-vPosition)),0.0),3.0); surface+=vec3(0.13,0.18,0.16)*rim; gl_FragColor=vec4(surface,1.0);}` });
const earth = new THREE.Mesh(sphereGeometry, earthMaterial); globe.add(earth);
const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.445, 64, 48), new THREE.ShaderMaterial({ transparent: true, side: THREE.BackSide, vertexShader: 'varying vec3 n; void main(){n=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: 'varying vec3 n; void main(){float a=pow(0.72-max(dot(normalize(n),vec3(0.0,0.0,1.0)),0.0),2.2); gl_FragColor=vec4(0.27,0.35,0.32,a*0.22);}' })); globe.add(atmosphere);
globe.rotation.y = -0.48; globe.rotation.x = -0.12;
let dragging = false, lastX = 0, lastY = 0, targetX = globe.rotation.x, targetY = globe.rotation.y;
let fitDistance = 5.8;
let zoom = fitDistance;
const pinGeometry = new THREE.SphereGeometry(0.026, 12, 10);
function coordinatesToPosition(lat, lon, radius = 1.47) {
  const latitude = THREE.MathUtils.degToRad(lat), longitude = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(-radius * Math.cos(latitude) * Math.cos(longitude), radius * Math.sin(latitude), radius * Math.cos(latitude) * Math.sin(longitude));
}
function refreshMarkers() {
  for (const child of [...globe.children]) if (child.userData.travelMarker) globe.remove(child);
  for (const place of places) {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lon)) continue;
    const color = place.kind === 'visited' ? 0xc2eb79 : 0xe4b86d;
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
  targetY = Math.PI / 2 - THREE.MathUtils.degToRad(place.lon);
  targetX = THREE.MathUtils.degToRad(place.lat);
  zoom = Math.min(zoom, fitDistance * 0.92);
}
refreshMarkers();
renderer.domElement.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointermove', (e) => { if (!dragging) return; targetY += (e.clientX - lastX) * 0.005; targetX = Math.max(-1.1, Math.min(1.1, targetX + (e.clientY - lastY) * 0.005)); lastX = e.clientX; lastY = e.clientY; });
renderer.domElement.addEventListener('pointerup', () => dragging = false);
renderer.domElement.addEventListener('wheel', (e) => { zoom = THREE.MathUtils.clamp(zoom + e.deltaY * 0.003, fitDistance * 0.58, fitDistance * 1.65); }, { passive: true });
$('#zoom-in').addEventListener('click', () => zoom = Math.max(fitDistance * 0.58, zoom - fitDistance * 0.1));
$('#zoom-out').addEventListener('click', () => zoom = Math.min(fitDistance * 1.65, zoom + fitDistance * 0.1));
function updateTime() {
  const now = new Date(); $('#utc-time').textContent = `UTC ${new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)}`;
  const { decl, subLon } = solarPosition(now);
  const lon = THREE.MathUtils.degToRad(subLon), lat = decl;
  const sunWorld = new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
  const inverseRotation = new THREE.Quaternion().setFromEuler(globe.rotation).invert();
  uniforms.sunDir.value.copy(sunWorld.applyQuaternion(inverseRotation));
  const zone = Math.abs(subLon) < 30 ? 'THE PACIFIC OCEAN' : subLon > 0 ? 'ASIA & THE PACIFIC' : 'THE AMERICAS';
  $('#sun-position').textContent = `NOW OVER ${zone}`;
}
function animate() { requestAnimationFrame(animate); if (!dragging) targetY += 0.00022; globe.rotation.y += (targetY - globe.rotation.y) * 0.035; globe.rotation.x += (targetX - globe.rotation.x) * 0.035; camera.position.z += (zoom - camera.position.z) * 0.08; renderer.render(scene, camera); }
function resize() {
  const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  fitDistance = 1.47 * 1.16 / Math.tan(Math.min(verticalFov, horizontalFov) / 2);
  if (camera.position.z === 5.8 && zoom === 5.8) zoom = fitDistance;
  else zoom = THREE.MathUtils.clamp(zoom, fitDistance * 0.58, fitDistance * 1.65);
}
new ResizeObserver(resize).observe(host); updateTime(); setInterval(updateTime, 30000); animate(); renderPlaces();

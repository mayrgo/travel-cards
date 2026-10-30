import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const initialPlaces = [
  { name: 'Seoul, South Korea', note: 'home base', kind: 'visited', icon: '首' },
  { name: 'Tokyo, Japan', note: 'neon nights & tiny bars', kind: 'visited', icon: '東' },
  { name: 'Paris, France', note: 'a long weekend in spring', kind: 'visited', icon: 'P' },
  { name: 'Kyoto, Japan', note: 'temples before sunrise', kind: 'visited', icon: '京' },
  { name: 'Reykjavík, Iceland', note: 'chasing the aurora', kind: 'planned', icon: 'R' },
  { name: 'Marrakech, Morocco', note: 'the medina & mint tea', kind: 'planned', icon: 'M' },
  { name: 'Patagonia, Argentina', note: 'somewhere wild', kind: 'planned', icon: 'P' },
];
let places;
try { places = JSON.parse(localStorage.getItem('travel-cards-places')) || initialPlaces; } catch { places = initialPlaces; }
let activeFilter = 'visited';
const $ = (q) => document.querySelector(q);
const list = $('#place-list');

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
  localStorage.setItem('travel-cards-places', JSON.stringify(places));
}
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  activeFilter = tab.dataset.filter;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
  renderPlaces();
}));
const dialog = $('#place-dialog');
function openForm(kind = activeFilter) { $('#place-form').elements.kind.value = kind; dialog.showModal(); }
['#add-place', '#add-place-bottom', '#map-add', '#add-trip', '#plan-card'].forEach((id) => $(id).addEventListener('click', () => openForm(id === '#add-trip' || id === '#plan-card' ? 'planned' : activeFilter)));
$('#place-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const name = String(data.get('name')).trim();
  places.unshift({ name, note: String(data.get('note')).trim(), kind: data.get('kind'), icon: name.slice(0, 1).toUpperCase() });
  activeFilter = data.get('kind');
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.filter === activeFilter));
  renderPlaces(); form.reset(); dialog.close();
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
camera.position.z = 4.4;
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
let dragging = false, lastX = 0, lastY = 0, targetX = globe.rotation.x, targetY = globe.rotation.y, zoom = 4.4;
renderer.domElement.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointermove', (e) => { if (!dragging) return; targetY += (e.clientX - lastX) * 0.005; targetX = Math.max(-1.1, Math.min(1.1, targetX + (e.clientY - lastY) * 0.005)); lastX = e.clientX; lastY = e.clientY; });
renderer.domElement.addEventListener('pointerup', () => dragging = false);
renderer.domElement.addEventListener('wheel', (e) => { zoom = Math.max(3.1, Math.min(7, zoom + e.deltaY * 0.003)); }, { passive: true });
$('#zoom-in').addEventListener('click', () => zoom = Math.max(3.1, zoom - 0.35)); $('#zoom-out').addEventListener('click', () => zoom = Math.min(7, zoom + 0.35));
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
function resize() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(host); updateTime(); setInterval(updateTime, 30000); animate(); renderPlaces();

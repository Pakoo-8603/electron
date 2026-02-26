import './styles.css';
import type { ManagedDevice, RequestLog } from '../shared/types';

interface UserRow {
  employeeNo?: string;
  name?: string;
  userType?: string;
  gender?: string;
  numOfCard?: number;
  numOfFace?: number;
  doorRight?: string;
  Valid?: { beginTime?: string; endTime?: string; enable?: boolean };
  faceURL?: string;
}

const state: {
  devices: ManagedDevice[];
  selectedDeviceId: string;
  hasStoredPasswordByDevice: Record<string, boolean>;
  password: string;
  result: unknown;
  users: UserRow[];
  totalUsers: number;
  fuzzySearch: string;
  searchPosition: number;
  maxResults: number;
  logs: RequestLog[];
  loading: boolean;
  keytarAvailable: boolean;
} = {
  devices: [],
  selectedDeviceId: '',
  hasStoredPasswordByDevice: {},
  password: '',
  result: { info: 'Esperando acción.' },
  users: [],
  totalUsers: 0,
  fuzzySearch: '',
  searchPosition: 0,
  maxResults: 30,
  logs: [],
  loading: false,
  keytarAvailable: true
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('No se encontró #app');

function getBridge() {
  if (!window.hikvisionGateway) {
    throw new Error('Bridge IPC no disponible. Ejecuta la UI dentro de Electron con `npm run dev`, no solo en navegador.');
  }
  return window.hikvisionGateway;
}

function selectedDevice() {
  return state.devices.find((device) => device.id === state.selectedDeviceId) ?? state.devices[0];
}

function addLog(log: RequestLog) {
  state.logs.unshift(log);
  state.logs = state.logs.slice(0, 60);
}

function bindInput(id: string, value: string | number | boolean, onChange: (value: string | number | boolean) => void) {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
  if (!el) return;

  if (el instanceof HTMLInputElement && el.type === 'checkbox') {
    el.checked = Boolean(value);
    el.onchange = () => onChange(el.checked);
    return;
  }

  el.value = String(value);
  el.onchange = () => onChange(el.value);
}

async function withLoading<T>(fn: () => Promise<T>) {
  state.loading = true;
  render();
  try {
    return await fn();
  } finally {
    state.loading = false;
    render();
  }
}

async function loadState() {
  const resp = await getBridge().getState();
  state.devices = resp.devices;
  state.selectedDeviceId = resp.selectedDeviceId || resp.devices[0]?.id;
  state.hasStoredPasswordByDevice = resp.hasStoredPasswordByDevice;
  render();
}

async function onCreateDevice() {
  await withLoading(async () => {
    const resp = await getBridge().createDevice();
    state.devices = resp.devices;
    state.selectedDeviceId = resp.device.id;
    state.password = '';
    state.result = { info: 'Dispositivo creado. Configúralo y guarda.' };
  });
}

async function onDeleteDevice() {
  const device = selectedDevice();
  if (!device) return;

  await withLoading(async () => {
    const resp = await getBridge().deleteDevice({ deviceId: device.id });
    if (!resp.ok) {
      state.result = { error: resp.message };
      return;
    }

    state.devices = resp.devices ?? [];
    state.selectedDeviceId = resp.selectedDeviceId ?? state.devices[0]?.id;
    state.password = '';
    state.users = [];
    state.result = { info: 'Dispositivo eliminado.' };
  });
}

async function onSelectDevice(deviceId: string) {
  const resp = await getBridge().selectDevice({ deviceId });
  state.selectedDeviceId = resp.device.id;
  state.password = '';
  state.hasStoredPasswordByDevice[resp.device.id] = resp.hasStoredPassword;
  state.users = [];
  state.result = { info: `Seleccionado: ${resp.device.name}` };
  render();
}

async function onSaveDevice() {
  const device = selectedDevice();
  if (!device) return;

  const resp = await getBridge().saveDevice({
    device,
    password: state.password || undefined
  });

  state.keytarAvailable = resp.keytarAvailable;
  state.result = { info: 'Configuración guardada.' };
}

function extractUsers(jsonResponse: any): { users: UserRow[]; totalMatches: number } {
  const users = jsonResponse?.UserInfoSearch?.UserInfo;
  const normalized = Array.isArray(users) ? users : users ? [users] : [];
  const totalMatches = Number(jsonResponse?.UserInfoSearch?.totalMatches ?? normalized.length ?? 0);
  return { users: normalized, totalMatches };
}

async function onTestConnection() {
  const device = selectedDevice();
  if (!device) return;

  await withLoading(async () => {
    await onSaveDevice();
    const response = await getBridge().testConnection({
      deviceId: device.id,
      password: state.password || undefined
    });

    addLog(response.log);
    state.result = response.result ?? response.error;
  });
}

async function onListUsers() {
  const device = selectedDevice();
  if (!device) return;

  await withLoading(async () => {
    await onSaveDevice();
    const response = await getBridge().listUsers({
      deviceId: device.id,
      password: state.password || undefined,
      search: {
        searchResultPosition: state.searchPosition,
        maxResults: state.maxResults,
        fuzzySearch: state.fuzzySearch
      }
    });

    addLog(response.log);
    state.result = response.result ?? response.error;

    const jsonData = response.result?.json;
    if (jsonData) {
      const extracted = extractUsers(jsonData);
      state.users = extracted.users;
      state.totalUsers = extracted.totalMatches;
    }
  });
}

async function onProbe() {
  const device = selectedDevice();
  if (!device) return;

  await withLoading(async () => {
    const response = await getBridge().probe({
      deviceId: device.id,
      password: state.password || undefined
    });
    state.result = { probe: response };
  });
}

function userTable() {
  if (state.users.length === 0) {
    return '<div class="small">Sin usuarios en pantalla. Usa "Listar usuarios".</div>';
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Emp No</th>
            <th>Nombre</th>
            <th>Tipo</th>
            <th>Género</th>
            <th>Tarjetas</th>
            <th>Rostros</th>
            <th>Vigencia</th>
            <th>Face URL</th>
          </tr>
        </thead>
        <tbody>
          ${state.users
            .map((user) => {
              const valid = user.Valid
                ? `${user.Valid.beginTime ?? '-'} → ${user.Valid.endTime ?? '-'}`
                : '-';

              return `<tr>
                <td>${user.employeeNo ?? '-'}</td>
                <td>${user.name ?? '-'}</td>
                <td>${user.userType ?? '-'}</td>
                <td>${user.gender ?? '-'}</td>
                <td>${user.numOfCard ?? 0}</td>
                <td>${user.numOfFace ?? 0}</td>
                <td>${valid}</td>
                <td>${user.faceURL ? `<a href="${user.faceURL}" target="_blank" rel="noreferrer">Ver</a>` : '-'}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function render() {
  const device = selectedDevice();
  const hasStoredPassword = device ? Boolean(state.hasStoredPasswordByDevice[device.id]) : false;

  app.innerHTML = `
    <div class="container">
      <section class="card">
        <h1>Gateway ISAPI Hikvision</h1>

        <label>Dispositivos
          <select id="deviceSelect">
            ${state.devices.map((item) => `<option value="${item.id}" ${item.id === state.selectedDeviceId ? 'selected' : ''}>${item.name}</option>`).join('')}
          </select>
        </label>

        <div class="row">
          <button id="newDevice" class="secondary" ${state.loading ? 'disabled' : ''}>+ Agregar</button>
          <button id="deleteDevice" class="secondary" ${state.loading ? 'disabled' : ''}>Eliminar</button>
        </div>

        <label>Nombre del dispositivo <input id="deviceName" placeholder="Puerta principal" /></label>
        <label>IP / Host <input id="host" placeholder="192.168.0.187" /></label>

        <div class="row">
          <label>Puerto <input id="port" type="number" min="1" max="65535" /></label>
          <label>Protocolo
            <select id="protocol">
              <option value="https">https</option>
              <option value="http">http</option>
            </select>
          </label>
        </div>

        <label>Usuario <input id="username" /></label>
        <label>Password <input id="password" type="password" placeholder="${hasStoredPassword ? 'Usando password guardado (si no escribes aquí)' : ''}" /></label>
        <label>Timeout (ms) <input id="timeoutMs" type="number" min="1000" /></label>

        <label class="switch"><input id="tlsInsecure" type="checkbox" /> TLS insecure (self-signed)</label>
        <label class="switch"><input id="rememberPassword" type="checkbox" /> Recordar password</label>

        <div class="small">${state.keytarAvailable ? 'Keytar disponible para almacenar password por dispositivo.' : 'Keytar no disponible: no se guarda password.'}</div>

        <button id="save" class="secondary" ${state.loading ? 'disabled' : ''}>Guardar dispositivo</button>
        <button id="test" ${state.loading ? 'disabled' : ''}>Probar conexión</button>

        <h3>Consulta usuarios</h3>
        <div class="row">
          <label>Posición <input id="searchPosition" type="number" min="0" /></label>
          <label>Máximo <input id="maxResults" type="number" min="1" max="200" /></label>
        </div>
        <label>Fuzzy search (nombre/ID) <input id="fuzzySearch" placeholder="ej: LUIS" /></label>

        <button id="users" ${state.loading ? 'disabled' : ''}>Listar usuarios</button>
        <button id="nextPage" class="secondary" ${state.loading ? 'disabled' : ''}>Siguiente página</button>
        <button id="probe" class="secondary" ${state.loading ? 'disabled' : ''}>Detectar (443/80)</button>
      </section>

      <section class="card">
        <h2>Usuarios (${state.users.length} mostrados de ${state.totalUsers || 0})</h2>
        ${userTable()}

        <h2>Resultado JSON</h2>
        <pre>${JSON.stringify(state.result, null, 2)}</pre>

        <h2>Logs por request</h2>
        <div>
          ${state.logs
            .map((log) => `<div class="log-line">[${new Date(log.timestamp).toLocaleTimeString()}] ${log.method} ${log.url} → status ${log.status ?? 'N/A'} en ${log.durationMs}ms ${log.message ? `(${log.message})` : ''}</div>`)
            .join('')}
        </div>
      </section>
    </div>
  `;

  if (!device) return;

  bindInput('deviceName', device.name, (value) => (device.name = String(value)));
  bindInput('host', device.config.host, (value) => (device.config.host = String(value)));
  bindInput('port', device.config.port, (value) => (device.config.port = Number(value)));
  bindInput('protocol', device.config.protocol, (value) => (device.config.protocol = value as any));
  bindInput('username', device.config.username, (value) => (device.config.username = String(value)));
  bindInput('password', state.password, (value) => (state.password = String(value)));
  bindInput('tlsInsecure', device.config.tlsInsecure, (value) => (device.config.tlsInsecure = Boolean(value)));
  bindInput('rememberPassword', device.config.rememberPassword, (value) => (device.config.rememberPassword = Boolean(value)));
  bindInput('timeoutMs', device.config.timeoutMs, (value) => (device.config.timeoutMs = Number(value)));

  bindInput('searchPosition', state.searchPosition, (value) => (state.searchPosition = Number(value)));
  bindInput('maxResults', state.maxResults, (value) => (state.maxResults = Number(value)));
  bindInput('fuzzySearch', state.fuzzySearch, (value) => (state.fuzzySearch = String(value)));

  document.getElementById('deviceSelect')?.addEventListener('change', (ev) => {
    const target = ev.target as HTMLSelectElement;
    void onSelectDevice(target.value);
  });

  document.getElementById('newDevice')?.addEventListener('click', () => void onCreateDevice());
  document.getElementById('deleteDevice')?.addEventListener('click', () => void onDeleteDevice());
  document.getElementById('save')?.addEventListener('click', () => void onSaveDevice());
  document.getElementById('test')?.addEventListener('click', () => void onTestConnection());
  document.getElementById('users')?.addEventListener('click', () => {
    state.searchPosition = Number((document.getElementById('searchPosition') as HTMLInputElement).value || 0);
    void onListUsers();
  });
  document.getElementById('nextPage')?.addEventListener('click', () => {
    state.searchPosition += state.maxResults;
    void onListUsers();
  });
  document.getElementById('probe')?.addEventListener('click', () => void onProbe());
}

render();
void loadState().catch((error) => {
  state.result = {
    error: error instanceof Error ? error.message : String(error),
    hint: 'Si abriste solo Vite en navegador, usa `npm run dev` para levantar Electron + preload.'
  };
  render();
});

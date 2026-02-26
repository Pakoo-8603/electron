import './styles.css';
import type { GatewayConfig, RequestLog } from '../shared/types';

const defaultConfig: GatewayConfig = {
  host: '',
  port: 443,
  protocol: 'https',
  username: 'admin',
  tlsInsecure: true,
  rememberPassword: false,
  timeoutMs: 8000
};

const state: {
  config: GatewayConfig;
  password: string;
  result: unknown;
  logs: RequestLog[];
  loading: boolean;
  keytarAvailable: boolean;
  hasStoredPassword: boolean;
} = {
  config: defaultConfig,
  password: '',
  result: { info: 'Esperando acción.' },
  logs: [],
  loading: false,
  keytarAvailable: true,
  hasStoredPassword: false
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('No se encontró #app');

function addLog(log: RequestLog) {
  state.logs.unshift(log);
  state.logs = state.logs.slice(0, 40);
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

async function loadConfig() {
  const resp = await window.hikvisionGateway.getConfig();
  state.config = resp.config ?? defaultConfig;
  state.hasStoredPassword = resp.hasStoredPassword;
  render();
}

async function saveConfig() {
  const resp = await window.hikvisionGateway.saveConfig({
    config: state.config,
    password: state.password || undefined
  });

  state.keytarAvailable = resp.keytarAvailable;
}

async function onTestConnection() {
  await withLoading(async () => {
    await saveConfig();
    const response = await window.hikvisionGateway.testConnection({
      config: state.config,
      password: state.password || undefined
    });

    addLog(response.log);
    state.result = response.result ?? response.error;
  });
}

async function onListUsers() {
  await withLoading(async () => {
    await saveConfig();
    const response = await window.hikvisionGateway.listUsers({
      config: state.config,
      password: state.password || undefined,
      search: { searchResultPosition: 0, maxResults: 30, fuzzySearch: '' }
    });

    addLog(response.log);
    state.result = response.result ?? response.error;
  });
}

async function onProbe() {
  await withLoading(async () => {
    const response = await window.hikvisionGateway.probe({
      host: state.config.host,
      username: state.config.username,
      password: state.password,
      tlsInsecure: state.config.tlsInsecure
    });
    state.result = { probe: response };
  });
}

function render() {
  app.innerHTML = `
    <div class="container">
      <section class="card">
        <h1>Gateway ISAPI Hikvision</h1>
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
        <label>Password <input id="password" type="password" placeholder="${state.hasStoredPassword ? 'Usando password guardado (si no escribes aquí)' : ''}" /></label>
        <label>Timeout (ms) <input id="timeoutMs" type="number" min="1000" /></label>

        <label class="switch"><input id="tlsInsecure" type="checkbox" /> TLS insecure (self-signed)</label>
        <label class="switch"><input id="rememberPassword" type="checkbox" /> Recordar password</label>
        <div class="small">${state.keytarAvailable ? 'Keytar disponible para guardar password de forma segura.' : 'Keytar no disponible: no se guardará password aunque lo actives.'}</div>

        <button id="test" ${state.loading ? 'disabled' : ''}>Probar conexión</button>
        <button id="users" ${state.loading ? 'disabled' : ''}>Listar usuarios</button>
        <button id="probe" class="secondary" ${state.loading ? 'disabled' : ''}>Detectar (443/80, https/http)</button>
      </section>

      <section class="card">
        <h2>Resultado</h2>
        <pre>${JSON.stringify(state.result, null, 2)}</pre>
        <h2>Logs por request</h2>
        <div>
          ${state.logs
            .map(
              (log) => `<div class="log-line">[${new Date(log.timestamp).toLocaleTimeString()}] ${log.method} ${log.url} → status ${log.status ?? 'N/A'} en ${log.durationMs}ms ${log.message ? `(${log.message})` : ''}</div>`
            )
            .join('')}
        </div>
      </section>
    </div>
  `;

  bindInput('host', state.config.host, (value) => (state.config.host = String(value)));
  bindInput('port', state.config.port, (value) => (state.config.port = Number(value)));
  bindInput('protocol', state.config.protocol, (value) => (state.config.protocol = value as GatewayConfig['protocol']));
  bindInput('username', state.config.username, (value) => (state.config.username = String(value)));
  bindInput('password', state.password, (value) => (state.password = String(value)));
  bindInput('tlsInsecure', state.config.tlsInsecure, (value) => (state.config.tlsInsecure = Boolean(value)));
  bindInput('rememberPassword', state.config.rememberPassword, (value) => (state.config.rememberPassword = Boolean(value)));
  bindInput('timeoutMs', state.config.timeoutMs, (value) => (state.config.timeoutMs = Number(value)));

  document.getElementById('test')?.addEventListener('click', () => void onTestConnection());
  document.getElementById('users')?.addEventListener('click', () => void onListUsers());
  document.getElementById('probe')?.addEventListener('click', () => void onProbe());
}

void loadConfig();
render();

import { useEffect, useMemo, useState } from 'react';
import type { DeviceAccessLog, DeviceDirectoryUser } from '../shared/types.js';
import { gatewayApi, isElectronBridgeAvailable, type GatewayState } from './api';

const tabs = ['Wizard', 'Dispositivos', 'Estado', 'Datos del dispositivo', 'Accesos recientes', 'Logs'] as const;

export const App = () => {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('Wizard');
  const [state, setState] = useState<GatewayState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [deviceUsers, setDeviceUsers] = useState<DeviceDirectoryUser[]>([]);
  const [deviceAccessLogs, setDeviceAccessLogs] = useState<DeviceAccessLog[]>([]);
  const [deviceForm, setDeviceForm] = useState({
    name: '',
    ip: '',
    port: 80,
    protocol: 'http',
    username: '',
    password: '',
    mode: 'auto',
    enabled: true
  });

  const refresh = async () => {
    try {
      const next = await gatewayApi.getState();
      setState(next);
      if (!selectedDeviceId && next.devices.length) {
        setSelectedDeviceId(next.devices[0].id);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  const loadDeviceData = async () => {
    if (!selectedDeviceId) return;
    try {
      const [users, logs] = await Promise.all([
        gatewayApi.getDeviceUsers(selectedDeviceId),
        gatewayApi.getDeviceAccessLogs(selectedDeviceId)
      ]);
      setDeviceUsers(users);
      setDeviceAccessLogs(logs.slice(0, 50));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const health = useMemo(() => {
    if (!state || state.devices.length === 0) {
      return {
        color: 'orange',
        message: 'Sin dispositivos configurados todavía o sin conexión inicial.'
      };
    }
    if ((state.queueDepth ?? 0) > 100) {
      return {
        color: 'red',
        message: 'Cola local elevada: revisar conectividad a nube/backend.'
      };
    }
    if ((state.statuses ?? []).some((entry) => !entry.connected)) {
      return {
        color: 'orange',
        message: 'Hay al menos un dispositivo desconectado/reintentando.'
      };
    }
    return {
      color: 'green',
      message: 'Gateway saludable y dispositivos conectados.'
    };
  }, [state]);

  return (
    <div className="layout">
      <aside>
        <h1>Gateway Hikvision</h1>
        <div className={`health ${health.color}`}>Salud</div>
        <small>{health.message}</small>
        {tabs.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={activeTab === tab ? 'active' : ''}>
            {tab}
          </button>
        ))}
      </aside>
      <main>
        {!isElectronBridgeAvailable() && (
          <div className="warning-banner">
            Ejecutando en navegador sin bridge IPC de Electron. Se habilitó un mock local para evitar fallos de `window.gatewayApi`.
          </div>
        )}

        {error && <div className="error-banner">Error: {error}</div>}

        {activeTab === 'Wizard' && state?.settings && (
          <section>
            <h2>Configuración inicial</h2>
            <pre>{JSON.stringify(state.settings, null, 2)}</pre>
            <p>Primero enfoquémonos en consumo local del dispositivo. La sincronización nube se puede dejar para siguiente fase.</p>
          </section>
        )}

        {activeTab === 'Dispositivos' && (
          <section>
            <h2>Dispositivos</h2>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                try {
                  await gatewayApi.upsertDevice(deviceForm as any);
                  await refresh();
                  setDeviceForm({ ...deviceForm, name: '', ip: '', username: '', password: '' });
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                }
              }}
            >
              <input placeholder="Nombre" value={deviceForm.name} onChange={(event) => setDeviceForm({ ...deviceForm, name: event.target.value })} required />
              <input placeholder="IP" value={deviceForm.ip} onChange={(event) => setDeviceForm({ ...deviceForm, ip: event.target.value })} required />
              <input type="number" placeholder="Puerto" value={deviceForm.port} onChange={(event) => setDeviceForm({ ...deviceForm, port: Number(event.target.value) })} required />
              <select value={deviceForm.protocol} onChange={(event) => setDeviceForm({ ...deviceForm, protocol: event.target.value })}>
                <option>http</option><option>https</option>
              </select>
              <input placeholder="Usuario" value={deviceForm.username} onChange={(event) => setDeviceForm({ ...deviceForm, username: event.target.value })} required />
              <input type="password" placeholder="Password" value={deviceForm.password} onChange={(event) => setDeviceForm({ ...deviceForm, password: event.target.value })} required />
              <select value={deviceForm.mode} onChange={(event) => setDeviceForm({ ...deviceForm, mode: event.target.value })}>
                <option>auto</option><option>alertStream</option><option>httpPush</option><option>polling</option>
              </select>
              <button type="submit">Guardar</button>
            </form>
            <ul>
              {(state?.devices ?? []).map((device) => (
                <li key={device.id}>{device.name} ({device.ip}) - {device.mode}</li>
              ))}
            </ul>
          </section>
        )}

        {activeTab === 'Estado' && (
          <section>
            <h2>Estado</h2>
            <p>Queue: {state?.queueDepth ?? 0}</p>
            <p>Latencia nube: {state?.cloudLatency ?? '-'} ms</p>
            <ul>
              {(state?.statuses ?? []).map((status) => (
                <li key={status.deviceId}>{status.deviceId}: {status.connected ? 'Connected' : 'Disconnected'} / {status.mode}</li>
              ))}
            </ul>
          </section>
        )}

        {activeTab === 'Datos del dispositivo' && (
          <section>
            <h2>Datos directos del dispositivo (sin backend)</h2>
            <div className="device-tools">
              <select value={selectedDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)}>
                <option value="">Selecciona un dispositivo</option>
                {(state?.devices ?? []).map((device) => (
                  <option key={device.id} value={device.id}>{device.name} ({device.ip})</option>
                ))}
              </select>
              <button onClick={loadDeviceData} disabled={!selectedDeviceId}>Consultar usuarios y accesos</button>
            </div>

            <h3>Usuarios/Empleados ({deviceUsers.length})</h3>
            <table>
              <thead><tr><th>Empleado</th><th>Nombre</th><th>Tarjeta</th></tr></thead>
              <tbody>
                {deviceUsers.map((user) => (
                  <tr key={`${user.employeeNo}-${user.cardNo ?? ''}`}><td>{user.employeeNo}</td><td>{user.name ?? '-'}</td><td>{user.cardNo ?? '-'}</td></tr>
                ))}
              </tbody>
            </table>

            <h3>Accesos recientes del equipo ({deviceAccessLogs.length})</h3>
            <table>
              <thead><tr><th>Hora</th><th>Evento</th><th>Empleado</th><th>Nombre</th><th>Verificación</th></tr></thead>
              <tbody>
                {deviceAccessLogs.map((entry, index) => (
                  <tr key={`${entry.timestamp ?? 't'}-${index}`}>
                    <td>{entry.timestamp ?? '-'}</td>
                    <td>{entry.eventType ?? '-'}</td>
                    <td>{entry.employeeNo ?? '-'}</td>
                    <td>{entry.name ?? '-'}</td>
                    <td>{entry.verifyMode ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {activeTab === 'Accesos recientes' && (
          <section>
            <h2>Últimos accesos (cola local SQLite)</h2>
            <table>
              <thead><tr><th>Hora</th><th>Dispositivo</th><th>Evento</th><th>Persona</th></tr></thead>
              <tbody>
                {(state?.recentEvents ?? []).map((entry) => (
                  <tr key={entry.eventId}><td>{entry.timestampGateway}</td><td>{entry.deviceId}</td><td>{entry.eventType}</td><td>{entry.personName ?? entry.personId ?? '-'}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {activeTab === 'Logs' && (
          <section>
            <h2>Logs</h2>
            <p>Logs rotativos en userData/logs/gateway.log (pendiente botón exportar).</p>
          </section>
        )}
      </main>
    </div>
  );
};

import { useEffect, useMemo, useState } from 'react';
import { gatewayApi, isElectronBridgeAvailable, type GatewayState } from './api';

const tabs = ['Wizard', 'Dispositivos', 'Estado', 'Accesos recientes', 'Logs'] as const;

export const App = () => {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('Wizard');
  const [state, setState] = useState<GatewayState | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      setState(await gatewayApi.getState());
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

  const healthColor = useMemo(() => {
    if (!state) return 'gray';
    if ((state.queueDepth ?? 0) > 100) return 'red';
    if ((state.statuses ?? []).some((entry) => !entry.connected)) return 'orange';
    return 'green';
  }, [state]);

  return (
    <div className="layout">
      <aside>
        <h1>Gateway Hikvision</h1>
        <div className={`health ${healthColor}`}>Salud</div>
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
            <p>Editable desde settings store (próxima iteración: formulario persistente IPC).</p>
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
                  setDeviceForm({
                    ...deviceForm,
                    name: '',
                    ip: '',
                    username: '',
                    password: ''
                  });
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                }
              }}
            >
              <input placeholder="Nombre" value={deviceForm.name} onChange={(event) => setDeviceForm({ ...deviceForm, name: event.target.value })} required />
              <input placeholder="IP" value={deviceForm.ip} onChange={(event) => setDeviceForm({ ...deviceForm, ip: event.target.value })} required />
              <input
                type="number"
                placeholder="Puerto"
                value={deviceForm.port}
                onChange={(event) => setDeviceForm({ ...deviceForm, port: Number(event.target.value) })}
                required
              />
              <select value={deviceForm.protocol} onChange={(event) => setDeviceForm({ ...deviceForm, protocol: event.target.value })}>
                <option>http</option>
                <option>https</option>
              </select>
              <input placeholder="Usuario" value={deviceForm.username} onChange={(event) => setDeviceForm({ ...deviceForm, username: event.target.value })} required />
              <input
                type="password"
                placeholder="Password"
                value={deviceForm.password}
                onChange={(event) => setDeviceForm({ ...deviceForm, password: event.target.value })}
                required
              />
              <select value={deviceForm.mode} onChange={(event) => setDeviceForm({ ...deviceForm, mode: event.target.value })}>
                <option>auto</option>
                <option>alertStream</option>
                <option>httpPush</option>
                <option>polling</option>
              </select>
              <button type="submit">Guardar</button>
            </form>
            <ul>
              {(state?.devices ?? []).map((device) => (
                <li key={device.id}>
                  {device.name} ({device.ip}) - {device.mode}
                </li>
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
                <li key={status.deviceId}>
                  {status.deviceId}: {status.connected ? 'Connected' : 'Disconnected'} / {status.mode}
                </li>
              ))}
            </ul>
          </section>
        )}

        {activeTab === 'Accesos recientes' && (
          <section>
            <h2>Últimos accesos</h2>
            <table>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Dispositivo</th>
                  <th>Evento</th>
                  <th>Persona</th>
                </tr>
              </thead>
              <tbody>
                {(state?.recentEvents ?? []).map((entry) => (
                  <tr key={entry.eventId}>
                    <td>{entry.timestampGateway}</td>
                    <td>{entry.deviceId}</td>
                    <td>{entry.eventType}</td>
                    <td>{entry.personName ?? entry.personId ?? '-'}</td>
                  </tr>
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

import { useEffect, useMemo, useState } from 'react';

const tabs = ['Wizard', 'Dispositivos', 'Estado', 'Accesos recientes', 'Logs'] as const;

export const App = () => {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('Wizard');
  const [state, setState] = useState<any>(null);
  const [deviceForm, setDeviceForm] = useState({ name: '', ip: '', port: 80, protocol: 'http', username: '', password: '', mode: 'auto', enabled: true });

  const refresh = async () => setState(await window.gatewayApi.getState());

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  const healthColor = useMemo(() => {
    if (!state) return 'gray';
    if ((state.queueDepth ?? 0) > 100) return 'red';
    if ((state.statuses ?? []).some((s: any) => !s.connected)) return 'orange';
    return 'green';
  }, [state]);

  return (
    <div className="layout">
      <aside>
        <h1>Gateway Hikvision</h1>
        <div className={`health ${healthColor}`}>Salud</div>
        {tabs.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={activeTab === tab ? 'active' : ''}>{tab}</button>
        ))}
      </aside>
      <main>
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
            <form onSubmit={async (e) => { e.preventDefault(); await window.gatewayApi.upsertDevice(deviceForm); await refresh(); }}>
              <input placeholder="Nombre" value={deviceForm.name} onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })} required />
              <input placeholder="IP" value={deviceForm.ip} onChange={(e) => setDeviceForm({ ...deviceForm, ip: e.target.value })} required />
              <input type="number" placeholder="Puerto" value={deviceForm.port} onChange={(e) => setDeviceForm({ ...deviceForm, port: Number(e.target.value) })} required />
              <select value={deviceForm.protocol} onChange={(e) => setDeviceForm({ ...deviceForm, protocol: e.target.value })}><option>http</option><option>https</option></select>
              <input placeholder="Usuario" value={deviceForm.username} onChange={(e) => setDeviceForm({ ...deviceForm, username: e.target.value })} required />
              <input type="password" placeholder="Password" value={deviceForm.password} onChange={(e) => setDeviceForm({ ...deviceForm, password: e.target.value })} required />
              <select value={deviceForm.mode} onChange={(e) => setDeviceForm({ ...deviceForm, mode: e.target.value })}><option>auto</option><option>alertStream</option><option>httpPush</option><option>polling</option></select>
              <button type="submit">Guardar</button>
            </form>
            <ul>
              {(state?.devices ?? []).map((device: any) => <li key={device.id}>{device.name} ({device.ip}) - {device.mode}</li>)}
            </ul>
          </section>
        )}

        {activeTab === 'Estado' && (
          <section>
            <h2>Estado</h2>
            <p>Queue: {state?.queueDepth ?? 0}</p>
            <p>Latencia nube: {state?.cloudLatency ?? '-'} ms</p>
            <ul>
              {(state?.statuses ?? []).map((status: any) => (
                <li key={status.deviceId}>{status.deviceId}: {status.connected ? 'Connected' : 'Disconnected'} / {status.mode}</li>
              ))}
            </ul>
          </section>
        )}

        {activeTab === 'Accesos recientes' && (
          <section>
            <h2>Últimos accesos</h2>
            <table>
              <thead><tr><th>Hora</th><th>Dispositivo</th><th>Evento</th><th>Persona</th></tr></thead>
              <tbody>
                {(state?.recentEvents ?? []).map((event: any) => (
                  <tr key={event.eventId}><td>{event.timestampGateway}</td><td>{event.deviceId}</td><td>{event.eventType}</td><td>{event.personName ?? event.personId ?? '-'}</td></tr>
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

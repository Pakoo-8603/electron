import { useEffect, useMemo, useState } from 'react';

const tabs = ['wizard', 'devices', 'status', 'recent', 'logs'] as const;
type Tab = (typeof tabs)[number];

export function App() {
  const [tab, setTab] = useState<Tab>('wizard');
  const [settings, setSettings] = useState<any>({ tenantId: '', siteId: '', backendUrl: '', backendToken: '', listenerPort: 8090 });
  const [devices, setDevices] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [logLines, setLogLines] = useState<string[]>([]);

  async function refresh() {
    setDevices(await window.gatewayApi.listDevices());
    setStatus(await window.gatewayApi.getStatus());
    setEvents(await window.gatewayApi.getRecentEvents());
  }

  useEffect(() => {
    window.gatewayApi.getSettings().then((s) => s && setSettings(s));
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  const healthColor = useMemo(() => {
    if (!status?.devices?.length) return '#eab308';
    if (status.devices.some((d: any) => d.status === 'disconnected')) return '#ef4444';
    return '#22c55e';
  }, [status]);

  return (
    <div className="layout">
      <aside>
        <h2>Gateway</h2>
        {tabs.map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </aside>
      <main>
        {tab === 'wizard' && (
          <section>
            <h3>Configuración inicial</h3>
            {['tenantId', 'siteId', 'backendUrl', 'backendToken', 'listenerPort'].map((k) => (
              <label key={k}>
                {k}
                <input value={settings[k] ?? ''} onChange={(e) => setSettings({ ...settings, [k]: e.target.value })} />
              </label>
            ))}
            <button onClick={async () => await window.gatewayApi.setSettings(settings)}>Guardar</button>
          </section>
        )}

        {tab === 'devices' && <DevicesView devices={devices} onSaved={refresh} addLog={(line) => setLogLines((p) => [line, ...p].slice(0, 500))} />}

        {tab === 'status' && (
          <section>
            <h3>Estado</h3>
            <p>
              <span style={{ color: healthColor }}>●</span> Cola: {status?.queueSize ?? 0}, Latencia nube: {status?.cloudLatencyMs ?? '-'} ms, eventos/min:{' '}
              {status?.eventsPerMin ?? 0}
            </p>
            <ul>
              {status?.devices?.map((d: any) => (
                <li key={d.deviceId}>
                  {d.deviceId}: {d.status} | último evento: {d.lastEventAt ?? '-'} | reconexiones: {d.reconnectCount}
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'recent' && (
          <section>
            <h3>Accesos recientes (200)</h3>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Dispositivo</th>
                  <th>Tipo</th>
                  <th>Persona</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.event_id}>
                    <td>{e.timestamp_device}</td>
                    <td>{e.device_id}</td>
                    <td>{e.event_type}</td>
                    <td>{e.person_name ?? e.person_id ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'logs' && (
          <section>
            <h3>Logs</h3>
            <button onClick={() => downloadLogs(logLines)}>Exportar</button>
            <pre>{logLines.join('\n')}</pre>
          </section>
        )}
      </main>
    </div>
  );
}

function DevicesView({ devices, onSaved, addLog }: { devices: any[]; onSaved: () => Promise<void>; addLog: (line: string) => void }) {
  const [form, setForm] = useState<any>({
    id: crypto.randomUUID(),
    name: '',
    host: '',
    port: 80,
    protocol: 'http',
    username: 'admin',
    password: '',
    eventMode: 'auto',
    enabled: true
  });

  return (
    <section>
      <h3>Dispositivos</h3>
      {['name', 'host', 'port', 'protocol', 'username', 'password', 'eventMode'].map((k) => (
        <label key={k}>
          {k}
          <input value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
        </label>
      ))}
      <button
        onClick={async () => {
          await window.gatewayApi.saveDevice(form);
          addLog(`Dispositivo ${form.id} guardado`);
          setForm({ ...form, id: crypto.randomUUID() });
          await onSaved();
        }}
      >
        Guardar dispositivo
      </button>
      <ul>
        {devices.map((d) => (
          <li key={d.id}>
            {d.name} ({d.host})
            <button
              onClick={async () => {
                await window.gatewayApi.deleteDevice(d.id);
                addLog(`Dispositivo ${d.id} eliminado`);
                await onSaved();
              }}
            >
              Eliminar
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function downloadLogs(lines: string[]) {
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gateway-logs-${new Date().toISOString()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

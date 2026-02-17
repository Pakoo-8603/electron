import { setInterval } from 'node:timers';

const endpoint = process.argv[2] ?? 'http://localhost:9876/hikvision/events/mock-device';

console.log(`Simulando eventos hacia ${endpoint}`);

setInterval(async () => {
  const payload = {
    event: {
      timestamp: new Date().toISOString(),
      eventType: Math.random() > 0.2 ? 'accessGranted' : 'accessDenied',
      employeeNoString: String(Math.floor(Math.random() * 10) + 1000),
      currentVerifyMode: 'face',
      doorNo: 1,
      direction: Math.random() > 0.5 ? 'in' : 'out'
    }
  };

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error('Error simulando evento', error);
  }
}, 1000);
